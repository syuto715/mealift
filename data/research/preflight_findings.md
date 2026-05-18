# Phase 2.2b Preflight findings

Generated: 2026-05-19. Source: WebFetch verification against the 5
research-flagged caveats.

## Summary

| # | Entity | Initial classification | Verified classification | Adjustment |
|---|---|---|---|---|
| 1 | seicomart | blocked | **blocked confirmed** | none — robots.txt returns 404 (site lacks public robots policy), no nutrition / allergen hub discoverable, ホットシェフ remains store-only. Sprint 4 AI-estimated path stands. |
| 2 | daily_yamazaki | blocked | **blocked confirmed** | none — robots.txt clean (only `/wp-admin/` blocked), sitemap index lists `page-sitemap.xml` / `new-sitemap.xml` / etc. but no nutrition / calorie / allergy / ingredient paths. Research's "公式公開なし" claim accurate. Sprint 4 path stands. |
| 3 | gusto (allergy.skylark.co.jp) | medium (SPA) | **medium (server HTML, data sparse)** | render NOT JS-dependent — the page is server-rendered HTML with general policy text. But it contains ZERO inline menu/PFC data; only generic "9 regulated + 19 advisory allergens" boilerplate. Per-brand search interface required, so the data discovery is still difficult. Playwright not strictly needed; the bottleneck is the per-brand link walk. |
| 4 | saizeriya (allergy.saizeriya.co.jp) | medium (SPA + flip-book) | **medium (SPA confirmed, inconclusive on Playwright bypass)** | WebFetch returned only the `<title>` (`アレルギー情報`) — strongly consistent with SPA behavior. Full menu data likely lives in the `book.saizeriya.co.jp/allergen2007_j/book/` flip-book (PDF-backed). Playwright probably not needed if the flip-book PDF is direct-fetchable. |
| 5 | starbucks_jp (product.starbucks.co.jp) | easy | **easy ➜ split: aggregate=SPA, per-item=HTML** | `/allergy/nutrient/` (the aggregate listing) IS a SPA with filter UI only. BUT the per-item URL pattern `/item/beverage/{JAN}/` returns server-rendered HTML with full PFC + 28 品目 + caffeine. The research memo's "URL pattern が JAN-based" assumption is correct — Phase 2.2b should iterate per-JAN URLs, NOT scrape the aggregate listing. |

## Caveat actions (no JSON manifest change needed)

- The 2 `blocked` entities (seicomart, daily_yamazaki) stay blocked. Sprint 4
  (AI-estimated + industry-standard representative SKUs) is the only path. UI
  must badge "公式公開なし、値は推定" per the research memo.

- skylark / saizeriya / starbucks render-check confirms:
  - **gusto/bamiyan**: per-brand link walk inside the static HTML hub (no
    Playwright required, but each brand needs its own fetch).
  - **saizeriya**: try `book.saizeriya.co.jp/allergen2007_j/book/` direct PDF
    first; only fall back to Playwright if the PDF route fails.
  - **starbucks_jp**: switch the seed strategy from "aggregate listing" to
    "per-JAN page iteration". The JAN list comes from the aggregate page
    structure (which IS server-rendered enough to enumerate items, even though
    the table itself is JS-rendered).

## Difficulty manifest drift (informational)

The JSON header claims `{ easy: 13, medium: 14, hard: 7, blocked: 2 }` (sum
36), but actual entity counts are `{ easy: 14, medium: 15, hard: 5,
blocked: 2 }` (also sum 36). Two `hard` entries in the original draft were
written back to `medium` during research finalization; the manifest header
wasn't updated. No functional impact on Sprint 1-4 ordering; the per-entity
`difficulty` field is the binding signal.

## Next step

Sprint 1 iteration starts with the well-structured chains
(mcdonalds → mos_burger → starbucks_jp → family_mart → lawson) using the
Phase 2.2a `scrapeRestaurantMenu` pipeline against WebFetch-extracted JSON.
