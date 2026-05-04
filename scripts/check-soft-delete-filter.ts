/**
 * Soft-delete filter audit script.
 *
 * Walks every repository file under src/infra/repositories/ and looks for
 * SQL SELECT statements against user-private tables that don't include
 * a `deleted_at IS NULL` filter somewhere in the same SQL string.
 *
 * Run with:
 *   tsx scripts/check-soft-delete-filter.ts
 *
 * Exits 0 when clean, 1 when violations found.
 */

import * as fs from 'fs';
import * as path from 'path';

// User-private tables that participate in cloud sync. Lifted from
// src/infra/database/migrations/v23.ts USER_PRIVATE_TABLES — keep them
// in lockstep when adding new sync resources.
export const USER_PRIVATE_TABLES = new Set<string>([
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

// Repos that intentionally manage tombstones internally (sync infra,
// repos for tables not in the user-private set, etc.).
export const SKIP_FILE_BASENAMES = new Set<string>([
  'userSubmittedFoodRepository.ts',
  'userBadgeRepository.ts',
  'userConsentRepository.ts',
  'barcodeFoodRepository.ts',
  'syncRepository.ts',
  'syncWatermarkRepository.ts',
  'foodRepository.ts',
]);

export interface Violation {
  file: string;
  table: string;
  sqlPreview: string;
}

// Extract every string literal (template, single-quoted, double-quoted)
// from a TS source file. Handles:
//   - // and /* */ comments (skipped)
//   - escape sequences inside string content
//   - ${...} interpolation inside template strings — depth-tracked so
//     backticks/quotes inside the interpolation don't confuse the parser
export function extractStringLiterals(content: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < content.length) {
    const c = content[i];

    // // line comment
    if (c === '/' && content[i + 1] === '/') {
      while (i < content.length && content[i] !== '\n') i++;
      continue;
    }
    // /* block comment */
    if (c === '/' && content[i + 1] === '*') {
      i += 2;
      while (i < content.length - 1) {
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
      i++;
      let str = '';
      while (i < content.length && content[i] !== delim) {
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
      if (str.length > 0) out.push(str);
      i++; // skip closing delimiter
      continue;
    }

    i++;
  }
  return out;
}

export function findUserPrivateSelects(content: string): Array<{
  table: string;
  sql: string;
}> {
  const out: Array<{ table: string; sql: string }> = [];
  const literals = extractStringLiterals(content);
  for (const sql of literals) {
    if (!/\bSELECT\b/i.test(sql)) continue;
    // Match every FROM <table> AND every JOIN <table> (any kind of JOIN —
    // INNER, LEFT, RIGHT, OUTER, CROSS). User-private tables must be
    // filtered for deleted_at no matter how they're referenced.
    const tableRegex = /\b(?:FROM|JOIN)\s+(\w+)/gi;
    let tableMatch: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((tableMatch = tableRegex.exec(sql)) !== null) {
      const table = tableMatch[1].toLowerCase();
      if (seen.has(table)) continue;
      seen.add(table);
      if (USER_PRIVATE_TABLES.has(table)) {
        out.push({ table, sql });
      }
    }
  }
  return out;
}

export function findViolations(
  fileBasename: string,
  content: string,
): Violation[] {
  if (SKIP_FILE_BASENAMES.has(fileBasename)) return [];
  const violations: Violation[] = [];
  const selects = findUserPrivateSelects(content);
  for (const { table, sql } of selects) {
    if (/deleted_at/i.test(sql)) continue;
    violations.push({
      file: fileBasename,
      table,
      sqlPreview: sql.replace(/\s+/g, ' ').trim().slice(0, 180),
    });
  }
  return violations;
}

function main(): void {
  const repoDir = path.resolve(__dirname, '..', 'src', 'infra', 'repositories');
  const files = fs
    .readdirSync(repoDir)
    .filter(
      (f) =>
        f.endsWith('.ts') &&
        !f.endsWith('.test.ts') &&
        !SKIP_FILE_BASENAMES.has(f),
    );

  const violations: Violation[] = [];
  for (const file of files) {
    const fullPath = path.join(repoDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    violations.push(...findViolations(file, content));
  }

  if (violations.length === 0) {
    console.log('soft-delete filter audit: PASS');
    console.log(
      `  ${files.length} repository files scanned; all user-private SELECTs reference deleted_at.`,
    );
    process.exit(0);
  }

  console.error(`soft-delete filter audit: FAIL — ${violations.length} violation(s)`);
  for (const v of violations) {
    console.error(`\n  ${v.file}: SELECT FROM ${v.table}`);
    console.error(`    ${v.sqlPreview}`);
  }
  console.error(
    '\nAdd `WHERE deleted_at IS NULL` (or AND-extend an existing WHERE) to each violating query.',
  );
  process.exit(1);
}

// Only run main when invoked directly (not when imported by tests).
// In tsx, require.main === module; in jest, this comparison is false.
if (require.main === module) {
  main();
}
