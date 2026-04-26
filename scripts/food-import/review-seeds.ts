/**
 * review-seeds.ts — review artifact for Phase 2B-1 seed data.
 *
 * Loads FITNESS_DISHES (50) and GENERIC_FOODS (50) from the constant files,
 * builds a Map<string, Food> from FOODS + GENERIC_FOODS, runs the recipe
 * calculator on every dish, and writes a single CSV with macros, an Atwater
 * sanity check, ingredient count, and the source-array index (so the user
 * can spot ordering issues).
 *
 * Touches no DB. Read-only over constants.
 *
 * Run: npx tsx scripts/food-import/review-seeds.ts
 */

import * as fs from 'fs';
import * as path from 'path';

import { FITNESS_DISHES } from '../../src/constants/fitnessDishes';
import { GENERIC_FOODS } from '../../src/constants/genericFoods';
import { FOODS, type FoodDefinition } from '../../src/constants/foods';
import { buildRecipeFromFoodMap } from '../../src/domain/recipeBuilder';
import type { Food, FoodSource } from '../../src/types/food';

// ---- FoodDefinition → Food adapter ----------------------------------------
// The calculator only reads servingSizeG / macros / extended nutrients, so
// we fill the rest with safe defaults rather than touching the DB.

function defToFood(def: FoodDefinition, source: FoodSource): Food {
  return {
    id: def.id,
    nameJa: def.nameJa,
    nameEn: def.nameEn,
    brand: def.brand,
    barcode: null,
    servingSizeG: def.servingSizeG,
    servingUnit: def.servingUnit,
    caloriesPerServing: def.caloriesPerServing,
    proteinG: def.proteinG,
    fatG: def.fatG,
    carbG: def.carbG,
    fiberG: def.fiberG ?? null,
    sodiumMg: def.sodiumMg ?? null,
    calciumMg: def.calciumMg ?? null,
    ironMg: def.ironMg ?? null,
    vitaminAUg: def.vitaminAUg ?? null,
    vitaminB1Mg: def.vitaminB1Mg ?? null,
    vitaminB2Mg: def.vitaminB2Mg ?? null,
    vitaminB6Mg: def.vitaminB6Mg ?? null,
    vitaminB12Ug: def.vitaminB12Ug ?? null,
    folateUg: def.folateUg ?? null,
    vitaminCMg: def.vitaminCMg ?? null,
    vitaminDUg: def.vitaminDUg ?? null,
    vitaminEMg: def.vitaminEMg ?? null,
    potassiumMg: def.potassiumMg ?? null,
    magnesiumMg: def.magnesiumMg ?? null,
    zincMg: def.zincMg ?? null,
    cholesterolMg: def.cholesterolMg ?? null,
    saturatedFatG: def.saturatedFatG ?? null,
    sugarG: def.sugarG ?? null,
    saltG: def.saltG ?? null,
    source,
    externalId: null,
    isCustom: false,
    isFavorite: false,
    isUserAdded: false,
    verified: true,
    addedAt: null,
    useCount: 0,
    createdAt: '2026-04-26T00:00:00Z',
    updatedAt: '2026-04-26T00:00:00Z',
  };
}

const foodMap = new Map<string, Food>();
for (const f of FOODS) foodMap.set(f.id, defToFood(f, 'mext'));
for (const g of GENERIC_FOODS) foodMap.set(g.id, defToFood(g, 'manual_seed'));

// ---- CSV helpers ----------------------------------------------------------

function csv(s: string | number): string {
  const v = String(s);
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function atwater(p: number, f: number, c: number): number {
  return 4 * p + 4 * c + 9 * f;
}

function pfcDiffPct(kcal: number, atwaterKcal: number): number {
  if (atwaterKcal <= 0) return 0;
  return ((kcal - atwaterKcal) / atwaterKcal) * 100;
}

// ---- Build rows -----------------------------------------------------------

const lines: string[] = [];
lines.push(
  [
    'type',
    'id',
    'name',
    'total_kcal',
    'total_p',
    'total_f',
    'total_c',
    'atwater_kcal',
    'pfc_diff_pct',
    'ingredient_count',
    'sort_order',
    'note',
  ].join(','),
);

// Generic foods: each is a 1-ingredient row with totals = caloriesPerServing.
GENERIC_FOODS.forEach((g, idx) => {
  const aw = atwater(g.proteinG, g.fatG, g.carbG);
  const diff = pfcDiffPct(g.caloriesPerServing, aw);
  const note = Math.abs(diff) > 15 ? 'pfc_diff>15%' : '';
  lines.push(
    [
      'food',
      csv(g.id),
      csv(g.nameJa),
      g.caloriesPerServing,
      g.proteinG,
      g.fatG,
      g.carbG,
      aw.toFixed(1),
      diff.toFixed(1),
      1,
      idx,
      csv(note),
    ].join(','),
  );
});

// Fitness dishes: run the calculator. partialSums:true to mirror seed behavior.
const skipped: { id: string; missing: string[] }[] = [];
FITNESS_DISHES.forEach((d, idx) => {
  const built = buildRecipeFromFoodMap(
    foodMap,
    d.ingredients.map((i, j) => ({ foodId: i.foodId, amountG: i.amountG, sortOrder: j })),
    { partialSums: true },
  );
  if (built.missingFoodIds.length > 0) {
    skipped.push({ id: d.id, missing: built.missingFoodIds });
    lines.push(
      [
        'dish',
        csv(d.id),
        csv(d.nameJa),
        '',
        '',
        '',
        '',
        '',
        '',
        d.ingredients.length,
        idx,
        csv(`MISSING: ${built.missingFoodIds.join(' ')}`),
      ].join(','),
    );
    return;
  }
  const t = built.totals;
  const aw = atwater(t.totalProteinG, t.totalFatG, t.totalCarbG);
  const diff = pfcDiffPct(t.totalCalories, aw);
  const note = Math.abs(diff) > 15 ? 'pfc_diff>15%' : '';
  lines.push(
    [
      'dish',
      csv(d.id),
      csv(d.nameJa),
      t.totalCalories,
      t.totalProteinG,
      t.totalFatG,
      t.totalCarbG,
      aw.toFixed(1),
      diff.toFixed(1),
      built.ingredients.length,
      idx,
      csv(note),
    ].join(','),
  );
});

const out = path.join(process.cwd(), 'scripts/food-import/data/seed-review.csv');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, lines.join('\n') + '\n');

console.log(`Wrote ${lines.length - 1} rows to ${out}`);
console.log(`  - ${GENERIC_FOODS.length} generic foods`);
console.log(`  - ${FITNESS_DISHES.length} fitness dishes`);
if (skipped.length > 0) {
  console.log(`\n${skipped.length} dish(es) skipped due to missing foodIds:`);
  for (const s of skipped) {
    console.log(`  - ${s.id}: ${s.missing.join(', ')}`);
  }
}

// Quick PFC outlier summary so the user sees the worst-offender count first.
const all = lines.slice(1);
const outliers = all.filter((l) => l.includes('pfc_diff>15%')).length;
console.log(`\nPFC sanity: ${outliers}/${all.length} rows exceed ±15% Atwater diff.`);
