import {
  extractStringLiterals,
  findUserPrivateSelects,
  findViolations,
  USER_PRIVATE_TABLES,
  SKIP_FILE_BASENAMES,
} from '../check-soft-delete-filter';

// Tokenizer + audit tests for scripts/check-soft-delete-filter.ts.
//
// The audit script is the only safety net protecting the soft-delete
// migration from regressions: a single SELECT against a user-private
// table that forgets `deleted_at IS NULL` becomes a "deleted-but-visible"
// bug. These tests pin down the tokenizer's behavior on the edge cases
// that bit us during Phase 2-1a — particularly single quotes embedded
// inside backtick template strings, which a flat regex would mistake
// for string delimiters.

describe('extractStringLiterals — tokenizer', () => {
  it('extracts a simple single-quoted string', () => {
    const out = extractStringLiterals(`const x = 'hello';`);
    expect(out).toEqual(['hello']);
  });

  it('extracts a backtick template string', () => {
    const out = extractStringLiterals(`const x = \`hello\`;`);
    expect(out).toEqual(['hello']);
  });

  it('extracts a double-quoted string', () => {
    const out = extractStringLiterals(`const x = "hello";`);
    expect(out).toEqual(['hello']);
  });

  it('does NOT split a backtick string at embedded single quotes', () => {
    // This is the case that broke the naive regex during Phase 2-1a.
    // The single quotes around %' are LITERAL CONTENT inside a backtick
    // template, not delimiters of a separate string.
    const src = "const sql = `WHERE date LIKE ? || '%' AND deleted_at IS NULL`;";
    const out = extractStringLiterals(src);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("'%'");
    expect(out[0]).toContain('deleted_at');
  });

  it('handles ${...} interpolation depth correctly', () => {
    const src = 'const x = `pre${a + b} mid ${c} post`;';
    const out = extractStringLiterals(src);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe('pre${a + b} mid ${c} post');
  });

  it('treats // comments as inert', () => {
    const src = `// 'fake string in a comment'\nconst x = 'real';`;
    const out = extractStringLiterals(src);
    expect(out).toEqual(['real']);
  });

  it('treats /* */ comments as inert', () => {
    const src = `/* 'fake' */ const x = 'real';`;
    const out = extractStringLiterals(src);
    expect(out).toEqual(['real']);
  });

  it('respects escape sequences inside strings', () => {
    const src = `const x = 'with \\'escaped\\' quote';`;
    const out = extractStringLiterals(src);
    // The escape sequence content is preserved; the inner ' doesn't
    // close the string.
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('escaped');
  });

  it('extracts multiple separate strings', () => {
    const src = `const a = 'first'; const b = \`second\`; const c = "third";`;
    const out = extractStringLiterals(src);
    expect(out).toEqual(['first', 'second', 'third']);
  });
});

describe('findUserPrivateSelects', () => {
  it('finds a SELECT against a user-private table', () => {
    const src = "const sql = 'SELECT * FROM body_logs WHERE deleted_at IS NULL';";
    const out = findUserPrivateSelects(src);
    expect(out).toHaveLength(1);
    expect(out[0].table).toBe('body_logs');
  });

  it('skips SELECTs against canonical / non-private tables', () => {
    const src = "const sql = 'SELECT * FROM foods WHERE id = ?';";
    const out = findUserPrivateSelects(src);
    expect(out).toEqual([]);
  });

  it('finds multiple FROM clauses in a single string (JOIN)', () => {
    const src = `const sql = \`SELECT * FROM meal_log_items mli JOIN meal_logs ml ON mli.meal_log_id = ml.id\`;`;
    const out = findUserPrivateSelects(src);
    expect(out).toHaveLength(2);
    expect(out.map((o) => o.table).sort()).toEqual([
      'meal_log_items',
      'meal_logs',
    ]);
  });

  it('matches case-insensitively on SELECT and FROM', () => {
    const src = "const sql = 'select * from body_logs where deleted_at is null';";
    const out = findUserPrivateSelects(src);
    expect(out).toHaveLength(1);
  });
});

describe('findViolations', () => {
  it('flags a SELECT missing deleted_at', () => {
    const src = "const sql = 'SELECT * FROM body_logs WHERE id = ?';";
    const v = findViolations('myRepo.ts', src);
    expect(v).toHaveLength(1);
    expect(v[0].table).toBe('body_logs');
    expect(v[0].file).toBe('myRepo.ts');
  });

  it('passes a SELECT that includes deleted_at filter', () => {
    const src =
      "const sql = 'SELECT * FROM body_logs WHERE id = ? AND deleted_at IS NULL';";
    const v = findViolations('myRepo.ts', src);
    expect(v).toEqual([]);
  });

  it('passes a JOIN where each alias filters deleted_at', () => {
    const src = `const sql = \`SELECT *
      FROM meal_log_items mli
      JOIN meal_logs ml ON mli.meal_log_id = ml.id
      WHERE ml.deleted_at IS NULL AND mli.deleted_at IS NULL\`;`;
    const v = findViolations('myRepo.ts', src);
    expect(v).toEqual([]);
  });

  it('skips files in SKIP_FILE_BASENAMES', () => {
    const src = "const sql = 'SELECT * FROM body_logs WHERE id = ?';";
    // Pretend this is the userSubmittedFoodRepository
    const v = findViolations('userSubmittedFoodRepository.ts', src);
    expect(v).toEqual([]);
  });

  it('survives the Phase 2-1a edge case: backtick string with embedded single-quoted SQL literal', () => {
    // This is the exact shape that broke the naive regex.
    const src = `const sql = \`SELECT DISTINCT date FROM meal_logs
      WHERE profile_id = ? AND date LIKE ? || '%' AND deleted_at IS NULL
      ORDER BY date\`;`;
    const v = findViolations('nutritionRepository.ts', src);
    expect(v).toEqual([]);
  });
});

describe('USER_PRIVATE_TABLES — invariant', () => {
  it('matches the v23 migration list + Build 15 additions', () => {
    // 18 tables from v23 + 1 added in Build 15 Session 6 / v26
    // (estimated_1rm) = 19 total.
    expect(USER_PRIVATE_TABLES.size).toBe(19);
    expect(USER_PRIVATE_TABLES.has('profiles')).toBe(true);
    expect(USER_PRIVATE_TABLES.has('workout_sets')).toBe(true);
    expect(USER_PRIVATE_TABLES.has('progress_photos')).toBe(true);
    expect(USER_PRIVATE_TABLES.has('estimated_1rm')).toBe(true);
    // Sync-managed-elsewhere tables MUST NOT be in the user-private set
    expect(USER_PRIVATE_TABLES.has('user_submitted_foods')).toBe(false);
    // Local-only-by-design tables MUST NOT be in the set
    expect(USER_PRIVATE_TABLES.has('user_consents')).toBe(false);
    expect(USER_PRIVATE_TABLES.has('user_badges')).toBe(false);
  });
});

describe('SKIP_FILE_BASENAMES — invariant', () => {
  it('skips repos that intentionally bypass the tombstone filter', () => {
    expect(SKIP_FILE_BASENAMES.has('userSubmittedFoodRepository.ts')).toBe(true);
    expect(SKIP_FILE_BASENAMES.has('syncRepository.ts')).toBe(true);
    expect(SKIP_FILE_BASENAMES.has('foodRepository.ts')).toBe(true);
    // Repos in scope must NOT be in the skip list
    expect(SKIP_FILE_BASENAMES.has('bodyLogRepository.ts')).toBe(false);
    expect(SKIP_FILE_BASENAMES.has('workoutRepository.ts')).toBe(false);
  });
});
