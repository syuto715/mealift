// S4.5-C — 集中モードのタブバー非表示 7 経路回帰テスト。
//
// 各経路を「(segments, workoutSessionActive) スナップショットの列」として
// モデル化し、経路の全時点で非表示が維持されることを固定する。in-screen の
// UI 操作 (RN Modal のシート / Alert / キーボード) は segments を変えないので、
// 判定入力が (SESSION, true) から動かないこと自体が構造保証 — テストは
// 「その入力なら常に true」という不変条件と、route が動く経路 (種目追加往復の
// paywall push・native pop) でも store 主体で true になることを検分する。
import {
  shouldHideTabBar,
  shouldShowSessionReturnPill,
} from '../tabBarVisibility';

const SESSION = ['(tabs)', 'training', 'session'];
const TRAINING_INDEX = ['(tabs)', 'training'];
const SUBSCRIPTION = ['(tabs)', 'settings', 'subscription'];

/** 経路の全スナップショットで非表示が維持されることを検分 */
function expectHiddenThroughout(
  path: { segments: readonly string[]; active: boolean }[],
) {
  for (const [i, snap] of path.entries()) {
    expect({ step: i, hidden: shouldHideTabBar(snap.segments, snap.active) }).toEqual({
      step: i,
      hidden: true,
    });
  }
}

describe('shouldHideTabBar — S4.5-C 7経路回帰', () => {
  it('経路1: 終了シート開閉 — シートは RN Modal (route 非変化) なので全時点で非表示', () => {
    expectHiddenThroughout([
      { segments: SESSION, active: true }, // セッション中
      { segments: SESSION, active: true }, // 終了シート open
      { segments: SESSION, active: true }, // キャンセルで close
    ]);
  });

  it('経路2: 破棄キャンセル後 — 確認をキャンセルしても判定入力は不変で非表示維持', () => {
    expectHiddenThroughout([
      { segments: SESSION, active: true }, // シート open
      { segments: SESSION, active: true }, // 破棄 UI 表示
      { segments: SESSION, active: true }, // キャンセル → シートへ戻る
      { segments: SESSION, active: true }, // シート close
    ]);
  });

  it('経路3: シート下スワイプ dismiss 後も非表示維持', () => {
    expectHiddenThroughout([
      { segments: SESSION, active: true },
      { segments: SESSION, active: true }, // swipe-down dismiss (onRequestClose)
    ]);
  });

  it('経路4: バックグラウンド復帰 — segments が transient に欠けても store 主体で非表示', () => {
    expectHiddenThroughout([
      { segments: SESSION, active: true }, // BG 直前
      { segments: [], active: true }, // 復帰直後の transient (再マウント等で segments 未確定)
      { segments: SESSION, active: true }, // 復帰後
    ]);
  });

  it('経路5: 種目追加往復 — in-screen シートは route 非変化、セッション中の route push (paywall) でも非表示', () => {
    expectHiddenThroughout([
      { segments: SESSION, active: true }, // 種目追加シート open/close (route 不変)
      { segments: SUBSCRIPTION, active: true }, // S3-1 実装が破れた実在経路: session 上への push
      { segments: SESSION, active: true }, // 戻ってきた
    ]);
  });

  it('経路6: 保存失敗 — endSession は呼ばれないので非表示維持 (再試行可能状態)', () => {
    expectHiddenThroughout([
      { segments: SESSION, active: true }, // 保存実行
      { segments: SESSION, active: true }, // 失敗 Alert 表示
      { segments: SESSION, active: true }, // Alert 閉じ → シート維持
    ]);
  });

  it('経路7: 終了ボタン連打 — 同一入力の再評価は冪等に true', () => {
    for (let i = 0; i < 10; i++) {
      expect(shouldHideTabBar(SESSION, true)).toBe(true);
    }
  });

  it('native pop で session が route から消えても、セッション進行中は store 主体で非表示', () => {
    // usePreventRemove を素通りする native 経路 (Android predictive back 等) の防波堤
    expect(shouldHideTabBar(TRAINING_INDEX, true)).toBe(true);
  });

  it('復帰: 保存/破棄完了 (endSession + pop) でタブバーが再表示される', () => {
    expect(shouldHideTabBar(TRAINING_INDEX, false)).toBe(false);
    expect(shouldHideTabBar(['(tabs)', 'index'], false)).toBe(false);
  });

  it('未初期化 session 画面 (params なし・store 未 start) は segments fallback で非表示', () => {
    // store フラグは post-mount effect で立つため、push 直後の初回フレームも同じ入力になる
    expect(shouldHideTabBar(SESSION, false)).toBe(true);
  });

  it('コーチ会話 ((tabs)/coach/[id]) は従来どおり route 判定で非表示、coach/index は表示', () => {
    expect(shouldHideTabBar(['(tabs)', 'coach', '[id]'], false)).toBe(true);
    expect(shouldHideTabBar(['(tabs)', 'coach'], false)).toBe(false);
    // '[id]' 単体 (直前が coach でない) は隠さない
    expect(shouldHideTabBar(['(tabs)', 'progress', '[id]'], false)).toBe(false);
  });
});

// S4.5-C2 — 「セッションに戻る」復帰 pill。store 主体の非表示が作り得る
// 袋小路 (paywall 迂回で settings/index に着地 / native pop で session 画面が
// 消える) の全クラスに対する回復導線。
describe('shouldShowSessionReturnPill — S4.5-C2 袋小路の回復導線', () => {
  it('paywall 迂回中 (セッション進行中 × settings 系 route) は pill を出す', () => {
    expect(shouldShowSessionReturnPill(SUBSCRIPTION, true)).toBe(true);
    expect(shouldShowSessionReturnPill(['(tabs)', 'settings'], true)).toBe(true);
  });

  it('native pop で session が route から消えた孤児状態でも pill を出す', () => {
    expect(shouldShowSessionReturnPill(TRAINING_INDEX, true)).toBe(true);
    expect(shouldShowSessionReturnPill(['(tabs)', 'index'], true)).toBe(true);
  });

  it('session 画面上では出さない (集中モードのノイズにしない)', () => {
    expect(shouldShowSessionReturnPill(SESSION, true)).toBe(false);
  });

  it('セッションが無ければどこでも出さない', () => {
    expect(shouldShowSessionReturnPill(TRAINING_INDEX, false)).toBe(false);
    expect(shouldShowSessionReturnPill(SUBSCRIPTION, false)).toBe(false);
    expect(shouldShowSessionReturnPill(['(tabs)', 'coach', '[id]'], false)).toBe(false);
  });
});
