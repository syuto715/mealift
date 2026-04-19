# MEXT Food Composition Table Import

This script imports the Japanese Ministry of Education, Culture, Sports, Science and Technology
(文部科学省 / MEXT) Standard Tables of Food Composition in Japan
— Eighth Revised Edition, 2023 Supplement (日本食品標準成分表（八訂）増補2023年)
— into the app's food database.

## What it does

1. Downloads the official Excel workbook from the MEXT website (automatic),
   or uses a manually placed file in `downloaded/`.
2. Parses ~2,500 food rows with full nutrient data.
3. Maps MEXT food groups to our internal categories and assigns stable IDs
   of the form `mext_01088`, `mext_11220`, ... (no collision with the existing
   `fd_001` → `fd_nnn` IDs in `src/constants/foods.ts`).
4. Generates Japanese aliases (ひらがな / 略称 / 一般名) from
   `alias-dictionary.json` and lightweight heuristics.
5. Writes output to
   - `src/infra/database/seed/data/foods-mext.json`
   - `src/infra/database/seed/data/aliases-mext.json`

At app startup, the seed step reads those JSON files and inserts rows via
`INSERT OR IGNORE` — so running multiple times is safe and will never overwrite
user-customised data (rows with `is_custom = 1`).

## Prerequisites

```bash
npm install --save-dev xlsx node-fetch@2 tsx @types/node-fetch
```

These are already listed in `package.json`.

## Usage

```bash
npm run import-mext
```

This runs `tsx scripts/import-mext-foods/run.ts`, which orchestrates the four
steps above. A full run takes 30-60 seconds.

## Manual download fallback

The MEXT Excel download URL can change when they publish new editions. If the
automatic download fails, follow the instructions printed by the script:

1. Open https://www.mext.go.jp/a_menu/syokuhinseibun/mext_01110.html
2. Download the main food composition workbook (usually labelled 本表 or 成分表全体).
3. Save it as `scripts/import-mext-foods/downloaded/mext-food-composition-2023.xlsx`
4. Re-run `npm run import-mext`.

The `downloaded/` folder is git-ignored (see `.gitignore`).

## Output format

`foods-mext.json` is an array of objects matching the shape in
`transform.ts::MextFoodSeed`. Each row has:

- `id` — stable, e.g. `mext_01088`
- `nameJa` — official MEXT Japanese name
- `category` — mapped to one of the app's `FOOD_CATEGORIES`
- 22 nutrient fields (protein, fat, carb, fiber, Na, K, Ca, Fe, Mg, Zn, A, B1, B2, C, D, E, cholesterol, salt, ...)
- `source: 'mext'`
- `isCommon` — boolean. `true` for the ~30 most frequently-searched items
  (白米, 鶏むね, 卵, バナナ, ...); used to prioritise search ranking.

`aliases-mext.json` is an array of `{ foodId, aliasName, aliasType }` rows.

## Licensing / attribution

MEXT publishes the food composition table under a permissive use policy for
both commercial and non-commercial applications, provided the source is
attributed. See
https://www.mext.go.jp/a_menu/syokuhinseibun/mext_01110.html
The app's Settings → About screen includes the required attribution.
