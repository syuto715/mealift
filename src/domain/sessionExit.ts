// S3-1 — ワークアウトセッション終了/破棄の UI マッピング層。
//
// 絶対原則: repository / store の保存・破棄ロジック自体は変更しない。
// このモジュールは既存関数を deps 注入で受け取り、
//   - 「記録を保存して終了」 = finishSession (既存の完了保存)
//   - 「記録を破棄して終了」 = getSetsForSession → removeSet (既存の
//     soft-delete + sync tombstone) を全セットに適用
// を再入 guard 付きで直列化するだけの薄い orchestration に徹する。
//
// 破棄のマッピング注記: deleteSession は存在しないため、セッション行は
// finished_at NULL のまま残す (finishSession してしまうと空セッションが
// 履歴リスト・カレンダードットに露出する。未終了行は履歴/ホーム/カレンダー/
// 消費カロリーの全ユーザー可視面で除外される)。セット行は removeSet の
// soft-delete で全照会から消える。復元 UI は存在しない (=「元に戻せません」)。

export interface ExitSetLike {
  completed: boolean;
  weightKg: number | null;
  reps: number | null;
}

export interface ExitExerciseLike {
  sets: ExitSetLike[];
}

export interface SessionExitStats {
  /** 完了セットが 1 つ以上ある種目数 */
  exerciseCount: number;
  completedSetCount: number;
  totalVolumeKg: number;
}

export function collectSessionStats(
  exercises: readonly ExitExerciseLike[],
): SessionExitStats {
  let exerciseCount = 0;
  let completedSetCount = 0;
  let totalVolumeKg = 0;
  for (const ex of exercises) {
    const completed = ex.sets.filter((s) => s.completed);
    if (completed.length > 0) exerciseCount += 1;
    completedSetCount += completed.length;
    for (const s of completed) {
      totalVolumeKg += (s.weightKg ?? 0) * (s.reps ?? 0);
    }
  }
  return { exerciseCount, completedSetCount, totalVolumeKg };
}

/** 破棄確認用サマリ:「経過32分・4種目12セット」(1分未満は「経過1分未満」)。 */
export function formatDiscardSummary(
  elapsedSeconds: number,
  stats: SessionExitStats,
): string {
  const minutes = Math.floor(Math.max(0, elapsedSeconds) / 60);
  const elapsed = minutes >= 1 ? `経過${minutes}分` : '経過1分未満';
  return `${elapsed}・${stats.exerciseCount}種目${stats.completedSetCount}セット`;
}

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
  getSetsForSession: (sessionId: string) => Promise<{ id: string }[]>;
  removeSet: (setId: string) => Promise<unknown>;
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
  /** 破棄して終了。保存済み全セットを既存 removeSet で soft-delete。 */
  discardExit: (sessionId: string) => Promise<SessionExitResult>;
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
    async discardExit(sessionId) {
      if (busy) return 'busy';
      busy = true;
      try {
        const sets = await deps.getSetsForSession(sessionId);
        for (const s of sets) {
          await deps.removeSet(s.id);
        }
        return 'done';
      } finally {
        busy = false;
      }
    },
  };
}
