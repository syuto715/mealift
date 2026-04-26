# scripts/food-import

Build-time tooling for ingesting nutrition data from officially
distributed datasets. **Not a scraper** — see
[`../../docs/data-sources.md`](../../docs/data-sources.md) for the
allow-list of sources that may be used here, and the prohibited list
of sources that may not.

## Setup

This tool runs in **Node 18+** (uses global `fetch`).

### Gemini API key

The structured extractor (`lib/extractor.ts`) calls the Gemini REST API
to turn unstructured PDF/HTML text into typed JSON. Add the key to
`.env.local` at the repo root:

```
GEMINI_API_KEY=<your-key>
# optional override — defaults to gemini-2.5-flash
GEMINI_MODEL=gemini-2.5-flash
```

`.env.local` is gitignored (see `.env*.local` rule in `.gitignore`).

**This key is for build-time tooling only.** Do **not** wire it into
the runtime app — runtime AI calls go through the Supabase Edge
Function proxy and must not see this key. Keeping these paths separate
means a leaked dev key cannot be abused via the shipped app.

## Modules

- **`lib/types.ts`** — canonical `ImportedFoodRow`, `SourceLicense`,
  `ValidationIssue`. Importers produce `ImportedFoodRow[]`; everything
  downstream consumes it.
- **`lib/fetcher.ts`** — HTTP downloader for officially-distributed
  files (MEXT Excel, ministry PDFs). Validates min response size to
  catch HTML error pages returned with HTTP 200. Not for use against
  any source that prohibits automated retrieval.
- **`lib/extractor.ts`** — Gemini-backed structured extractor.
  Hard-coded to `temperature: 0` and
  `responseMimeType: 'application/json'`. The system prompt forbids
  estimation / inference; missing fields → `null`. The extractor is
  the **only** place an LLM is allowed to touch nutrition data.
- **`lib/validator.ts`** — PFC consistency check (Atwater, ±15%),
  outlier checks (per-serving ceilings on protein/fat/carb/calories),
  required-field checks. Returns an issues array per row; never
  mutates the row.
- **`lib/exporter.ts`** — Writes a review CSV with per-row
  `validation_status` and `validation_issues` columns. Optional
  `okOnly` flag drops error rows.

## Pipeline shape

```
fetcher.fetchToFile()                    raw bytes (Excel / PDF / HTML)
  → source-specific parser               (xlsx for MEXT, pdf-parse for PDFs)
  → extractor.extractStructured()        only when the parser needs Gemini help
  → ImportedFoodRow[]
  → validator.validateAll()
  → exporter.writeReviewCsv()            ← human reviews here
  → seed-to-sqlite.ts (Phase 3)          ← future
```

## Constraints

- **Nutrition values are NEVER LLM-generated.** Gemini may only reshape
  source content into JSON. The extractor's system prompt enforces
  this; the validator catches drift.
- Every row must carry `sourceUrl`, `sourceLicense`, `capturedAt`. Rows
  missing any of these fail validation as errors.
- Add new sources only after they are allow-listed in
  `docs/data-sources.md`.

## Existing importer

The MEXT 八訂 importer pre-dates this generic pipeline and currently
lives at `scripts/import-mext-foods/`. It will be migrated onto these
libs in a follow-up commit.
