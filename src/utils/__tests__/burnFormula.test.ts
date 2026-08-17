// S4.6-E — 消費カロリー式表示の各項導出。不変条件は
// 「bmrPart + activityPart + workoutPart === total」(式の算術が常に成立)。
import { getBurnFormulaParts } from '../burnFormula';

describe('getBurnFormulaParts', () => {
  it('通常経路: workoutPart は残差 = round(workoutCal×0.5) 相当', () => {
    // bmr 1613, tdee 2217, workout 604 → totalBurn = 2217 + 302 = 2519
    const p = getBurnFormulaParts(1613, 2217, 2519);
    expect(p).toEqual({
      bmrPart: 1613,
      activityPart: 604,
      workoutPart: 302,
      total: 2519,
    });
    expect(p.bmrPart + p.activityPart + p.workoutPart).toBe(p.total);
  });

  it('ワークアウトなし: workoutPart 0・total = tdee', () => {
    const p = getBurnFormulaParts(1613, 2217, 2217);
    expect(p.workoutPart).toBe(0);
    expect(p.total).toBe(2217);
  });

  it('tdee < bmr の退行入力でも各項は非負で式が成立する', () => {
    const p = getBurnFormulaParts(2000, 1800, 1700);
    expect(p.activityPart).toBe(0);
    expect(p.workoutPart).toBe(0);
    expect(p.bmrPart + p.activityPart + p.workoutPart).toBe(p.total);
  });

  it('property: 整数入力の広い範囲で式の算術が常に成立する', () => {
    for (let bmr = 0; bmr <= 3000; bmr += 371) {
      for (let extra = 0; extra <= 1500; extra += 233) {
        for (let workout = 0; workout <= 1200; workout += 179) {
          const tdee = bmr + extra;
          const totalBurn = tdee + Math.round(workout * 0.5);
          const p = getBurnFormulaParts(bmr, tdee, totalBurn);
          expect(p.bmrPart + p.activityPart + p.workoutPart).toBe(p.total);
          expect(p.total).toBe(totalBurn);
          expect(p.workoutPart).toBe(Math.round(workout * 0.5));
        }
      }
    }
  });
});
