// S3-1/S3-2 — セッション終了 (3択シート: 保存 / 破棄 / キャンセル) の回帰テスト。
// 受け入れ条件:
//   - 「保存して終了」連打で重複保存されない (再入 guard)
//   - 保存/破棄の失敗時に guard が解除され再試行できる (シートは閉じない前提)
//   - 破棄は repo の discardSession (4テーブル一括 tombstone) を1回だけ呼ぶ
//   - 保存と破棄は相互排他
//   - 経過時間はタイムスタンプ差分でバックグラウンド凍結の影響を受けない

import {
  collectSessionStats,
  computeElapsedSeconds,
  createSessionExitController,
  formatDiscardSummary,
} from '../sessionExit';

const makeSet = (
  completed: boolean,
  weightKg: number | null = 60,
  reps: number | null = 10,
) => ({ completed, weightKg, reps });

describe('collectSessionStats', () => {
  it('完了セットのある種目数・完了セット数・総ボリュームを集計する', () => {
    const stats = collectSessionStats([
      { sets: [makeSet(true, 60, 10), makeSet(true, 60, 8), makeSet(false)] },
      { sets: [makeSet(false), makeSet(false)] }, // 未完了のみ → 種目数に含めない
      { sets: [makeSet(true, 40, 12)] },
    ]);
    expect(stats.exerciseCount).toBe(2);
    expect(stats.completedSetCount).toBe(3);
    expect(stats.totalVolumeKg).toBe(60 * 10 + 60 * 8 + 40 * 12);
  });

  it('空セッション・null 重量/回数を安全に扱う (0セット2択分岐の判定元)', () => {
    expect(collectSessionStats([])).toEqual({
      exerciseCount: 0,
      completedSetCount: 0,
      totalVolumeKg: 0,
    });
    const stats = collectSessionStats([{ sets: [makeSet(true, null, null)] }]);
    expect(stats.completedSetCount).toBe(1);
    expect(stats.totalVolumeKg).toBe(0);
  });
});

describe('formatDiscardSummary', () => {
  it('「経過32分・4種目12セット」形式', () => {
    expect(
      formatDiscardSummary(32 * 60 + 45, {
        exerciseCount: 4,
        completedSetCount: 12,
        totalVolumeKg: 0,
      }),
    ).toBe('経過32分・4種目12セット');
  });

  it('1分未満は「経過1分未満」', () => {
    expect(
      formatDiscardSummary(59, { exerciseCount: 0, completedSetCount: 0, totalVolumeKg: 0 }),
    ).toBe('経過1分未満・0種目0セット');
  });
});

describe('computeElapsedSeconds', () => {
  const T0 = Date.parse('2026-07-12T10:00:00.000Z');

  it('startedAt からの壁時計差分を返す', () => {
    expect(computeElapsedSeconds('2026-07-12T10:00:00.000Z', T0 + 90_000, T0)).toBe(90);
  });

  it('バックグラウンド凍結をまたいでも now の差分で収束する (加算方式との差)', () => {
    expect(computeElapsedSeconds('2026-07-12T10:00:00.000Z', T0 + 600_000, T0)).toBe(600);
  });

  it('startedAt が null / 不正 / 未来なら fallback (マウント時刻) 起点', () => {
    expect(computeElapsedSeconds(null, T0 + 5_000, T0)).toBe(5);
    expect(computeElapsedSeconds('not-a-date', T0 + 5_000, T0)).toBe(5);
    expect(computeElapsedSeconds('2026-07-12T11:00:00.000Z', T0 + 5_000, T0)).toBe(5);
    expect(computeElapsedSeconds(null, T0, T0 + 10_000)).toBe(0);
  });
});

describe('createSessionExitController', () => {
  const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  const makeDeps = () => ({
    finishSession: jest.fn().mockResolvedValue({ durationSeconds: 100 }),
    discardSession: jest.fn().mockResolvedValue(undefined),
  });

  it('saveExit は finishSession を1回だけ引数どおりに呼ぶ', async () => {
    const deps = makeDeps();
    const controller = createSessionExitController(deps);
    await expect(controller.saveExit('s1', 'メモ', 250)).resolves.toBe('done');
    expect(deps.finishSession).toHaveBeenCalledTimes(1);
    expect(deps.finishSession).toHaveBeenCalledWith('s1', 'メモ', 250);
    expect(deps.discardSession).not.toHaveBeenCalled();
  });

  it('保存連打: 実行中の再入は busy を返し finishSession は1回しか呼ばれない', async () => {
    const gate = deferred<void>();
    const deps = makeDeps();
    deps.finishSession.mockReturnValue(gate.promise);
    const controller = createSessionExitController(deps);
    const first = controller.saveExit('s1');
    await expect(controller.saveExit('s1')).resolves.toBe('busy');
    await expect(controller.saveExit('s1')).resolves.toBe('busy');
    expect(controller.isBusy()).toBe(true);
    gate.resolve();
    await expect(first).resolves.toBe('done');
    expect(deps.finishSession).toHaveBeenCalledTimes(1);
    expect(controller.isBusy()).toBe(false);
  });

  it('保存失敗で guard が解除され、再試行できる (エラーは呼び出し側へ伝播)', async () => {
    const deps = makeDeps();
    deps.finishSession
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(undefined);
    const controller = createSessionExitController(deps);
    await expect(controller.saveExit('s1')).rejects.toThrow('disk full');
    expect(controller.isBusy()).toBe(false);
    await expect(controller.saveExit('s1')).resolves.toBe('done');
    expect(deps.finishSession).toHaveBeenCalledTimes(2);
  });

  it('discardExit は discardSession を1回だけ呼ぶ (S3-2: repo が tombstone 一括処理)', async () => {
    const deps = makeDeps();
    const controller = createSessionExitController(deps);
    await expect(controller.discardExit('s1')).resolves.toBe('done');
    expect(deps.discardSession).toHaveBeenCalledTimes(1);
    expect(deps.discardSession).toHaveBeenCalledWith('s1');
    expect(deps.finishSession).not.toHaveBeenCalled();
  });

  it('破棄失敗でも guard が解除され再試行できる (repo 側は全ロールバック済み)', async () => {
    const deps = makeDeps();
    deps.discardSession
      .mockRejectedValueOnce(new Error('db locked'))
      .mockResolvedValueOnce(undefined);
    const controller = createSessionExitController(deps);
    await expect(controller.discardExit('s1')).rejects.toThrow('db locked');
    expect(controller.isBusy()).toBe(false);
    await expect(controller.discardExit('s1')).resolves.toBe('done');
  });

  it('保存と破棄は相互排他 (保存中の破棄は busy、破棄中の保存も busy)', async () => {
    const gate = deferred<void>();
    const deps = makeDeps();
    deps.finishSession.mockReturnValue(gate.promise);
    const controller = createSessionExitController(deps);
    const save = controller.saveExit('s1');
    await expect(controller.discardExit('s1')).resolves.toBe('busy');
    expect(deps.discardSession).not.toHaveBeenCalled();
    gate.resolve();
    await expect(save).resolves.toBe('done');

    const gate2 = deferred<void>();
    deps.discardSession.mockReturnValue(gate2.promise);
    const discard = controller.discardExit('s1');
    await expect(controller.saveExit('s1')).resolves.toBe('busy');
    gate2.resolve();
    await expect(discard).resolves.toBe('done');
  });
});
