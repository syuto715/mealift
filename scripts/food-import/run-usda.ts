import * as fs from 'fs';
import * as path from 'path';
import { validateAll, summarize } from './lib/validator';
import { writeReviewCsv } from './lib/exporter';
import {
  mapFdcFoodsToImportedRows,
  type FdcFoodRecord,
  type FdcFilterOptions,
  type FdcMapOptions,
} from './adapters/usda-fdc';

// USDA FoodData Central importer.
//
// Usage:
//   tsx scripts/food-import/run-usda.ts <fdc-json-path> [--limit N]
//   npm run import-usda -- ./scripts/food-import/data/branded.json
//
// Inputs:
//   - The FDC JSON dump. Download from
//     https://fdc.nal.usda.gov/download-datasets.html — pick the
//     "Branded Foods" download for protein-focused work, or
//     "Foundation Foods" for analytical composition. The expected
//     top-level shape is { BrandedFoods: [...] } (Branded) or
//     { FoundationFoods: [...] } (Foundation) or { SRLegacyFoods: [...] }.
//
//   - scripts/food-import/data/brand-i18n.json — optional EN→JA brand
//     mapping. Loaded automatically; missing file is fine.
//
// Outputs:
//   - scripts/food-import/data/usda-fdc-review.csv — one row per
//     imported food + a `validation_status` column for the reviewer.
//
// What this script does NOT do:
//   - It does not write to the SQLite or Supabase databases. The CSV
//     is the deliverable; promotion into the seed step is a follow-up
//     once a sample has been reviewed by a human.
//   - It does not call Gemini or any LLM. FDC data is structured —
//     no extraction needed.

const ARG_LIMIT_FLAG = '--limit';

interface CliArgs {
  inputPath: string;
  limit: number | null;
  minProteinPer100g: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  let inputPath: string | null = null;
  let limit: number | null = null;
  let minProteinPer100g = 15;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === ARG_LIMIT_FLAG) {
      const v = args[++i];
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--limit expects a positive integer, got "${v}"`);
      }
      limit = Math.floor(n);
    } else if (a.startsWith('--min-protein=')) {
      const n = Number(a.split('=')[1]);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`--min-protein expects a non-negative number`);
      }
      minProteinPer100g = n;
    } else if (!inputPath) {
      inputPath = a;
    }
  }

  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/food-import/run-usda.ts <fdc-json-path> [--limit N] [--min-protein=15]',
    );
  }
  return { inputPath, limit, minProteinPer100g };
}

function loadFdcRecords(filePath: string): FdcFoodRecord[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);

  // FDC dumps wrap their records in one of a handful of top-level keys.
  // Accept any of them; also accept a bare array (custom-trimmed dumps).
  if (Array.isArray(parsed)) return parsed as FdcFoodRecord[];
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    for (const key of [
      'BrandedFoods',
      'FoundationFoods',
      'SRLegacyFoods',
      'SurveyFoods',
      'foods',
    ]) {
      const v = obj[key];
      if (Array.isArray(v)) return v as FdcFoodRecord[];
    }
  }
  throw new Error(
    'Could not find a foods array in the FDC JSON. Expected one of: ' +
      'BrandedFoods, FoundationFoods, SRLegacyFoods, SurveyFoods, foods, ' +
      'or a top-level array.',
  );
}

function loadBrandI18n(): Record<string, string> | undefined {
  const p = path.resolve(__dirname, 'data', 'brand-i18n.json');
  if (!fs.existsSync(p)) return undefined;
  const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' && k !== '_meta') out[k] = v;
  }
  return out;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const { inputPath, limit, minProteinPer100g } = parseArgs(process.argv);
  const absInput = path.resolve(inputPath);

  console.log('USDA FoodData Central import');
  console.log('============================');
  console.log(`Input:  ${absInput}`);
  console.log(`Limit:  ${limit ?? '(none)'}`);
  console.log(`Min protein: ${minProteinPer100g} g/100g`);

  console.log('\n[1/4] Loading FDC dump...');
  const records = loadFdcRecords(absInput);
  console.log(`  Loaded ${records.length} records`);

  console.log('\n[2/4] Filtering & mapping...');
  const brandI18n = loadBrandI18n();
  const mapOpts: FdcMapOptions = {
    capturedAt: todayIsoDate(),
    brandI18n,
  };
  const filters: FdcFilterOptions = {
    minProteinPer100g,
    requireFullMacros: true,
  };
  const sliced = limit != null ? records.slice(0, limit * 10) : records;
  const { rows, skipped } = mapFdcFoodsToImportedRows(sliced, mapOpts, filters);
  const finalRows = limit != null ? rows.slice(0, limit) : rows;
  console.log(`  Mapped ${finalRows.length} rows (skipped ${skipped})`);

  console.log('\n[3/4] Validating...');
  const validated = validateAll(finalRows);
  const summary = summarize(validated);
  console.log(
    `  ok=${summary.ok}  warn=${summary.warnings}  error=${summary.errors}  total=${summary.total}`,
  );

  console.log('\n[4/4] Writing review CSV...');
  const outPath = path.resolve(
    __dirname,
    'data',
    'usda-fdc-review.csv',
  );
  const result = writeReviewCsv(validated, { outputPath: outPath });
  console.log(`  Wrote ${result.written} rows → ${outPath}`);

  console.log('\nDone. Open the CSV and spot-check before promoting to seed.');
}

main().catch((err) => {
  console.error('\nUSDA import failed:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
