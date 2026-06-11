import { loadFontWithRetry } from '../loadFontWithRetry';

describe('loadFontWithRetry', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("初回成功で 'loaded' を返す", async () => {
    const load = jest.fn().mockResolvedValue(undefined);
    await expect(loadFontWithRetry(load)).resolves.toBe('loaded');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("初回 reject → retry 成功で 'loaded' を返す", async () => {
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error('cold start asset race'))
      .mockResolvedValueOnce(undefined);
    await expect(loadFontWithRetry(load)).resolves.toBe('loaded');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("初回 + retry 全滅で 'failed' に resolve する (reject しない)", async () => {
    const load = jest.fn().mockRejectedValue(new Error('always fails'));
    await expect(loadFontWithRetry(load, { retries: 1 })).resolves.toBe(
      'failed',
    );
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("load が同期 throw しても 'failed' に resolve する", async () => {
    const load = jest.fn(() => {
      throw new Error('sync throw');
    }) as unknown as () => Promise<void>;
    await expect(loadFontWithRetry(load)).resolves.toBe('failed');
  });

  it("timeoutMs 内に決着しなければ 'timeout' で resolve する", async () => {
    jest.useFakeTimers();
    const load = jest.fn(() => new Promise<void>(() => {})); // 永遠に pending
    const result = loadFontWithRetry(load, { timeoutMs: 2500 });
    jest.advanceTimersByTime(2500);
    await expect(result).resolves.toBe('timeout');
  });

  it('retry 中の hang も timeout が拾う (初回 reject → 2回目 pending)', async () => {
    jest.useFakeTimers();
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockImplementationOnce(() => new Promise<void>(() => {}));
    const result = loadFontWithRetry(load, { retries: 1, timeoutMs: 2500 });
    // microtask を流して retry に入らせてから時計を進める
    await Promise.resolve();
    jest.advanceTimersByTime(2500);
    await expect(result).resolves.toBe('timeout');
  });

  it('成功が timeout より先なら timer はキャンセルされ leak しない', async () => {
    jest.useFakeTimers();
    const load = jest.fn().mockResolvedValue(undefined);
    await expect(loadFontWithRetry(load, { timeoutMs: 2500 })).resolves.toBe(
      'loaded',
    );
    expect(jest.getTimerCount()).toBe(0);
  });
});
