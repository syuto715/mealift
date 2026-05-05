/**
 * Enqueue-sync audit.
 *
 * Walks every repository file and verifies that every INSERT INTO /
 * UPDATE / DELETE FROM statement against a user-private table is
 * followed within a small lookahead window by either:
 *   - a call to enqueueRowFromTable / enqueueSync that mentions
 *     the same table name, or
 *   - a `// sync-skip: <reason>` comment that explicitly opts out.
 *
 * Run with:
 *   tsx scripts/check-enqueue-sync.ts
 *
 * Exits 0 on PASS, 1 on FAIL.
 *
 * Why this matters: missing an enqueue site means writes never reach
 * the cloud-sync layer — local edits silently fail to sync. The audit
 * is the only safety net for the ~40 manual hook insertions made in
 * Phase 6-A through 6-D, since the affected repositories don't have
 * existing test scaffolding (same situation as Phase 2-1d).
 *
 * Implementation note: uses the same tokenizer as
 * check-soft-delete-filter.ts (handles backtick template strings,
 * single/double quoted strings, comments, ${...} interpolation depth)
 * so that SQL appearing inside JS-level comments doesn't false-positive.
 */

import * as fs from 'fs';
import * as path from 'path';

const USER_PRIVATE_TABLES = new Set<string>([
  'profiles',
  'body_logs',
  'workout_routines',
  'workout_routine_items',
  'workout_sessions',
  'workout_sets',
  'meal_logs',
  'meal_log_items',
  'meal_templates',
  'notes',
  'dishes',
  'dish_ingredients',
  'personal_records',
  'water_logs',
  'adaptive_goal_suggestions',
  'weekly_reports',
  'progress_photos',
  'exercises',
]);

const SKIP_FILE_BASENAMES = new Set<string>([
  'userSubmittedFoodRepository.ts',
  'userBadgeRepository.ts',
  'userConsentRepository.ts',
  'barcodeFoodRepository.ts',
  'syncRepository.ts',
  'syncWatermarkRepository.ts',
  'foodRepository.ts',
]);

// How many source lines after a write statement to scan for the
// matching enqueue call. Must be wide enough for the worst-case
// pattern (meal_log_items INSERT: 10-line SQL + 33-line values
// array + enqueue ⇒ ~45 lines from endLine) plus a buffer for
// cascade flows (deleteRoutine: 2 UPDATEs + SELECT-id loop +
// 2 enqueue blocks). Anchored at SQL endLine, so the window is
// measured from the closing backtick, not from `INSERT INTO`.
const LOOKAHEAD_LINES = 60;

const REPO_DIR = path.resolve(__dirname, '..', 'src', 'infra', 'repositories');

interface Violation {
  file: string;
  line: number;
  operation: string;
  table: string;
  preview: string;
}

// Locate every SQL string literal in the source and remember the line
// each was found on. Skips JS-level comments so SQL written in a doc
// block doesn't trigger false positives. endLine is the closing-delim
// line; the enqueue lookahead anchors here so that multi-line INSERT
// statements with 30+ column lists don't push the enqueue out of the
// scan window.
interface SqlMatch {
  sql: string;
  startLine: number;
  endLine: number;
}

