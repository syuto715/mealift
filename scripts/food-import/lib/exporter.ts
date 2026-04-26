import * as fs from 'fs';
import * as path from 'path';
import { ValidatedRow } from './types';

const COLUMNS = [
  'name_ja',
  'name_en',
  'brand',
  'serving_g',
  'serving_description',
  'calories_kcal',
  'protein_g',
  'fat_g',
  'carb_g',
  'fiber_g',
  'salt_g',
  'sodium_mg',
  'saturated_fat_g',
  'sugar_g',
  'source_url',
  'source_license',
  'captured_at',
  'notes',
  'validation_status', // 'ok' | 'warn' | 'error'
  'validation_issues', // semicolon-separated "code:message"
] as const;

export interface ExportOptions {
  outputPath: string;
  // If true, write only rows that have no errors (warnings allowed).
  // Default: false — review CSVs include everything so reviewers can
  // see the failures in context.
  okOnly?: boolean;
}

export interface ExportResult {
  written: number;
  skipped: number;
}

export function writeReviewCsv(results: ValidatedRow[], opts: ExportOptions): ExportResult {
  const filtered = opts.okOnly
    ? results.filter((r) => r.issues.every((i) => i.level !== 'error'))
    : results;

  const lines: string[] = [];
  lines.push(COLUMNS.join(','));

  for (const r of filtered) {
    const row = r.row;
    const status = r.issues.some((i) => i.level === 'error')
      ? 'error'
      : r.issues.some((i) => i.level === 'warning')
        ? 'warn'
        : 'ok';
    const issuesCol = r.issues.map((i) => `${i.code}:${i.message}`).join('; ');
    const cells: unknown[] = [
      row.nameJa,
      row.nameEn ?? '',
      row.brand ?? '',
      row.servingG,
      row.servingDescription ?? '',
      row.caloriesKcal,
      row.proteinG,
      row.fatG,
      row.carbG,
      row.fiberG ?? '',
      row.saltG ?? '',
      row.sodiumMg ?? '',
      row.saturatedFatG ?? '',
      row.sugarG ?? '',
      row.sourceUrl,
      row.sourceLicense,
      row.capturedAt,
      row.notes ?? '',
      status,
      issuesCol,
    ];
    lines.push(cells.map(csvCell).join(','));
  }

  fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });
  fs.writeFileSync(opts.outputPath, lines.join('\n') + '\n', 'utf-8');

  return {
    written: filtered.length,
    skipped: results.length - filtered.length,
  };
}

// RFC 4180-ish quoting: wrap in double quotes if the cell contains a
// comma, quote, or line break; double up internal quotes.
function csvCell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (s === '') return '';
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
