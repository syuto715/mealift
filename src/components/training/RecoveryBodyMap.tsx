import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import Svg, {
  Path,
  Ellipse,
  Rect,
  Circle,
  G,
  Text as SvgText,
} from 'react-native-svg';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import type { MuscleGroup } from '../../types/common';
import type {
  RecoveryMapEntry,
  RecoveryMapState,
} from '../../domain/weeklyTrainingReport';

// S4-3 — 週次トレーニングレポートの回復マップ (前面/背面の自作 SVG 人体図)。
//
// 既存 MuscleBodyDiagram (Build 16 heatmap) とは別コンポーネント:
//   - 粒度が違う: あちらは VolumeGroup 9値 (系統B recovery.ts)、こちらは
//     MuscleGroup 6部位 (系統A workoutSuggestion = 「今日のおすすめ」と同源。
//     カレンダーの部位フィルタとも同一体系なのでタップ遷移が無変換で繋がる)
//   - 色契約が違う: あちらは回復中=error 赤。こちらは 3-3 semantic token 規約
//     (回復系に赤禁止・責めないトーン) に従い、状態を担う塗りは statusXText
//     (light=濃色 / dark=bright 系)、記録なしは statusNeutral tint + 破線
//   - タップ領域: 図形実寸によらず各部位に透明ヒット Rect を敷き、
//     220×440 描画 (viewBox 200×400 = 1.1 倍) で 40 viewBox 単位 = 44pt 以上を
//     保証する
//
// シルエットの形状座標は MuscleBodyDiagram の手描きシルエットを踏襲 (前後共用)。
// 色のみ依存の回避: 各部位に経過日数の SvgText オーバーレイ + 凡例は記号付き +
// per-region の a11yLabel に状態と経過日数を全文で載せる。

export type RecoverySide = 'front' | 'back';

interface RecoveryBodyMapProps {
  entries: RecoveryMapEntry[];
  currentSide: RecoverySide;
  onToggleSide: () => void;
  onMusclePress?: (group: MuscleGroup) => void;
}

const STATE_LABEL_JA: Record<RecoveryMapState, string> = {
  recovered: '回復済み',
  recovering: '回復中',
  untrained: '記録なし',
};

const STATE_SYMBOL: Record<RecoveryMapState, string> = {
  recovered: '✓',
  recovering: '△',
  untrained: '—',
};

// 各部位の描画図形 + 44pt 保証ヒット領域 + 日数ラベル位置。
// legs は前面=大腿四頭筋、背面=臀部/ハム/カーフをまとめて 1 部位として塗る
// (6 部位粒度では脚は一体)。chest / core は前面のみ、back は背面のみ。
interface RegionSpec {
  group: MuscleGroup;
  // 40×40 viewBox 単位以上 (= 44pt 以上 @220×440 描画)
  hit: { x: number; y: number; width: number; height: number };
  label: { x: number; y: number };
  shapes: (fill: string) => React.ReactNode;
}

const FRONT_REGIONS: RegionSpec[] = [
  {
    group: 'chest',
    hit: { x: 75, y: 70, width: 50, height: 40 },
    label: { x: 100, y: 96 },
    shapes: (fill) => (
      <Rect x={75} y={78} width={50} height={28} rx={12} fill={fill} />
    ),
  },
  {
    group: 'core',
    hit: { x: 75, y: 110, width: 50, height: 40 },
    label: { x: 100, y: 134 },
    shapes: (fill) => (
      <Rect x={78} y={112} width={44} height={36} rx={10} fill={fill} />
    ),
  },
  {
    group: 'shoulders',
    hit: { x: 34, y: 62, width: 40, height: 40 },
    label: { x: 56, y: 70 },
    shapes: (fill) => (
      <>
        <Ellipse cx={56} cy={82} rx={11} ry={9} fill={fill} />
        <Ellipse cx={144} cy={82} rx={11} ry={9} fill={fill} />
      </>
    ),
  },
  {
    group: 'arms',
    hit: { x: 31, y: 105, width: 40, height: 40 },
    label: { x: 51, y: 158 },
    shapes: (fill) => (
      <>
        <Ellipse cx={51} cy={125} rx={9} ry={20} fill={fill} />
        <Ellipse cx={149} cy={125} rx={9} ry={20} fill={fill} />
      </>
    ),
  },
  {
    group: 'legs',
    hit: { x: 60, y: 200, width: 80, height: 80 },
    label: { x: 100, y: 244 },
    shapes: (fill) => (
      <>
        <Ellipse cx={80} cy={240} rx={11} ry={36} fill={fill} />
        <Ellipse cx={120} cy={240} rx={11} ry={36} fill={fill} />
      </>
    ),
  },
];

