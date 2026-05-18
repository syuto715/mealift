// v1.5 Stage 2 Phase 2.2b — driver that turns WebFetch-extracted
// raw JSON into validated data/seed/${slug}.json + spot-check md.
//
// Workflow per entity:
//   1. WebFetch the chain's official nutrition page with a
//      "extract as JSON array" prompt; save the resulting JSON
//      verbatim to scripts/seed/_raw/${slug}.json.
//   2. Run this driver — it loads the raw JSON, looks up the
//      entity metadata in data/research/restaurant_urls_v1.json,
//      and pipes the content through scrapeRestaurantMenu using
//      an in-memory fetcher.
//   3. Driver writes the validated output to data/seed/${slug}.json
//      (Phase 2.2a shape, with partial + droppedItems set if
//      validation drops any rows) and the spot-check sheet to
//      scripts/seed/spot-check/${slug}-sample.md.
//
// Why this driver exists: WebFetch returns an AI-summarized
// extraction (not raw HTML), so the scraper's HTML-parser branch
// doesn't apply. The driver wraps the extraction in the JSON
// parser branch + the same validate / spot-check / dropped-items
// pipeline the Phase 2.2a tests cover.

import * as fs from 'fs';
import * as path from 'path';
import {
  scrapeRestaurantMenu,
} from './restaurant-menu-scraper';
import { generateSpotCheckReport, writeSpotCheckReport } from './spot-check-helper';
import type {
  RestaurantScrapeInput,
  RestaurantType,
} from './types';

interface ResearchEntity {
  chain_slug: string;
  chain_name: string;
  restaurant_type: string;
  category: string;
  official_urls: string[];
  data_format: string;
  coverage: string;
  difficulty: string;
  fallback_required: boolean;
  memo: string;
}

interface ResearchManifest {
  version: number;
  generated_at: string;
  scope: string;
  entities: ResearchEntity[];
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RESEARCH_PATH = path.join(REPO_ROOT, 'data', 'research', 'restaurant_urls_v1.json');
const RAW_DIR = path.join(REPO_ROOT, 'scripts', 'seed', '_raw');
const OUT_DIR = path.join(REPO_ROOT, 'scripts', 'seed', 'data');
const SPOT_CHECK_DIR = path.join(REPO_ROOT, 'scripts', 'seed', 'spot-check');

// Map research category labels to the 7-category enum landed in
// Phase 2.1 (`scripts/seed/types.ts` RestaurantCategory).
const CATEGORY_MAP: Record<string, string> = {
  fast_food: 'FF',
  gyudon: '牛丼',
  sushi: '寿司',
  family_restaurant: 'ファミレス',
  chinese: 'その他',
  udon: 'その他',
  curry: 'その他',
  ramen: 'その他',
  japanese: 'その他',
  cafe_bakery: 'カフェ',
  convenience: 'コンビニ',
};

function mapCategory(c: string): string {
  return CATEGORY_MAP[c] ?? 'その他';
}

function pickRestaurantType(t: string): RestaurantType {
  if (t === 'dining' || t === 'convenience' || t === 'cafe_bakery' || t === 'combo_meal') {
    return t;
  }
  return 'dining';
}

async function processEntity(
  entity: ResearchEntity,
  rawContent: string,
  capturedAt: string,
): Promise<void> {
  const input: RestaurantScrapeInput = {
    chainSlug: entity.chain_slug,
    chainName: entity.chain_name,
    restaurantType: pickRestaurantType(entity.restaurant_type),
    category: mapCategory(entity.category) as RestaurantScrapeInput['category'],
    url: entity.official_urls[0],
    aliases: [],
    attribution: '公式サイトより',
  };

  const result = await scrapeRestaurantMenu(input, {
    fetcher: async () => ({ content: rawContent, statusCode: 200 }),
    capturedAt,
  });

  if (result.kind === 'failure') {
    console.error(
      `[${entity.chain_slug}] FAILURE — ${result.failure.errorKind}: ${result.failure.message}`,
    );
    return;
  }

  // Phase 2.2b — AI-estimated source stamp.
  //
  // When the research manifest flags `fallback_required: true`,
  // the entity's PFC values are NOT direct official disclosure;
  // they're hand-curated industry-standard / AI estimates per the
  // sprint 3 / sprint 4 strategy (komeda / pronto / blocked-2).
  // The scraper's default `source` is `official_disclosure`, so
  // we post-process here to label these correctly. The UI badge
  // path (Phase 2.4) reads this field to surface 「推定値」.
  if (entity.fallback_required) {
    for (const m of result.output.menuItems) {
      m.source = 'ai_estimate';
    }
  }

  // Write data/seed/${slug}.json
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${entity.chain_slug}.json`);
  fs.writeFileSync(outPath, JSON.stringify(result.output, null, 2) + '\n', 'utf-8');

  // Spot-check md
  const report = generateSpotCheckReport(result.output);
  writeSpotCheckReport(report, SPOT_CHECK_DIR);

  const partialNote = result.output.partial
    ? ` (PARTIAL — ${result.output.droppedItems?.length ?? 0} dropped)`
    : '';
  console.log(
    `[${entity.chain_slug}] OK — ${result.output.menuItems.length} items extracted${partialNote}`,
  );
}

async function main(): Promise<void> {
  const manifestRaw = fs.readFileSync(RESEARCH_PATH, 'utf-8');
  const manifest = JSON.parse(manifestRaw) as ResearchManifest;
  const slugFilter = process.argv.slice(2);
  const capturedAt = new Date().toISOString().slice(0, 10);

  const targets = slugFilter.length > 0
    ? manifest.entities.filter((e) => slugFilter.includes(e.chain_slug))
    : manifest.entities;

  for (const entity of targets) {
    const rawPath = path.join(RAW_DIR, `${entity.chain_slug}.json`);
    if (!fs.existsSync(rawPath)) {
      console.error(`[${entity.chain_slug}] SKIP — no raw extract at ${rawPath}`);
      continue;
    }
    const rawContent = fs.readFileSync(rawPath, 'utf-8');
    await processEntity(entity, rawContent, capturedAt);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
