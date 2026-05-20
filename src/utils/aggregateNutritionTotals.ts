import type {
  DailyExtendedNutrients,
  DailyNutritionSummary,
} from '../types/nutrition';

// v1.5 Phase 2.4 Sprint 2.4.4 — week-scope totals aggregation.
//
// `getDailyNutritionSummary` returns per-day summaries; the week
// scope sums those into a single TotalsBlock for the daily-summary
// card. Pure helper so the same shape is testable without DB.

export interface TotalsBlock {
  calories: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  extended: DailyExtendedNutrients;
}

function zeroExtended(): DailyExtendedNutrients {
  return {
    fiberG: 0, saltG: 0, calciumMg: 0, ironMg: 0,
    vitaminAUg: 0, vitaminB1Mg: 0, vitaminB2Mg: 0,
    vitaminB6Mg: 0, vitaminB12Ug: 0, folateUg: 0,
    vitaminCMg: 0, vitaminDUg: 0, vitaminEMg: 0,
    potassiumMg: 0, magnesiumMg: 0, zincMg: 0,
    cholesterolMg: 0, saturatedFatG: 0, sugarG: 0, sodiumMg: 0,
  };
}

export function aggregateNutritionTotals(
  summaries: DailyNutritionSummary[],
): TotalsBlock {
  const totals: TotalsBlock = {
    calories: 0,
    proteinG: 0,
    fatG: 0,
    carbG: 0,
    extended: zeroExtended(),
  };
  for (const s of summaries) {
    totals.calories += s.totalCalories;
    totals.proteinG += s.totalProteinG;
    totals.fatG += s.totalFatG;
    totals.carbG += s.totalCarbG;
    const e = s.extended;
    const t = totals.extended;
    t.fiberG += e.fiberG;
    t.saltG += e.saltG;
    t.calciumMg += e.calciumMg;
    t.ironMg += e.ironMg;
    t.vitaminAUg += e.vitaminAUg;
    t.vitaminB1Mg += e.vitaminB1Mg;
    t.vitaminB2Mg += e.vitaminB2Mg;
    t.vitaminB6Mg += e.vitaminB6Mg;
    t.vitaminB12Ug += e.vitaminB12Ug;
    t.folateUg += e.folateUg;
    t.vitaminCMg += e.vitaminCMg;
    t.vitaminDUg += e.vitaminDUg;
    t.vitaminEMg += e.vitaminEMg;
    t.potassiumMg += e.potassiumMg;
    t.magnesiumMg += e.magnesiumMg;
    t.zincMg += e.zincMg;
    t.cholesterolMg += e.cholesterolMg;
    t.saturatedFatG += e.saturatedFatG;
    t.sugarG += e.sugarG;
    t.sodiumMg += e.sodiumMg;
  }
  return totals;
}
