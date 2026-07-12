import type { BalanceStatus } from '../../domain/nutrientBalance';
import type { ThemeColors } from '../../theme/tokens';

// S3-3-B — 栄養バランスの状態バッジ共通プレゼンテーション (NutrientBar と
// balance.tsx 表モードで共有)。
// - 色だけに依存しない: 記号 + ラベルを常に併記 (「△ 不足」形式)
// - 旧実装は 不足=青 (操作色の誤用。P/F/C 差分等の「不足=橙」とも不整合) の
//   白文字ソリッドバッジ → S3-3-A の status 系トークンで tint 背景 + AA テキスト
// - 摂取ゼロは「不足」ではなく「— 未記録」の中立表示 (UI 層判定。domain の
//   getStatus は不変)

export interface BalanceStatusPresentation {
  /** 「△ 不足」のような記号込み表示文字列 */
  text: string;
  /** スクリーンリーダー用 (記号なし — 記号名の読み上げ混入を避ける) */
  a11yLabel: string;
  bg: string;
  color: string;
}

export function getBalanceStatusPresentation(
  status: BalanceStatus,
  intake: number,
  colors: ThemeColors,
): BalanceStatusPresentation {
  if (status === 'deficient' && intake <= 0) {
    return {
      text: '— 未記録',
      a11yLabel: '未記録',
      bg: colors.surfaceSecondary,
      color: colors.statusNeutralText,
    };
  }
  switch (status) {
    case 'adequate':
      return {
        text: '✓ 適正',
        a11yLabel: '適正',
        bg: colors.statusSuccess + '18',
        color: colors.statusSuccessText,
      };
    case 'excess':
      return {
        text: '↑ 過剰',
        a11yLabel: '過剰',
        bg: colors.statusWarning + '18',
        color: colors.statusWarningText,
      };
    case 'deficient':
      return {
        text: '△ 不足',
        a11yLabel: '不足',
        bg: colors.statusWarning + '18',
        color: colors.statusWarningText,
      };
  }
}
