// v1.5 Stage 2 Phase 2.2a — seed pipeline types.
//
// Architectural SSoT:
//   - docs/plans/v1.5_stage_2_restaurant_menu_db_epic.md §4.1
//     (acquisition pipeline = AI scrape + Syuto spot check +
//     bulk import — DEC-2)
//   - §4.2 (scraper writes `scripts/seed/data/${chain_slug}.json`
//     per chain; failures land at `scripts/seed/data/_failed/`;
//     build step emits a single seed migration)
//   - §5.3 (restaurant_type enum — DEC-7)
//   - §5.1 (restaurants / restaurant_menu_items column shape
//     consumed by the build step)
//
// Shape is intentionally decoupled from the Postgres column
// shape: importers / scrapers output what the source page
// provides (in source units, with provenance), and the build
// step (migrationBuilder.ts) translates into INSERTs. This
// matches the existing scripts/food-import convention.

export type RestaurantType =
  | 'dining'
  | 'convenience'
  | 'cafe_bakery'
  | 'combo_meal';

// Fixed category list from §5.1 + §5.3.
export type RestaurantCategory =
  | 'FF'
  | '牛丼'
  | '寿司'
  | 'ファミレス'
  | 'カフェ'
  | 'その他'
  | 'コンビニ';

// Sources allowed for restaurant_menu_items.source (epic §5.1
// CHECK enum). The seed pipeline only emits 'official_disclosure'
// (chain nutrition page) or 'package_label' (back-of-package
// label for コンビニ PB SKUs). 'ai_estimate' is Phase 2.5;
// 'manual' is for hand-entered rows during spot-check recovery.
export type MenuItemSource =
  | 'official_disclosure'
  | 'package_label'
  | 'ai_estimate'
  | 'manual';

// Input record for a single chain — Syuto curates the URL list
// (one entry per chain) and the pipeline iterates through them
// in Phase 2.2b.
export interface RestaurantScrapeInput {
  chainSlug: string;             // 'mcdonalds' / 'seven_eleven' — used as filename
  chainName: string;             // 'マクドナルド' / 'セブンイレブン'
  restaurantType: RestaurantType;
  category: RestaurantCategory;
  url: string;                   // chain's official nutrition disclosure page
  aliases?: string[];            // ['マクド', 'McD', 'マック'] — picker prefix lookup
  attribution?: string;          // overrides default if needed
}

// PFC + micronutrient payload for a single menu item.
// Required: name + serving + calories + PFC.
// Optional: micronutrients (left undefined when the source page
// doesn't disclose them — NEVER fabricate).
export interface MenuItemRecord {
  name: string;
  aliases?: string[];
  category?: string;             // chain's own taxonomy ('バーガー' / 'サイド' etc.)

  servingSizeG: number;          // grams; resolved from "1 個" / "100g" etc.
  servingUnit: string;           // 'g' / '個' / '杯' / '本' / '枚' / 'パック' / 'ml'
  servingDescription?: string;   // '1 個' / '1 杯' label as printed on the page

  caloriesPerServing: number;
  proteinG: number;
  fatG: number;
  carbG: number;

  fiberG?: number;
  sugarG?: number;
  saltG?: number;
  sodiumMg?: number;
  saturatedFatG?: number;
  cholesterolMg?: number;

  // コンビニ PB SKUs carry a JAN; dining menu items do not. Null
  // is the dining default.
  barcode?: string;

  // Optional best-effort ingredient breakdown (Phase 2.5 may
  // populate via Gemini; the seed phase leaves this null unless
  // the chain page itself discloses it, which is rare).
  ingredientDecompositionJson?: unknown;

  source: MenuItemSource;
  sourceUrl: string;
  sourceCapturedAt: string;      // ISO YYYY-MM-DD
}

// Output of a successful scrape — one file per chain in
// `scripts/seed/data/${chain_slug}.json`.
//
// `partial: true` + `droppedItems` are populated when SOME rows
// extracted but OTHERS failed parse or validation. Phase 2.2b
// iteration uses these to surface the suspect list in the
// spot-check markdown so Syuto can decide whether to re-run
// the scrape or accept the partial set (Drafting 103 — partial
// success must remain observable, not silently dropped).
export interface RestaurantScrapeOutput {
  chainSlug: string;
  chainName: string;
  restaurantType: RestaurantType;
  category: RestaurantCategory;
  aliases: string[];
  attribution: string;
  attributionUrl: string;
  sourceCapturedAt: string;
  menuItems: MenuItemRecord[];
  partial?: boolean;
  droppedItems?: string[];
}

// Per-chain failure record — written to
// `scripts/seed/data/_failed/${chain_slug}.md` when web_fetch
// or parse fails. The Phase 2.2b iterator must NOT halt on a
// single chain failure; it logs, defers, and continues.
export interface ScrapeFailure {
  chainSlug: string;
  chainName: string;
  url: string;
  errorKind:
    | 'fetch_failed'        // network / 4xx / 5xx response
    | 'parse_no_rows'       // page fetched but no menu rows extracted
    | 'parse_partial'       // some rows extracted, some failed
    | 'content_type_unknown'
    | 'validation_failed'   // PFC consistency / band check failed > threshold
    | 'manual_entry_required';
  message: string;
  manualEntryRequired: boolean;
  partialItems?: MenuItemRecord[]; // populated when errorKind === 'parse_partial'
  suspectItems?: string[];         // menu names that couldn't be parsed
  capturedAt: string;              // ISO YYYY-MM-DD when the failure was recorded
}

// Outcome of running the scraper for a single chain. Exactly
// one of `output` / `failure` is set.
export type ScrapeResult =
  | { kind: 'success'; output: RestaurantScrapeOutput }
  | { kind: 'failure'; failure: ScrapeFailure };
