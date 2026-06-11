// v1.5.1 Fix 1 — タブバー glyph 欠落の root font gate 用ヘルパ。
//
// 背景 (Phase 0 recon): タブバーの Ionicons は起動フレーム1で font ロード
// 完了前に mount される唯一のアイコン群で、@expo/vector-icons の
// 「未ロード時は空 <Text /> を描画 → loadAsync 後に setState で自己回復」
// パスが production で失われ、glyph が恒久欠落する。対策として root
// _layout で本ヘルパを await し、ready になるまで子ツリーを mount しない。
//
// 契約 (splash 永久ハング禁止の要):
//   - この Promise は **いかなる入力でも reject しない**。必ず
//     'loaded' | 'failed' | 'timeout' のいずれかで resolve する。
//   - 'failed'  = 初回 + retry (計 retries+1 回) が全て失敗。
//   - 'timeout' = timeoutMs 以内に決着しなかった (ロード自体は裏で継続
//     し得るが、呼び出し側はアプリを進めてよい)。
//   - load() が同期 throw しても async 境界内で捕捉される。
export type FontGateResult = 'loaded' | 'failed' | 'timeout';

export interface LoadFontWithRetryOptions {
  /** 失敗時の再試行回数 (試行総数は retries + 1)。 */
  retries?: number;
  /** これを超えたら 'timeout' で resolve しアプリを進める。 */
  timeoutMs?: number;
}

export function loadFontWithRetry(
  load: () => Promise<void>,
  { retries = 1, timeoutMs = 2500 }: LoadFontWithRetryOptions = {},
): Promise<FontGateResult> {
  const attempt = async (): Promise<FontGateResult> => {
    for (let i = 0; i <= retries; i++) {
      try {
        await load();
        return 'loaded';
      } catch {
        // 失敗は握り潰して retry へ。最終試行の失敗は 'failed' に落ちる。
      }
    }
    return 'failed';
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<FontGateResult>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });

  return Promise.race([attempt(), timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
