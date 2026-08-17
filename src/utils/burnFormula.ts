// S4.6-E — 消費カロリーの式表示「基礎代謝 + 活動 + ワークアウト = 合計」の
// 各項導出。
//
// 合計 (calculateDailyBurn) は tdee + round(workoutCal × 0.5) — ワークアウト
// 分は活動消費との二重計上を避けるため 50% だけ加算される (domain 契約、
// 不変)。そのため「表示された各項の和 = 表示された合計」を成立させるには、
// 各項を合計から**残差**で導出する: workoutPart = total − bmr − activity。
// 通常経路では workoutPart === round(workoutCal × 0.5) に一致し、将来
// HealthKit 実測が合計に混ざっても式の算術は壊れない。
//
// 純関数 (RN import なし) — jest pure-logic テスト対象。表示レイアウト専用で、
// calculateAllCalories / calculateDailyBurn (domain) には触れない。
export interface BurnFormulaParts {
  bmrPart: number;
  activityPart: number;
  workoutPart: number;
  /** 常に bmrPart + activityPart + workoutPart と一致する表示用合計。 */
  total: number;
}

export function getBurnFormulaParts(
  bmr: number,
  tdee: number,
  totalBurn: number,
): BurnFormulaParts {
  const bmrPart = Math.max(0, bmr);
  const activityPart = Math.max(0, tdee - bmr);
  // 残差方式。今日のデータでは負にならない (totalBurn ≥ tdee ≥ bmr) が、
  // 退行入力への防御として 0 でクランプし、その場合も式が成立するよう
  // 合計は各項の和で返す (raw totalBurn との乖離は退行入力時のみ)。
  const workoutPart = Math.max(0, totalBurn - bmrPart - activityPart);
  return {
    bmrPart,
    activityPart,
    workoutPart,
    total: bmrPart + activityPart + workoutPart,
  };
}