const BACK_REGIONS: RegionSpec[] = [
  {
    group: 'back',
    hit: { x: 73, y: 75, width: 54, height: 75 },
    label: { x: 100, y: 116 },
    shapes: (fill) => (
      <Rect x={73} y={75} width={54} height={75} rx={16} fill={fill} />
    ),
  },
  {
    group: 'shoulders',
    hit: { x: 34, y: 62, width: 40, height: 40 },
    label: { x: 56, y: 70 },
    shapes: (fill) => (
      <>
        <Ellipse cx={56} cy={82} rx={11} ry={9} fill={fill} />
        <Ellipse cx={144} cy={82} rx={11} ry={9} fill={fill} />
      </>
    ),
  },
  {
    group: 'arms',
    hit: { x: 31, y: 105, width: 40, height: 40 },
    label: { x: 51, y: 158 },
    shapes: (fill) => (
      <>
        <Ellipse cx={51} cy={125} rx={9} ry={20} fill={fill} />
        <Ellipse cx={149} cy={125} rx={9} ry={20} fill={fill} />
      </>
    ),
  },
  {
    group: 'legs',
    hit: { x: 60, y: 188, width: 80, height: 160 },
    label: { x: 100, y: 206 },
    shapes: (fill) => (
      <>
        <Rect x={72} y={188} width={56} height={28} rx={12} fill={fill} />
        <Ellipse cx={80} cy={252} rx={11} ry={28} fill={fill} />
        <Ellipse cx={120} cy={252} rx={11} ry={28} fill={fill} />
        <Ellipse cx={80} cy={325} rx={11} ry={22} fill={fill} />
        <Ellipse cx={120} cy={325} rx={11} ry={22} fill={fill} />
      </>
    ),
  },
];

