import {
  extractSqlLiterals,
  findWritesInSql,
  violatesEnqueueContract,
  USER_PRIVATE_TABLES,
  SKIP_FILE_BASENAMES,
  type WriteStatement,
} from '../check-enqueue-sync';

// Tokenizer + audit tests for scripts/check-enqueue-sync.ts.
//
// This audit is the only safety net against forgetting an enqueueSync
// hook on a write to a user-private table. Missing the hook means
// local edits never reach the cloud-sync layer — silent data loss
// across devices. These tests pin down the parts of the script that
// would mask such a regression: the tokenizer must track endLine
// correctly so that multi-line INSERTs (meal_log_items has 31
// columns + 33-line values array) don't push the matching enqueue
// past the lookahead window, and the contract check must honor the
// `// sync-skip:` opt-out without becoming a free pass.

describe('extractSqlLiterals — tokenizer', () => {
  it('captures startLine and endLine for a single-line string', () => {
    const out = extractSqlLiterals(`const x = 'hello';`);
    expect(out).toHaveLength(1);
    expect(out[0].sql).toBe('hello');
    expect(out[0].startLine).toBe(1);
    expect(out[0].endLine).toBe(1);
  });

  it('captures separate startLine and endLine for a multi-line backtick string', () => {
    const src = [
      'const sql = `INSERT INTO body_logs',
      '  (id, profile_id)',
      '  VALUES (?, ?)`;',
    ].join('\n');
    const out = extractSqlLiterals(src);
    expect(out).toHaveLength(1);
    expect(out[0].startLine).toBe(1);
    expect(out[0].endLine).toBe(3);
  });

  it('does NOT split a backtick string at embedded single quotes', () => {
    // Same Phase 2-1a edge case as the soft-delete audit.
    const src = "const sql = `WHERE date LIKE ? || '%' AND deleted_at IS NULL`;";
    const out = extractSqlLiterals(src);
    expect(out).toHaveLength(1);
    expect(out[0].sql).toContain("'%'");
  });

  it('handles ${...} interpolation depth correctly', () => {
    const src = 'const x = `pre${a + b} mid ${c} post`;';
    const out = extractSqlLiterals(src);
    expect(out).toHaveLength(1);
    expect(out[0].sql).toBe('pre${a + b} mid ${c} post');
  });

  it('treats // comments as inert', () => {
    const src = `// 'fake' INSERT INTO body_logs\nconst x = 'real';`;
    const out = extractSqlLiterals(src);
    expect(out).toEqual([
      expect.objectContaining({ sql: 'real' }),
    ]);
  });

  it('treats /* */ comments as inert and tracks line count through them', () => {
    const src = `/* line 1\nline 2 */\nconst x = 'real';`;
    const out = extractSqlLiterals(src);
    expect(out).toHaveLength(1);
    expect(out[0].sql).toBe('real');
    expect(out[0].startLine).toBe(3);
  });
});

describe('findWritesInSql', () => {
  const at = (sql: string, line: number = 1) => [
    { sql, startLine: line, endLine: line },
  ];

  it('detects INSERT INTO on a user-private table', () => {
    const out = findWritesInSql(at('INSERT INTO body_logs (id) VALUES (?)'));
    expect(out).toHaveLength(1);
    expect(out[0].operation).toBe('INSERT');
    expect(out[0].table).toBe('body_logs');
  });

  it('detects UPDATE on a user-private table', () => {
    const out = findWritesInSql(at('UPDATE workout_sessions SET note = ? WHERE id = ?'));
    expect(out).toHaveLength(1);
    expect(out[0].operation).toBe('UPDATE');
    expect(out[0].table).toBe('workout_sessions');
  });

  it('detects DELETE FROM on a user-private table', () => {
    const out = findWritesInSql(at('DELETE FROM dish_ingredients WHERE dish_id = ?'));
    expect(out).toHaveLength(1);
    expect(out[0].operation).toBe('DELETE');
    expect(out[0].table).toBe('dish_ingredients');
  });

  it('skips writes against canonical / non-private tables', () => {
    const out = findWritesInSql(at('INSERT INTO foods (id) VALUES (?)'));
    expect(out).toEqual([]);
  });

  it('matches case-insensitively', () => {
    const out = findWritesInSql(at('insert into body_logs (id) values (?)'));
    expect(out).toHaveLength(1);
    expect(out[0].operation).toBe('INSERT');
  });

  it('finds multiple writes inside one SQL string', () => {
    const out = findWritesInSql(
      at('INSERT INTO body_logs (id) VALUES (?); UPDATE notes SET title = ?'),
    );
    expect(out.map((w) => w.table).sort()).toEqual(['body_logs', 'notes']);
  });
});

