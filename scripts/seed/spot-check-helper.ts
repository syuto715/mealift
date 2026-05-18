// v1.5 Stage 2 Phase 2.2a — spot check sampler.
//
// Architectural SSoT:
//   - docs/plans/v1.5_stage_2_restaurant_menu_db_epic.md §4.1
//     step 2 (Syuto manually validates 10-20% of rows; mismatch
//     > 5% triggers re-scrape) — DEC-2 acquisition pipeline
//   - kickoff prompt §Step 2 #3 (deterministic sample + markdown
//     output ready for PR review)
//
// Sample selection is deterministic given (chain_slug, seed) so
// re-running the spot check on the same chain produces the same
// sample — important for the "Syuto already reviewed N items"
// workflow when a re-scrape happens.
//
// The markdown output is a side-by-side table with a checkbox
// column (`[ ]` for unreviewed, Syuto edits to `[x] OK` or
// `[x] NG`). The format is intentionally lo-fi so Syuto can
// review on phone / desktop without tooling.

import * as fs from 'fs';
import * as path from 'path';
import type {
  MenuItemRecord,
  RestaurantScrapeOutput,
} from './types';

export interface SpotCheckOptions {
  // Fraction of items to sample. Epic §4.1 calls for 10-20%; the
  // default is 0.15 (15%) so a 47-item McDonald's menu samples 7.
  sampleFraction?: number;
  // Always sample at least this many rows even when the fraction
  // would round to fewer. Caps at the total menu size.
  minSamples?: number;
  // Always cap at this many rows even when the fraction would
  // produce more — prevents an unreasonable review burden for
  // very large chains.
  maxSamples?: number;
  // Deterministic seed string. Default: chain_slug — so the same
  // chain re-runs select the same sample, but two different
  // chains don't collide.
  seedOverride?: string;
}

const DEFAULT_OPTIONS: Required<Omit<SpotCheckOptions, 'seedOverride'>> = {
  sampleFraction: 0.15,
  minSamples: 5,
  maxSamples: 20,
};

// ---------------------------------------------------------------------------
// Deterministic PRNG — xmur3 string-hash + sfc32 PRNG combo. The
// alternative (Math.random) would be non-deterministic across runs.
// ---------------------------------------------------------------------------

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    /* eslint-disable no-param-reassign */
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
    /* eslint-enable no-param-reassign */
  };
}

function makeRng(seed: string): () => number {
  const hash = xmur3(seed);
  return sfc32(hash(), hash(), hash(), hash());
}

// ---------------------------------------------------------------------------
// Sample selection — Fisher-Yates over a copy of the index list,
// then take the first N. Deterministic given the seed.
// ---------------------------------------------------------------------------

export function selectSample<T>(
  items: T[],
  count: number,
  seed: string,
): T[] {
  const cap = Math.min(count, items.length);
  if (cap <= 0) return [];
  const indices = items.map((_, i) => i);
  const rng = makeRng(seed);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, cap).sort((a, b) => a - b).map((i) => items[i]);
}

export function chooseSampleSize(
  totalItems: number,
  options: SpotCheckOptions = {},
): number {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (totalItems <= 0) return 0;
  const fractionTarget = Math.round(totalItems * opts.sampleFraction);
  const clampedMin = Math.min(opts.minSamples, totalItems);
  return Math.max(clampedMin, Math.min(opts.maxSamples, fractionTarget));
}

// ---------------------------------------------------------------------------
// Markdown rendering.
// ---------------------------------------------------------------------------

export interface SpotCheckReport {
  chainSlug: string;
  chainName: string;
  totalItems: number;
  sample: MenuItemRecord[];
  markdown: string;
}

export function generateSpotCheckReport(
  output: RestaurantScrapeOutput,
  options: SpotCheckOptions = {},
): SpotCheckReport {
  const seed = options.seedOverride ?? output.chainSlug;
  const sampleSize = chooseSampleSize(output.menuItems.length, options);
  // Codex round 1 Important fix — re-scrape stability: input row
  // order may drift between scrapes (e.g. the chain page reorders
  // menu cards or the JSON extractor visits keys in a different
  // sequence). Sort by stable canonical key (name) BEFORE the
  // PRNG selects, so the same `(chain_slug, items_set)` always
  // yields the same sample regardless of input order. Earlier
  // draft seeded the PRNG correctly but shuffled in-place on the
  // raw input order, which broke the "Syuto re-reviews the same
  // sample" workflow.
  const canonical = [...output.menuItems].sort((a, b) =>
    a.name.localeCompare(b.name, 'ja'),
  );
  const sample = selectSample(canonical, sampleSize, seed);

  const lines: string[] = [];
  lines.push(`# ${output.chainName} 抜粋 sample (${sample.length}/${output.menuItems.length} items)`);
  lines.push('');
  lines.push(`- Source URL: ${output.attributionUrl}`);
  lines.push(`- Captured at: ${output.sourceCapturedAt}`);
  lines.push(`- Seed: \`${seed}\` (deterministic — re-run yields the same sample)`);
  if (output.partial && output.droppedItems && output.droppedItems.length > 0) {
    lines.push(`- **Partial scrape**: ${output.droppedItems.length} rows were dropped`);
    lines.push('  (parse / validation failures — see "Dropped items" section below)');
  }
  lines.push('');
  lines.push('| # | menu_name | extracted PFC | kcal | source URL | OK/NG |');
  lines.push('|---|---|---|---|---|---|');
  sample.forEach((m, i) => {
    const pfc = `P${m.proteinG.toFixed(1)} F${m.fatG.toFixed(1)} C${m.carbG.toFixed(1)}`;
    lines.push(
      `| ${i + 1} | ${m.name} | ${pfc} | ${m.caloriesPerServing} | ${m.sourceUrl} | [ ] |`,
    );
  });
  if (output.partial && output.droppedItems && output.droppedItems.length > 0) {
    lines.push('');
    lines.push(`## Dropped items (${output.droppedItems.length})`);
    lines.push('');
    lines.push('Rows the scraper extracted but parse / validation failed to');
    lines.push('promote to a final record. Syuto: decide whether to re-scrape');
    lines.push('(parser fix), hand-enter as `source: manual`, or defer to a');
    lines.push('future seed refresh.');
    lines.push('');
    for (const d of output.droppedItems) lines.push(`- ${d}`);
  }
  lines.push('');
  lines.push('## Review procedure');
  lines.push('');
  lines.push('1. Open the Source URL above in a browser.');
  lines.push('2. For each row, locate the matching menu item on the official page.');
  lines.push('3. Compare 公式 PFC vs. extracted PFC. If exact match → check `[x] OK`.');
  lines.push('   If mismatch → record actual values in a follow-up note + check `[x] NG`.');
  lines.push('4. If mismatch count / sample size > 5%, the scrape needs to be re-run');
  lines.push('   (per epic §4.1 step 2 threshold).');

  return {
    chainSlug: output.chainSlug,
    chainName: output.chainName,
    totalItems: output.menuItems.length,
    sample,
    markdown: lines.join('\n') + '\n',
  };
}

// ---------------------------------------------------------------------------
// I/O — write the report to scripts/seed/spot-check/.
// ---------------------------------------------------------------------------

export function writeSpotCheckReport(
  report: SpotCheckReport,
  outDir: string,
): string {
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${report.chainSlug}-sample.md`);
  fs.writeFileSync(outPath, report.markdown, 'utf-8');
  return outPath;
}
