/**
 * 日本人の食事摂取基準（2020年版）参考
 * 18〜64歳 成人の推奨量 / 目安量
 */

export interface NutrientTarget {
  male: number;
  female: number;
  label: string;
  unit: string;
  /** true = 上限値（超えない方がよい） */
  isUpperLimit?: boolean;
}

export const DAILY_NUTRIENT_TARGETS: Record<string, NutrientTarget> = {
  fiberG: { male: 21, female: 18, label: '食物繊維', unit: 'g' },
  saltG: { male: 7.5, female: 6.5, label: '食塩相当量', unit: 'g', isUpperLimit: true },
  calciumMg: { male: 800, female: 650, label: 'カルシウム', unit: 'mg' },
  ironMg: { male: 7.5, female: 10.5, label: '鉄分', unit: 'mg' },
  vitaminAUg: { male: 850, female: 700, label: 'ビタミンA', unit: 'μg' },
  vitaminB1Mg: { male: 1.4, female: 1.1, label: 'ビタミンB1', unit: 'mg' },
  vitaminB2Mg: { male: 1.6, female: 1.2, label: 'ビタミンB2', unit: 'mg' },
  vitaminB6Mg: { male: 1.4, female: 1.1, label: 'ビタミンB6', unit: 'mg' },
  vitaminB12Ug: { male: 2.4, female: 2.4, label: 'ビタミンB12', unit: 'μg' },
  folateUg: { male: 240, female: 240, label: '葉酸', unit: 'μg' },
  vitaminCMg: { male: 100, female: 100, label: 'ビタミンC', unit: 'mg' },
  vitaminDUg: { male: 8.5, female: 8.5, label: 'ビタミンD', unit: 'μg' },
  vitaminEMg: { male: 6.0, female: 5.0, label: 'ビタミンE', unit: 'mg' },
  potassiumMg: { male: 2500, female: 2000, label: 'カリウム', unit: 'mg' },
  magnesiumMg: { male: 370, female: 290, label: 'マグネシウム', unit: 'mg' },
  zincMg: { male: 11, female: 8, label: '亜鉛', unit: 'mg' },
  cholesterolMg: { male: 300, female: 300, label: 'コレステロール', unit: 'mg', isUpperLimit: true },
} as const;
