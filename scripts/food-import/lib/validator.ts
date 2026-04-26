import { ImportedFoodRow, ValidatedRow, ValidationIssue } from './types';

// Atwater factors for the PFC↔calories consistency check.
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARB = 4;
const KCAL_PER_G_FAT = 9;

// 15% tolerance is what the spec calls for. Real labels routinely
// disagree by 5–10% (rounding + dietary fiber accounting), so we only
// flag at >15%. Rows above the threshold fail closed (error).
const PFC_TOLERANCE = 0.15;

// Per-serving sanity ceilings. These are deliberately generous — we
// want to catch unit-scale mistakes (mg → g typos, per-100g values
// pasted into per-serving fields) rather than legitimate outliers.
const MAX_PROTEIN_G_PER_SERVING = 100;
const MAX_FAT_G_PER_SERVING = 200;
const MAX_CARB_G_PER_SERVING = 500;
const MAX_CALORIES_PER_SERVING = 3000;
const MAX_SERVING_G = 5000;

export function validateRow(row: ImportedFoodRow): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // --- required fields ---
  if (!row.nameJa?.trim()) issues.push(err('missing_name', 'nameJa is empty'));
  if (!row.sourceUrl?.trim()) issues.push(err('missing_source_url', 'sourceUrl is empty'));
  if (!row.capturedAt?.match(/^\d{4}-\d{2}-\d{2}$/)) {
    issues.push(err('bad_captured_at', `capturedAt "${row.capturedAt}" is not YYYY-MM-DD`));
  }

  // --- non-negative numerics ---
  for (const [key, val] of Object.entries({
    servingG: row.servingG,
    caloriesKcal: row.caloriesKcal,
    proteinG: row.proteinG,
    fatG: row.fatG,
    carbG: row.carbG,
  })) {
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      issues.push(err('not_a_number', `${key} is not a finite number (got ${String(val)})`));
    } else if (val < 0) {
      issues.push(err('negative_value', `${key} is negative (${val})`));
    }
  }

  // --- range / outlier checks (warnings, not errors) ---
  if (row.servingG > MAX_SERVING_G) {
    issues.push(warn('serving_too_large', `servingG=${row.servingG} > ${MAX_SERVING_G}`));
  }
  if (row.proteinG > MAX_PROTEIN_G_PER_SERVING) {
    issues.push(warn('protein_outlier', `proteinG=${row.proteinG} > ${MAX_PROTEIN_G_PER_SERVING}`));
  }
  if (row.fatG > MAX_FAT_G_PER_SERVING) {
    issues.push(warn('fat_outlier', `fatG=${row.fatG} > ${MAX_FAT_G_PER_SERVING}`));
  }
  if (row.carbG > MAX_CARB_G_PER_SERVING) {
    issues.push(warn('carb_outlier', `carbG=${row.carbG} > ${MAX_CARB_G_PER_SERVING}`));
  }
  if (row.caloriesKcal > MAX_CALORIES_PER_SERVING) {
    issues.push(
      warn('calories_outlier', `caloriesKcal=${row.caloriesKcal} > ${MAX_CALORIES_PER_SERVING}`),
    );
  }

  // --- PFC consistency (Atwater) ---
  // Skip when calories=0 (water, spices in MEXT) to avoid div-by-zero,
  // and when any macro is non-finite (already flagged above).
  if (
    row.caloriesKcal > 0 &&
    Number.isFinite(row.proteinG) &&
    Number.isFinite(row.carbG) &&
    Number.isFinite(row.fatG)
  ) {
    const computed =
      row.proteinG * KCAL_PER_G_PROTEIN +
      row.carbG * KCAL_PER_G_CARB +
      row.fatG * KCAL_PER_G_FAT;
    const deviation = Math.abs(row.caloriesKcal - computed) / row.caloriesKcal;
    if (deviation > PFC_TOLERANCE) {
      issues.push(
        err(
          'pfc_inconsistent',
          `calories=${row.caloriesKcal} vs computed=${computed.toFixed(1)} ` +
            `(deviation ${(deviation * 100).toFixed(1)}% > ${(PFC_TOLERANCE * 100).toFixed(0)}%)`,
        ),
      );
    }
  }

  return issues;
}

export function validateAll(rows: ImportedFoodRow[]): ValidatedRow[] {
  return rows.map((row) => ({ row, issues: validateRow(row) }));
}

export interface ValidationSummary {
  total: number;
  ok: number;
  warnings: number;
  errors: number;
}

export function summarize(results: ValidatedRow[]): ValidationSummary {
  let ok = 0;
  let warnings = 0;
  let errors = 0;
  for (const r of results) {
    const hasError = r.issues.some((i) => i.level === 'error');
    const hasWarning = r.issues.some((i) => i.level === 'warning');
    if (hasError) errors++;
    else if (hasWarning) warnings++;
    else ok++;
  }
  return { total: results.length, ok, warnings, errors };
}

function err(code: string, message: string): ValidationIssue {
  return { level: 'error', code, message };
}
function warn(code: string, message: string): ValidationIssue {
  return { level: 'warning', code, message };
}