describe('violatesEnqueueContract', () => {
  const writeAt = (line: number, table: string = 'body_logs'): WriteStatement => ({
    operation: 'INSERT',
    table,
    startLine: line,
    endLine: line,
    preview: '',
  });

  it('passes when enqueueRowFromTable follows the write', () => {
    const src = [
      `await db.runAsync('INSERT INTO body_logs ...');`,
      `await enqueueRowFromTable('body_logs', id, 'INSERT');`,
    ].join('\n');
    expect(violatesEnqueueContract(src, writeAt(1))).toBe(false);
  });

  it('passes when enqueueSync follows the write', () => {
    const src = [
      `await db.runAsync('INSERT INTO body_logs ...');`,
      `await enqueueSync('body_logs', id, 'INSERT', row);`,
    ].join('\n');
    expect(violatesEnqueueContract(src, writeAt(1))).toBe(false);
  });

  it('passes when `// sync-skip:` follows the write', () => {
    const src = [
      `await db.runAsync('INSERT INTO body_logs ...');`,
      `// sync-skip: AI-only path, never syncs.`,
    ].join('\n');
    expect(violatesEnqueueContract(src, writeAt(1))).toBe(false);
  });

  it('fails when neither enqueue nor sync-skip follows', () => {
    const src = [
      `await db.runAsync('INSERT INTO body_logs ...');`,
      `return result;`,
    ].join('\n');
    expect(violatesEnqueueContract(src, writeAt(1))).toBe(true);
  });

  it('fails when the enqueue mentions a different table than the write', () => {
    const src = [
      `await db.runAsync('INSERT INTO body_logs ...');`,
      `await enqueueRowFromTable('notes', id, 'INSERT');`,
    ].join('\n');
    expect(violatesEnqueueContract(src, writeAt(1))).toBe(true);
  });

  it('fails when the enqueue is past the lookahead window', () => {
    // The window is anchored at endLine; LOOKAHEAD_LINES is 60.
    // Place the enqueue 70 lines past endLine and confirm it's flagged.
    const filler = Array(70).fill('// noise').join('\n');
    const src = [
      `await db.runAsync('INSERT INTO body_logs ...');`,
      filler,
      `await enqueueRowFromTable('body_logs', id, 'INSERT');`,
    ].join('\n');
    expect(violatesEnqueueContract(src, writeAt(1))).toBe(true);
  });

  it('passes when the enqueue is within the lookahead window of a multi-line INSERT', () => {
    // Reproduces the meal_log_items shape: SQL endLine far from
    // the start, then a long values array, then the enqueue.
    // Anchoring at endLine (not startLine) is what makes this pass.
    const valuesArray = Array(33).fill('  item.field,').join('\n');
    const src = [
      `await db.runAsync(`,
      `  \`INSERT INTO meal_log_items (`,           // startLine
      `    id, meal_log_id, food_id, food_name,`,
      `    serving_amount, serving_unit, calories,`,
      `    protein_g, fat_g, carb_g, fiber_g,`,
      `    sodium_mg, calcium_mg, iron_mg`,
      `  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`,`,  // endLine = 8
      `  [`,
      valuesArray,
      `  ]`,
      `);`,
      `await enqueueRowFromTable('meal_log_items', newId, 'INSERT');`,
    ].join('\n');
    const write: WriteStatement = {
      operation: 'INSERT',
      table: 'meal_log_items',
      startLine: 2,
      endLine: 8,
      preview: '',
    };
    expect(violatesEnqueueContract(src, write)).toBe(false);
  });

  it('matches sync-skip with flexible whitespace and case', () => {
    const src = [
      `await db.runAsync('INSERT INTO body_logs ...');`,
      `//   Sync-Skip:   regen pattern`,
    ].join('\n');
    expect(violatesEnqueueContract(src, writeAt(1))).toBe(false);
  });
});

describe('USER_PRIVATE_TABLES — invariant', () => {
  it('matches the resource-sync registry list (19 tables)', () => {
    // Same set as the v23 migration / soft-delete audit. Must
    // be the union of every table with a per-resource sync module.
    // Build 15 Session 6 / v26 added estimated_1rm → 19 total.
    expect(USER_PRIVATE_TABLES.size).toBe(19);
    expect(USER_PRIVATE_TABLES.has('profiles')).toBe(true);
    expect(USER_PRIVATE_TABLES.has('exercises')).toBe(true);
    expect(USER_PRIVATE_TABLES.has('workout_sets')).toBe(true);
    expect(USER_PRIVATE_TABLES.has('dish_ingredients')).toBe(true);
    expect(USER_PRIVATE_TABLES.has('estimated_1rm')).toBe(true);
    // Foods table is canonical (not user-private)
    expect(USER_PRIVATE_TABLES.has('foods')).toBe(false);
  });
});

describe('SKIP_FILE_BASENAMES — invariant', () => {
  it('skips repos that intentionally never enqueue', () => {
    // syncRepository.ts is the enqueue helper itself; auditing
    // it would loop on the helper's own SQL.
    expect(SKIP_FILE_BASENAMES.has('syncRepository.ts')).toBe(true);
    expect(SKIP_FILE_BASENAMES.has('foodRepository.ts')).toBe(true);
    expect(SKIP_FILE_BASENAMES.has('userSubmittedFoodRepository.ts')).toBe(true);
    // Repos in scope must NOT be in the skip list
    expect(SKIP_FILE_BASENAMES.has('bodyLogRepository.ts')).toBe(false);
    expect(SKIP_FILE_BASENAMES.has('dishRepository.ts')).toBe(false);
    expect(SKIP_FILE_BASENAMES.has('workoutRepository.ts')).toBe(false);
  });
});
