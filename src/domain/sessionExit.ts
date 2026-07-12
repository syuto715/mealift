// S3-1 — ワークアウトセッション終了 (保存) の UI マッピング層。
//
// 絶対原則: repository / store の保存ロジック自体は変更しない。
// このモジュールは既存 finishSession を deps 注入で受け取り、
// 「記録を保存して終了」を再入 guard 付きで直列化するだけの薄い
// orchestration に徹する (二重保存 guard は C-11 と同趣旨)。
//
// 注: 「記録を破棄して終了」導線は S3-1 R3 で除去した (Syuto 判断)。
// 真の破棄には discardSession repo 関数 (セッション/セット/e1RM 観測/PR の
// tombstone 一括 soft-delete + トランザクション) が必要で、Sprint 3-2 の
// 主題候補として設計を提案リストに記録済み。

/**
 * 経過秒 = startedAt (ISO) からの壁時計差分。バックグラウンドで JS タイマーが
 * 凍結しても復帰時に正しい値へ収束する。startedAt が欠損/不正/未来の場合は
 * fallbackStartMs (画面マウント時刻) 起点。
 */
export function computeElapsedSeconds(
  startedAtIso: string | null | undefined,
  nowMs: number,
  fallbackStartMs: number,
): number {
  if (startedAtIso) {
    const t = Date.parse(startedAtIso);
    if (!Number.isNaN(t) && t <= nowMs) {
      return Math.floor((nowMs - t) / 1000);
    }
  }
  return Math.max(0, Math.floor((nowMs - fallbackStartMs) / 1000));
}

export interface SessionExitDeps {
  // 戻り値は使わない (workoutRepo.finishSession は durationSeconds を返すが
  // 契約は「完了保存の実行」のみ) — Promise<unknown> で受けて repo 契約に非依存。
  finishSession: (
    sessionId: string,
    note?: string,
    estimatedCalories?: number,
  ) => Promise<unknown>;
}

export type SessionExitResult = 'done' | 'busy';

export interface SessionExitController {
  isBusy: () => boolean;
  /** 保存して終了。busy 中の再入は 'busy' (二重保存 guard、C-11 と同趣旨)。 */
  saveExit: (
    sessionId: string,
    note?: string,
    estimatedCalories?: number,
  ) => Promise<SessionExitResult>;
}

export function createSessionExitController(
  deps: SessionExitDeps,
): SessionExitController {
  let busy = false;
  return {
    isBusy: () => busy,
    async saveExit(sessionId, note, estimatedCalories) {
      if (busy) return 'busy';
      busy = true;
      try {
        await deps.finishSession(sessionId, note, estimatedCalories);
        return 'done';
      } finally {
        // 失敗時も解除 → シートを閉じずに再試行できる
        busy = false;
      }
    },
  };
}