function extractSqlLiterals(content: string): SqlMatch[] {
  const out: SqlMatch[] = [];
  let i = 0;
  let line = 1;
  while (i < content.length) {
    const c = content[i];
    if (c === '\n') {
      line++;
      i++;
      continue;
    }

    // // line comment
    if (c === '/' && content[i + 1] === '/') {
      while (i < content.length && content[i] !== '\n') i++;
      continue;
    }
    // /* block comment */
    if (c === '/' && content[i + 1] === '*') {
      i += 2;
      while (i < content.length - 1) {
        if (content[i] === '\n') line++;
        if (content[i] === '*' && content[i + 1] === '/') {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }

    if (c === '`' || c === "'" || c === '"') {
      const delim = c;
      const startLine = line;
      i++;
      let str = '';
      while (i < content.length && content[i] !== delim) {
        if (content[i] === '\n') line++;
        if (content[i] === '\\') {
          str += content[i];
          if (i + 1 < content.length) str += content[i + 1];
          i += 2;
          continue;
        }
        if (
          delim === '`' &&
          content[i] === '$' &&
          content[i + 1] === '{'
        ) {
          let depth = 1;
          i += 2;
          str += '${';
          while (i < content.length && depth > 0) {
            if (content[i] === '\n') line++;
            const ch = content[i];
            if (ch === '{') depth++;
            else if (ch === '}') {
              depth--;
              if (depth === 0) {
                str += '}';
                i++;
                break;
              }
            }
            str += ch;
            i++;
          }
          continue;
        }
        str += content[i];
        i++;
      }
      if (str.length > 0) {
        out.push({ sql: str, startLine, endLine: line });
      }
      i++;
      continue;
    }

    i++;
  }
  return out;
}

interface WriteStatement {
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  startLine: number;
  endLine: number;
  preview: string;
}

function findWritesInSql(matches: SqlMatch[]): WriteStatement[] {
  const out: WriteStatement[] = [];
  for (const { sql, startLine, endLine } of matches) {
    const writeRegex =
      /\b(INSERT INTO|UPDATE|DELETE FROM)\s+(\w+)/gi;
    let m: RegExpExecArray | null;
    while ((m = writeRegex.exec(sql)) !== null) {
      const opRaw = m[1].toUpperCase();
      const operation: WriteStatement['operation'] = opRaw.startsWith(
        'INSERT',
      )
        ? 'INSERT'
        : opRaw.startsWith('UPDATE')
          ? 'UPDATE'
          : 'DELETE';
      const table = m[2].toLowerCase();
      if (!USER_PRIVATE_TABLES.has(table)) continue;
      out.push({
        operation,
        table,
        startLine,
        endLine,
        preview: sql.replace(/\s+/g, ' ').trim().slice(0, 120),
      });
    }
  }
  return out;
}

function violatesEnqueueContract(
  content: string,
  write: WriteStatement,
): boolean {
  const lines = content.split('\n');
  // Anchor the lookahead at the SQL's CLOSING delimiter — multi-line
  // INSERTs (meal_log_items has 31 columns, ~10 lines of SQL + a
  // similarly-long values array) push the matching enqueue well past
  // the 30-line window if anchored at the SQL's start.
  const start = write.endLine - 1; // 0-indexed
  const end = Math.min(lines.length, start + LOOKAHEAD_LINES);
  const window = lines.slice(start, end).join('\n');

  // Honored opt-out comment.
  if (/\/\/\s*sync-skip:/i.test(window)) return false;

  // Enqueue call mentioning this table.
  const enqueueRegex = new RegExp(
    `(enqueueRowFromTable|enqueueSync)\\(\\s*['"]${write.table}['"]`,
  );
  if (enqueueRegex.test(window)) return false;

  return true;
}

function auditFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const matches = extractSqlLiterals(content);
  const writes = findWritesInSql(matches);
  const violations: Violation[] = [];
  for (const w of writes) {
    if (violatesEnqueueContract(content, w)) {
      violations.push({
        file: path.basename(filePath),
        line: w.startLine,
        operation: w.operation,
        table: w.table,
        preview: w.preview,
      });
    }
  }
  return violations;
}

function main(): void {
  const files = fs
    .readdirSync(REPO_DIR)
    .filter(
      (f) =>
        f.endsWith('.ts') &&
        !f.endsWith('.test.ts') &&
        !SKIP_FILE_BASENAMES.has(f),
    );

  const violations: Violation[] = [];
  for (const file of files) {
    violations.push(...auditFile(path.join(REPO_DIR, file)));
  }

  if (violations.length === 0) {
    console.log('enqueue-sync audit: PASS');
    console.log(
      `  ${files.length} repository files scanned; every user-private write follows with enqueue or sync-skip.`,
    );
    process.exit(0);
  }

  console.error(
    `enqueue-sync audit: FAIL — ${violations.length} violation(s)`,
  );
  for (const v of violations) {
    console.error(
      `\n  ${v.file}:${v.line}  ${v.operation} ${v.table}\n    ${v.preview}`,
    );
  }
  console.error(
    '\nAdd `await enqueueRowFromTable(<table>, <id>, <op>)` after the SQL,\n' +
      'or annotate the line with `// sync-skip: <reason>` if the write is\n' +
      'intentionally local-only (e.g. AI-only dishes, regen patterns).',
  );
  process.exit(1);
}

if (require.main === module) {
  main();
}

// Exports for jest tests.
export {
  USER_PRIVATE_TABLES,
  SKIP_FILE_BASENAMES,
  extractSqlLiterals,
  findWritesInSql,
  violatesEnqueueContract,
  auditFile,
};
export type { Violation, WriteStatement, SqlMatch };
