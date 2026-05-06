// BMI calculation + Japanese-standard category classification
// (日本肥満学会基準). Pure logic, no React / no DB — sits in domain
// so the profile screen and any future analytics can both call it.
//
// Categories (per 日本肥満学会):
//   < 18.5            低体重
//   18.5 〜 25 未満   普通体重
//   25  〜 30 未満   肥満 (1度)
//   30  〜 35 未満   肥満 (2度)
//   35  〜 40 未満   肥満 (3度)
//   ≥ 40             肥満 (4度)

export type BMICategory =
  | 'underweight'
  | 'normal'
  | 'obese_1'
  | 'obese_2'
  | 'obese_3'
  | 'obese_4';

export interface BMIResult {
  bmi: number;        // 1-decimal rounded
  category: BMICategory;
  label: string;      // 日本語ラベル
}

const CATEGORY_LABELS: Record<BMICategory, string> = {
  underweight: '低体重',
  normal: '普通体重',
  obese_1: '肥満 (1度)',
  obese_2: '肥満 (2度)',
  obese_3: '肥満 (3度)',
  obese_4: '肥満 (4度)',
};

function classify(bmi: number): BMICategory {
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25) return 'normal';
  if (bmi < 30) return 'obese_1';
  if (bmi < 35) return 'obese_2';
  if (bmi < 40) return 'obese_3';
  return 'obese_4';
}

export function calculateBMI(
  weightKg: number,
  heightCm: number,
): BMIResult | null {
  if (
    !Number.isFinite(weightKg) ||
    !Number.isFinite(heightCm) ||
    weightKg <= 0 ||
    heightCm <= 0
  ) {
    return null;
  }
  const heightM = heightCm / 100;
  const raw = weightKg / (heightM * heightM);
  const bmi = Math.round(raw * 10) / 10;
  const category = classify(bmi);
  return {
    bmi,
    category,
    label: CATEGORY_LABELS[category],
  };
}
