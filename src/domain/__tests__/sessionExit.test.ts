// S3-1 — セッション終了 (2択シート: 保存して終了 / キャンセル) の回帰テスト。
// 受け入れ条件:
//   - 「保存して終了」連打で重複保存されない (再入 guard)
//   - 保存失敗時に guard が解除され再試行できる (シートは閉じない前提)
//   - 経過時間はタイムスタンプ差分でバックグラウンド凍結の影響を受けない
// 破棄導線は S3-1 R3 で除去済み (discardSession は Sprint 3-2 の設計課題)。

import {
  computeElapsedSeconds,
  createSessionExitController,
} from '../sessionExit';

describe('computeElapsedSeconds', () => {
  const T0 = Date.parse('2026-07-12T10:00:00.000Z');

  it('startedAt からの壁時計差分を返す', () => {
    expect(computeElapsedSeconds('2026-07-12T10:00:00.000Z', T0 + 90_000, T0)).toBe(90);
  });

  it('バックグラウンド凍結をまたいでも now の差分で収束する (加算方式との差)', () => {
    const startedAt = '2026-07-12T10:00:00.000Z';
    // 10 分後に復帰した最初の tick — 加算方式なら凍結分だけ小さくなるが、
    // 差分方式は正しい 600 秒を返す
    expect(computeElapsedSeconds(startedAt, T0 + 600_000, T0)).toBe(600);
  });

  it('startedAt が null / 不正 / 未来なら fallback (マウント時刻) 起点', () => {
    expect(computeElapsedSeconds(null, T0 + 5_000, T0)).toBe(5);
    expect(computeElapsedSeconds('not-a-date', T0 + 5_000, T0)).toBe(5);
    expect(
      computeElapsedSeconds('2026-07-12T11:00:00.000Z', T0 + 5_000, T0), // 未来
    ).toBe(5);
    // fallback ですら未来 (時計巻き戻し) なら 0 に clamp
    expect(computeElapsedSeconds(null, T0, T0 + 10_000)).toBe(0);
  });
});

describe('createSessionExitController (2択シートの保存経路)', () => {
  const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  it('saveExit は finishSession を1回だけ引数どおりに呼ぶ', async () => {
    const finishSession = jest.fn().mockResolvedValue({ durationSeconds: 100 });
    const controller = createSessionExitController({ finishSession });
    await expect(controller.saveExit('s1', 'メモ', 250)).resolves.toBe('done');
    expect(finishSession).toHaveBeenCalledTimes(1);
    expect(finishSession).toHaveBeenCalledWith('s1', 'メモ', 250);
  });

  it('保存連打: 実行中の再入は busy を返し finishSession は1回しか呼ばれない', async () => {
    const gate = deferred<void>();
    const finishSession = jest.fn().mockReturnValue(gate.promise);
    const controller = createSessionExitController({ finishSession });
    const first = controller.saveExit('s1');
    await expect(controller.saveExit('s1')).resolves.toBe('busy'); // 連打1
    await expect(controller.saveExit('s1')).resolves.toBe('busy'); // 連打2
    expect(controller.isBusy()).toBe(true);
    gate.resolve();
    await expect(first).resolves.toBe('done');
    expect(finishSession).toHaveBeenCalledTimes(1);
    expect(controller.isBusy()).toBe(false);
  });

  it('保存失敗で guard が解除され、再試行できる (エラーは呼び出し側へ伝播)', async () => {
    const finishSession = jest
      .fn()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(undefined);
    const controller = createSessionExitController({ finishSession });
    await expect(controller.saveExit('s1')).rejects.toThrow('disk full');
    expect(controller.isBusy()).toBe(false); // guard 解除済み
    await expect(controller.saveExit('s1')).resolves.toBe('done'); // 再試行成功
    expect(finishSession).toHaveBeenCalledTimes(2);
  });

  it('キャンセル相当 (何も実行しない) の後も保存できる — guard が誤って残らない', async () => {
    const finishSession = jest.fn().mockResolvedValue(undefined);
    const controller = createSessionExitController({ finishSession });
    // シートを開いて閉じるだけの操作は controller に触れない
    expect(controller.isBusy()).toBe(false);
    await expect(controller.saveExit('s1')).resolves.toBe('done');
  });
});
