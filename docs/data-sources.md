# Food data sources — legal & licensing review

Last reviewed: 2026-04-26

This document is the canonical reference for which external food-data
sources Mealift may ingest, under what terms, and what compliance
obligations attach to each.

The default answer to "can we scrape `<X>`?" is **no**. Sources are
allow-listed below; anything not on the list is treated as prohibited
until it has been reviewed and added here.

---

## Allow-listed sources

### MEXT 八訂 食品成分データベース — primary

- **Source:** https://www.mext.go.jp/a_menu/syokuhinseibun/index.htm
- **Format:** officially distributed Excel / PDF download (no scraping)
- **License:** free for commercial and non-commercial use, with attribution
- **`SourceLicense` value:** `mext-8th`
- **Attribution surface:** Settings → About screen, plus a `source`
  column on every imported row.
- **Attribution string:** "栄養成分データ: 文部科学省『日本食品標準成分表（八訂）増補2023年』"

This is the foundation of the food database. An end-to-end importer
already exists at `scripts/import-mext-foods/`; the new generic
`scripts/food-import/lib/` quartet is intended for future MEXT
revisions and any other officially-distributed dataset that fits the
same shape.

### USDA FoodData Central — global protein products (build-time)

- **Source:** https://fdc.nal.usda.gov/download-datasets.html
- **Format:** officially distributed JSON download (no scraping; no API
  key required for the bulk dump path used here)
- **License:** Creative Commons CC0 1.0 Universal — public domain,
  attribution optional
- **`SourceLicense` value:** `cc0-usda-fdc`
- **Datasets used:** primarily "Branded Foods" (commercial labels —
  protein bars, whey, RTD, MRPs from US-distributed brands). The
  adapter also handles "Foundation Foods" and "SR Legacy" for raw
  ingredients, but we lean on MEXT 八訂 for those by default.
- **Importer:** `scripts/food-import/run-usda.ts` (uses the generic
  `scripts/food-import/lib/` quartet + the FDC-specific adapter at
  `scripts/food-import/adapters/usda-fdc.ts`).
- **Brand i18n:** EN→JA brand display names live in
  `scripts/food-import/data/brand-i18n.json`. Add new entries only
  when the Japanese spelling is well-attested in JP retail; do not
  transliterate speculatively.
- **Default filter:** ≥15g protein per 100g (the goal is filling the
  protein-product gap MEXT doesn't cover, not seeding 100k breakfast
  cereals). Override with `--min-protein=N`.

CC0 imposes no obligations, but we still surface "Source: USDA FDC"
in Settings → About to make provenance auditable, and every imported
row gets the canonical FDC food-detail URL as `sourceUrl`.

### Open Food Facts — barcode lookups (runtime, opt-in)

- **Source:** https://world.openfoodfacts.org/api/v2/product/{barcode}.json
- **License:** Open Database License (ODbL) v1.0 — share-alike + attribution
- **`SourceLicense` value:** `odbl-openfoodfacts`
- **Status:** integrated at runtime in
  `src/infra/services/openFoodFactsService.ts`.
- **Caching:** **yes — barcode hits are written to local SQLite via
  `saveBarcodeFood()` with `source = 'openfoodfacts'`.** Each cache
  write emits a `[ODbL audit]` `console.warn` with the barcode and
  product name so we have a per-write audit trail (added 2026-04-26 in
  `src/infra/repositories/barcodeFoodRepository.ts`).

#### Compliance obligations triggered by local caching

1. **Attribution** — must surface "Powered by Open Food Facts" wherever
   OFF data appears (currently: barcode scanner result screen). Any
   new screen that shows OFF data must add the same attribution.
2. **Share-alike** — any **redistributed** dataset built from OFF data
   must itself be released under ODbL. Holding OFF rows on a single
   user's device is generally fine; baking them into a seed file we
   ship to all users is not. **Do NOT include OFF rows in any v16+
   seed migration.** If we ever want a shipped barcode dataset, it
   has to come from a non-share-alike source.
3. **Audit trail** — the `[ODbL audit]` warn log helps reconstruct, on
   demand, which rows in a given install came from OFF vs. user input
   vs. MEXT. If we add server-side analytics for these writes, we get
   a tenant-level audit too.

### User-submitted data — future

Phased replacement for chain-store data. Each submission needs explicit
consent + clear ownership terms (the user grants Mealift a license to
display the data). Specced separately; not yet implemented.

- **`SourceLicense` value:** `user-submitted`

### Manual hand-entry — escape hatch

Reserved for cases where a small set of values is typed in from a
printed label or a publicly distributed PDF. Each row still needs a
`sourceUrl` (link to the original document) and `capturedAt`.

- **`SourceLicense` value:** `manual`

---

## Prohibited sources

All major Japanese conveni / restaurant / protein-maker public sites
have been reviewed (2026-04-26) and have terms that explicitly prohibit
automated retrieval, commercial reproduction, or both. **Do not write
scrapers for any of these:**

- セブン-イレブン (sej.co.jp)
- ファミリーマート (family.co.jp)
- ローソン (lawson.co.jp)
- すき家 (sukiya.jp)
- 松屋 (matsuyafoods.co.jp)
- サイゼリヤ (saizeriya.co.jp)
- マイプロテイン (myprotein.jp)
- ザバス (savas.jp)
- ビーレジェンド (real-style.co.jp)

Chain-store nutrition data is to be handled via the user-submission UI
(future phase). If a user wants their conveni 弁当 in the app, they add
it manually; we do not pre-populate.

---

## Adding a new source

Before writing an importer for any new source:

1. Read its 利用規約 / Terms of Use end-to-end. Look specifically for
   "automated retrieval", "機械的処理", "scraping", "reproduction",
   and "commercial use" clauses.
2. Check `robots.txt` (informative, not authoritative — ToS controls).
3. If the source is a publicly distributed dataset (Excel / PDF / CSV)
   under a permissive license, document the license here and proceed.
4. If not, do not write code. Either contact the source for a data
   license, or treat the data as user-submitted.

All importers must:

- Set `sourceUrl` on every row to the exact page or file the data came
  from. "The MEXT website" is not sufficient; the direct download URL
  is.
- Set `sourceLicense` to a value in the `SourceLicense` union type
  (`scripts/food-import/lib/types.ts`). Add new variants there as new
  sources land.
- Set `capturedAt` to the date the data was downloaded (YYYY-MM-DD).
- Surface attribution wherever the data is visible to users.
