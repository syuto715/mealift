import { DeviceEventEmitter, type EmitterSubscription } from 'react-native';

// S3-2b — 記録ハブ (タブバー上の RN Modal シート) からの書き込みを、mounted
// 済み画面のデータ hook へ即時反映するための軽量イベント。RN Modal は
// ナビゲーション focus を変えないため useFocusEffect では拾えず、tabs 配下の
// 画面は blur 中も mounted のままなのでイベント購読が最も確実 (Codex 3-2b R1
// Important #2/#6)。zustand 追加は本 sprint の store 層変更禁止に触れるため、
// RN 標準の DeviceEventEmitter を使う (新規依存なし)。

export const RECORD_EVENTS = {
  waterLogChanged: 'mealift:waterLogChanged',
  bodyLogChanged: 'mealift:bodyLogChanged',
} as const;

export type RecordEvent = (typeof RECORD_EVENTS)[keyof typeof RECORD_EVENTS];

export function emitRecordEvent(event: RecordEvent): void {
  DeviceEventEmitter.emit(event);
}

export function addRecordEventListener(
  event: RecordEvent,
  handler: () => void,
): EmitterSubscription {
  return DeviceEventEmitter.addListener(event, handler);
}