export function RecoveryBodyMap({
  entries,
  currentSide,
  onToggleSide,
  onMusclePress,
}: RecoveryBodyMapProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const byGroup = new Map(entries.map((e) => [e.group, e]));

  // 状態を担う塗りは statusXText (3-3 契約: bright fill は情報を担わない
  // tint/装飾のみ)。記録なしは tint + 破線ストロークで「データ無し」を
  // 塗り以外でも区別する。
  const fillFor = (state: RecoveryMapState): string => {
    if (state === 'recovered') return colors.statusSuccessText;
    if (state === 'recovering') return colors.statusWarningText;
    return colors.statusNeutral + '18';
  };

  const regions = currentSide === 'front' ? FRONT_REGIONS : BACK_REGIONS;

  return (
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        {(['front', 'back'] as const).map((side) => (
          <TouchableOpacity
            key={side}
            onPress={() => currentSide !== side && onToggleSide()}
            style={[
              styles.toggleBtn,
              currentSide === side && { backgroundColor: colors.primary },
            ]}
            accessibilityRole="button"
            accessibilityLabel={side === 'front' ? '正面ビュー' : '背面ビュー'}
            accessibilityState={{ selected: currentSide === side }}
          >
            <Text
              style={[
                styles.toggleText,
                {
                  color:
                    currentSide === side ? '#FFFFFF' : colors.textSecondary,
                },
              ]}
            >
              {side === 'front' ? '正面' : '背面'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Svg
        width={220}
        height={440}
        viewBox="0 0 200 400"
        accessibilityLabel={`部位別回復マップ ${currentSide === 'front' ? '正面' : '背面'}`}
      >
        <Silhouette
          fill={colors.surfaceSecondary}
          stroke={colors.border}
        />
        {regions.map((region) => {
          const entry = byGroup.get(region.group);
          if (!entry) return null;
          return (
            <RecoveryRegion
              key={region.group}
              region={region}
              entry={entry}
              fill={fillFor(entry.state)}
              onPress={onMusclePress}
              colors={colors}
            />
          );
        })}
      </Svg>

      <View style={styles.legendRow}>
        {(['recovered', 'recovering', 'untrained'] as const).map((state) => (
          <LegendChip key={state} state={state} />
        ))}
      </View>
    </View>
  );
}

function RecoveryRegion({
  region,
  entry,
  fill,
  onPress,
  colors,
}: {
  region: RegionSpec;
  entry: RecoveryMapEntry;
  fill: string;
  onPress?: (group: MuscleGroup) => void;
  colors: ReturnType<typeof getColors>;
}) {
  const interactive = onPress !== undefined;
  let a11yLabel = `${entry.labelJa}: ${STATE_LABEL_JA[entry.state]}`;
  if (entry.daysSince !== null) {
    a11yLabel +=
      entry.daysSince === 0
        ? '、今日トレーニング済み'
        : `、最終トレーニングから${entry.daysSince}日`;
  }
  if (interactive) {
    a11yLabel += '。タップでカレンダーを表示';
  }

  return (
    <G
      onPress={onPress ? () => onPress(entry.group) : undefined}
      accessibilityLabel={a11yLabel}
      accessibilityRole={interactive ? 'button' : 'image'}
    >
      {/* 44pt 保証の透明ヒット領域 (G の onPress は描画領域にのみ反応するため) */}
      <Rect
        x={region.hit.x}
        y={region.hit.y}
        width={region.hit.width}
        height={region.hit.height}
        fill="transparent"
      />
      {entry.state === 'untrained' ? (
        <G
          stroke={colors.statusNeutralText}
          strokeWidth={1}
          strokeDasharray="3 2"
        >
          {region.shapes(fill)}
        </G>
      ) : (
        region.shapes(fill)
      )}
      {/* 経過日数の非色情報オーバーレイ (MuscleBodyDiagram の % 表示と同型) */}
      {entry.daysSince !== null && (
        <SvgText
          x={region.label.x}
          y={region.label.y}
          fontSize={9}
          fontWeight="bold"
          fill={colors.textPrimary}
          textAnchor="middle"
          stroke={colors.surface}
          strokeWidth={0.5}
        >
          {entry.daysSince === 0 ? '今日' : `${entry.daysSince}日`}
        </SvgText>
      )}
    </G>
  );
}

// シルエット (MuscleBodyDiagram と同座標・前後共用)
function Silhouette({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <G>
      <Circle cx={100} cy={35} r={22} fill={fill} stroke={stroke} strokeWidth={1} />
      <Rect x={92} y={55} width={16} height={12} fill={fill} stroke={stroke} strokeWidth={1} />
      <Path
        d="M 65 70 Q 65 65, 75 65 L 125 65 Q 135 65, 135 70 L 138 180 Q 138 188, 130 188 L 70 188 Q 62 188, 62 180 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
      <Path
        d="M 62 80 Q 50 80, 48 95 L 42 165 Q 41 175, 47 175 L 56 175 Q 60 175, 60 165 L 65 90 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
      <Path
        d="M 138 80 Q 150 80, 152 95 L 158 165 Q 159 175, 153 175 L 144 175 Q 140 175, 140 165 L 135 90 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
      <Path
        d="M 70 188 L 78 188 L 90 360 Q 90 370, 82 370 L 70 370 Q 62 370, 64 360 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
      <Path
        d="M 130 188 L 122 188 L 110 360 Q 110 370, 118 370 L 130 370 Q 138 370, 136 360 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
    </G>
  );
}

// 凡例 — バッジ規約 (bg = statusX + '18' tint + statusXText、記号併記で
// 色のみ依存を回避)
function LegendChip({ state }: { state: RecoveryMapState }) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const tint =
    state === 'recovered'
      ? colors.statusSuccess
      : state === 'recovering'
        ? colors.statusWarning
        : colors.statusNeutral;
  const text =
    state === 'recovered'
      ? colors.statusSuccessText
      : state === 'recovering'
        ? colors.statusWarningText
        : colors.statusNeutralText;
  return (
    <View style={[styles.legendChip, { backgroundColor: tint + '18' }]}>
      <Text style={[styles.legendChipText, { color: text }]}>
        {`${STATE_SYMBOL[state]} ${STATE_LABEL_JA[state]}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toggleBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    minHeight: 44,
    justifyContent: 'center',
  },
  toggleText: {
    ...typography.labelMedium,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  legendChip: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  legendChipText: {
    ...typography.labelSmall,
  },
});
