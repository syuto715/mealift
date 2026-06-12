import {
  calculateNutritionCompliance,
  calculateTrainingCompliance,
} from '../compliance';

describe('calculateTrainingCompliance', () => {
  // v1.5.1 — target<=0 は測定不能 → 0(以前は 1 で「記録ゼロ・トレ100%」誤表示)。
  it('target=0 のとき 0 を返す(100% 誤表示のガード)', () => {
    expect(calculateTrainingCompliance(0, 0)).toBe(0);
  });

  it('target が負のとき 0 を返す', () => {
    expect(calculateTrainingCompliance(5, -1)).toBe(0);
  });

  it('completed=0 / target=3 は 0', () => {
    expect(calculateTrainingCompliance(0, 3)).toBe(0);
  });

  it('completed<target は比率を返す', () => {
    expect(calculateTrainingCompliance(2, 4)).toBe(0.5);
  });

  it('completed=target は 1', () => {
    expect(calculateTrainingCompliance(3, 3)).toBe(1);
  });

  it('completed>target は 1 にクランプ', () => {
    expect(calculateTrainingCompliance(5, 3)).toBe(1);
  });
});

describe('calculateNutritionCompliance', () => {
  it('空配列は 0', () => {
    expect(calculateNutritionCompliance([], 2000)).toBe(0);
  });

  it('target<=0 は 0', () => {
    expect(calculateNutritionCompliance([1800, 2000], 0)).toBe(0);
  });

  it('全日が一致なら 1(tolerance 10% 内)', () => {
    expect(calculateNutritionCompliance([2000, 2000, 2000], 2000)).toBe(1);
  });

  it('許容外の日が混じると部分達成率', () => {
    // 3000 は 2000 の +50% で許容外(tolerance=0.10)、残り 2 日は一致 → 2/3。
    const result = calculateNutritionCompliance([2000, 2000, 3000], 2000);
    expect(result).toBeCloseTo(2 / 3, 5);
  });
});
