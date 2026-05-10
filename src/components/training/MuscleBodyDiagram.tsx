import React, { useMemo } from 'react';
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
import type { VolumeGroup, VolumeZone } from '../../domain/volumeLandmark';
import type { RecoveryState } from '../../domain/recovery';

// Build 16 / Phase 6 (Muscle Recovery Heatmap) / Phase 6.2 — SVG
// body diagram component.
//
// Hand-drawn silhouette (sign-off C1 (a) — react-native-svg already
// in heavy use across 7 files, no new dependency). 9 muscle paths
// distributed across Front and Back views, toggled by a parent
// button (sign-off C8 (a) single-screen toggle).
//
// Color mapping (sign-off C3 (b) — recovery primary, volume secondary):
//   - Muscle path fill = RecoveryStateLabel
//       'unstimulated' → light gray (未トレーニング)
//       'recovering'   → error red (< 50% 回復)
//       'partial'      → warning yellow (50-100%)
//       'recovered'    → success green (≥ 100%)
//   - Optional volume zone (when caller provides volumeByGroup):
//       small Circle next to the muscle, colored by VolumeZone with
//       the same palette Phase 2.2 VolumeLandmarkChart uses.
//   - Optional active deload overlay (Phase 4 affected_muscles):
//       small ⚠ marker on the muscle group.
//
// Layout:
//   200×400 viewBox. Ratio ~1:2 mirrors a stylized human body.
//   Front: chest, shoulder_mid (front), biceps, quads.
//   Back:  back/lats, shoulder_mid (back), triceps, hamstrings,
//          glutes, calves.
//   Paired muscles (biceps, triceps, quads, hamstrings, calves,
//   shoulder_mid) render as left+right Ellipse pairs but share a
//   single VolumeGroup key — tapping either side fires the same
//   onMusclePress callback.

interface MuscleBodyDiagramProps {
  recoveryByGroup: Record<VolumeGroup, RecoveryState>;
  volumeByGroup?: Partial<Record<VolumeGroup, VolumeZone>>;
  activeDeloadMuscles?: VolumeGroup[];
  currentSide: 'front' | 'back';
  onToggleSide: () => void;
  onMusclePress?: (group: VolumeGroup) => void;
}

export function MuscleBodyDiagram({
  recoveryByGroup,
  volumeByGroup,
  activeDeloadMuscles,
  currentSide,
  onToggleSide,
  onMusclePress,
}: MuscleBodyDiagramProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const recoveryColor = useMemo(
    () => ({
      unstimulated: scheme === 'dark' ? '#3A3F47' : '#E5E7EB',
      recovering: colors.error,
      partial: colors.warning,
      recovered: colors.success,
    }),
    [scheme, colors.error, colors.warning, colors.success],
  );

  // Volume zone palette mirrors Phase 2.2 VolumeLandmarkChart's
  // ZONE_COLORS (mavRange green for the optimal band, warning for
  // the over-MAV approach, error for the past-MRV overshoot, gray
  // for under-MEV).
  const volumeColor: Record<VolumeZone, string> = useMemo(
    () => ({
      below_mev: colors.textTertiary,
      mev_to_mav: colors.success,
      mav_to_mrv: colors.success,
      above_mrv: colors.error,
    }),
    [colors.textTertiary, colors.success, colors.error],
  );

  const deloadSet = useMemo(
    () => new Set(activeDeloadMuscles ?? []),
    [activeDeloadMuscles],
  );

  const fillFor = (group: VolumeGroup): string => {
    const state = recoveryByGroup[group]?.state ?? 'unstimulated';
    return recoveryColor[state];
  };

  const zoneFor = (group: VolumeGroup): VolumeZone | undefined => {
    return volumeByGroup?.[group];
  };

  const silhouetteFill = scheme === 'dark' ? '#21262D' : '#F1F3F5';
  const silhouetteStroke =
    scheme === 'dark' ? '#30363D' : '#D1D5DB';

  return (
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        <TouchableOpacity
          onPress={() => currentSide !== 'front' && onToggleSide()}
          style={[
            styles.toggleBtn,
            currentSide === 'front' && [
              styles.toggleBtnActive,
              { backgroundColor: colors.primary },
            ],
          ]}
          accessibilityRole="button"
          accessibilityLabel="正面ビュー"
          accessibilityState={{ selected: currentSide === 'front' }}
        >
          <Text
            style={[
              styles.toggleText,
              {
                color:
                  currentSide === 'front' ? '#FFFFFF' : colors.textSecondary,
              },
            ]}
          >
            正面
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => currentSide !== 'back' && onToggleSide()}
          style={[
            styles.toggleBtn,
            currentSide === 'back' && [
              styles.toggleBtnActive,
              { backgroundColor: colors.primary },
            ],
          ]}
          accessibilityRole="button"
          accessibilityLabel="背面ビュー"
          accessibilityState={{ selected: currentSide === 'back' }}
        >
          <Text
            style={[
              styles.toggleText,
              {
                color:
                  currentSide === 'back' ? '#FFFFFF' : colors.textSecondary,
              },
            ]}
          >
            背面
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.diagramContainer}>
        <Svg
          width={220}
          height={440}
          viewBox="0 0 200 400"
          accessibilityLabel={`部位別回復ヒートマップ ${currentSide === 'front' ? '正面' : '背面'}`}
        >
          {/* Silhouette background — head + torso + arms + legs */}
          <Silhouette fill={silhouetteFill} stroke={silhouetteStroke} />

          {currentSide === 'front' ? (
            <FrontMuscles
              fillFor={fillFor}
              zoneFor={zoneFor}
              deloadSet={deloadSet}
              volumeColor={volumeColor}
              onMusclePress={onMusclePress}
              colors={colors}
            />
          ) : (
            <BackMuscles
              fillFor={fillFor}
              zoneFor={zoneFor}
              deloadSet={deloadSet}
              volumeColor={volumeColor}
              onMusclePress={onMusclePress}
              colors={colors}
            />
          )}
        </Svg>
      </View>

      {/* Color legend — recovery primary */}
      <View style={styles.legendRow}>
        <LegendDot color={recoveryColor.unstimulated} label="未刺激" />
        <LegendDot color={recoveryColor.recovering} label="回復中" />
        <LegendDot color={recoveryColor.partial} label="一部回復" />
        <LegendDot color={recoveryColor.recovered} label="回復済" />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Silhouette path constants (sign-off C12 (c) — shared between Front
// and Back since the human-body outline is symmetric on the
// front/back axis at this level of abstraction).
// ---------------------------------------------------------------------------

function Silhouette({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <G>
      {/* Head */}
      <Circle cx={100} cy={35} r={22} fill={fill} stroke={stroke} strokeWidth={1} />
      {/* Neck */}
      <Rect x={92} y={55} width={16} height={12} fill={fill} stroke={stroke} strokeWidth={1} />
      {/* Torso */}
      <Path
        d="M 65 70
           Q 65 65, 75 65
           L 125 65
           Q 135 65, 135 70
           L 138 180
           Q 138 188, 130 188
           L 70 188
           Q 62 188, 62 180 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
      {/* Left arm (upper + lower) */}
      <Path
        d="M 62 80
           Q 50 80, 48 95
           L 42 165
           Q 41 175, 47 175
           L 56 175
           Q 60 175, 60 165
           L 65 90 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
      {/* Right arm (upper + lower) */}
      <Path
        d="M 138 80
           Q 150 80, 152 95
           L 158 165
           Q 159 175, 153 175
           L 144 175
           Q 140 175, 140 165
           L 135 90 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
      {/* Left leg */}
      <Path
        d="M 70 188
           L 78 188
           L 90 360
           Q 90 370, 82 370
           L 70 370
           Q 62 370, 64 360 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
      {/* Right leg */}
      <Path
        d="M 130 188
           L 122 188
           L 110 360
           Q 110 370, 118 370
           L 130 370
           Q 138 370, 136 360 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
    </G>
  );
}

// ---------------------------------------------------------------------------
// Front muscles
// ---------------------------------------------------------------------------

interface MusclePartsProps {
  fillFor: (group: VolumeGroup) => string;
  zoneFor: (group: VolumeGroup) => VolumeZone | undefined;
  deloadSet: Set<VolumeGroup>;
  volumeColor: Record<VolumeZone, string>;
  onMusclePress?: (group: VolumeGroup) => void;
  colors: ReturnType<typeof getColors>;
}

function FrontMuscles(props: MusclePartsProps) {
  const { fillFor, onMusclePress } = props;
  return (
    <G>
      {/* Chest — single rounded rect spanning the upper torso */}
      <MuscleGroupShape
        group="chest"
        fill={fillFor('chest')}
        onPress={onMusclePress}
        labelX={100}
        labelY={92}
        {...props}
      >
        <Rect x={75} y={78} width={50} height={28} rx={12} fill={fillFor('chest')} />
      </MuscleGroupShape>

      {/* Shoulder mid (front portion) — ovals at the deltoid front */}
      <MuscleGroupShape
        group="shoulder_mid"
        fill={fillFor('shoulder_mid')}
        onPress={onMusclePress}
        labelX={56}
        labelY={78}
        {...props}
      >
        <Ellipse cx={56} cy={82} rx={11} ry={9} fill={fillFor('shoulder_mid')} />
        <Ellipse cx={144} cy={82} rx={11} ry={9} fill={fillFor('shoulder_mid')} />
      </MuscleGroupShape>

      {/* Biceps — front of upper arms */}
      <MuscleGroupShape
        group="biceps"
        fill={fillFor('biceps')}
        onPress={onMusclePress}
        labelX={51}
        labelY={120}
        {...props}
      >
        <Ellipse cx={51} cy={125} rx={9} ry={20} fill={fillFor('biceps')} />
        <Ellipse cx={149} cy={125} rx={9} ry={20} fill={fillFor('biceps')} />
      </MuscleGroupShape>

      {/* Quads — front of upper legs */}
      <MuscleGroupShape
        group="quads"
        fill={fillFor('quads')}
        onPress={onMusclePress}
        labelX={80}
        labelY={235}
        {...props}
      >
        <Ellipse cx={80} cy={240} rx={11} ry={36} fill={fillFor('quads')} />
        <Ellipse cx={120} cy={240} rx={11} ry={36} fill={fillFor('quads')} />
      </MuscleGroupShape>
    </G>
  );
}

// ---------------------------------------------------------------------------
// Back muscles
// ---------------------------------------------------------------------------

function BackMuscles(props: MusclePartsProps) {
  const { fillFor, onMusclePress } = props;
  return (
    <G>
      {/* Lats / back — large rounded shape spanning upper torso */}
      <MuscleGroupShape
        group="back"
        fill={fillFor('back')}
        onPress={onMusclePress}
        labelX={100}
        labelY={115}
        {...props}
      >
        <Rect x={73} y={75} width={54} height={75} rx={16} fill={fillFor('back')} />
      </MuscleGroupShape>

      {/* Shoulder mid (rear portion) */}
      <MuscleGroupShape
        group="shoulder_mid"
        fill={fillFor('shoulder_mid')}
        onPress={onMusclePress}
        labelX={56}
        labelY={78}
        {...props}
      >
        <Ellipse cx={56} cy={82} rx={11} ry={9} fill={fillFor('shoulder_mid')} />
        <Ellipse cx={144} cy={82} rx={11} ry={9} fill={fillFor('shoulder_mid')} />
      </MuscleGroupShape>

      {/* Triceps — back of upper arms */}
      <MuscleGroupShape
        group="triceps"
        fill={fillFor('triceps')}
        onPress={onMusclePress}
        labelX={51}
        labelY={120}
        {...props}
      >
        <Ellipse cx={51} cy={125} rx={9} ry={20} fill={fillFor('triceps')} />
        <Ellipse cx={149} cy={125} rx={9} ry={20} fill={fillFor('triceps')} />
      </MuscleGroupShape>

      {/* Glutes — top of legs */}
      <MuscleGroupShape
        group="glutes"
        fill={fillFor('glutes')}
        onPress={onMusclePress}
        labelX={100}
        labelY={203}
        {...props}
      >
        <Rect x={72} y={188} width={56} height={28} rx={12} fill={fillFor('glutes')} />
      </MuscleGroupShape>

      {/* Hamstrings — back of upper legs */}
      <MuscleGroupShape
        group="hamstrings"
        fill={fillFor('hamstrings')}
        onPress={onMusclePress}
        labelX={80}
        labelY={250}
        {...props}
      >
        <Ellipse cx={80} cy={252} rx={11} ry={28} fill={fillFor('hamstrings')} />
        <Ellipse cx={120} cy={252} rx={11} ry={28} fill={fillFor('hamstrings')} />
      </MuscleGroupShape>

      {/* Calves — lower legs */}
      <MuscleGroupShape
        group="calves"
        fill={fillFor('calves')}
        onPress={onMusclePress}
        labelX={80}
        labelY={325}
        {...props}
      >
        <Ellipse cx={80} cy={325} rx={11} ry={22} fill={fillFor('calves')} />
        <Ellipse cx={120} cy={325} rx={11} ry={22} fill={fillFor('calves')} />
      </MuscleGroupShape>
    </G>
  );
}

// ---------------------------------------------------------------------------
// MuscleGroupShape — wraps muscle shapes with onPress + the optional
// volume-zone secondary indicator + the active-deload overlay.
// ---------------------------------------------------------------------------

interface MuscleGroupShapeProps extends MusclePartsProps {
  group: VolumeGroup;
  fill: string;
  onPress?: (group: VolumeGroup) => void;
  labelX: number;
  labelY: number;
  children: React.ReactNode;
}

function MuscleGroupShape({
  group,
  zoneFor,
  deloadSet,
  volumeColor,
  onPress,
  labelX,
  labelY,
  children,
  colors,
}: MuscleGroupShapeProps) {
  const zone = zoneFor(group);
  const deloadActive = deloadSet.has(group);

  return (
    <G
      onPress={onPress ? () => onPress(group) : undefined}
      accessibilityLabel={GROUP_LABEL_JA[group]}
      accessibilityRole="button"
    >
      {children}
      {zone && (
        <Circle
          cx={labelX}
          cy={labelY}
          r={4}
          fill={volumeColor[zone]}
          stroke={colors.surface}
          strokeWidth={1}
        />
      )}
      {deloadActive && (
        <SvgText
          x={labelX + 8}
          y={labelY + 4}
          fontSize={11}
          fill={colors.error}
          fontWeight="bold"
        >
          ⚠
        </SvgText>
      )}
    </G>
  );
}

const GROUP_LABEL_JA: Record<VolumeGroup, string> = {
  chest: '大胸筋',
  back: '広背筋',
  shoulder_mid: '三角筋(中部)',
  biceps: '上腕二頭筋',
  triceps: '上腕三頭筋',
  quads: '大腿四頭筋',
  hamstrings: 'ハムストリングス',
  glutes: '大臀筋',
  calves: 'カーフ',
};

// ---------------------------------------------------------------------------
// Legend dot
// ---------------------------------------------------------------------------

function LegendDot({ color, label }: { color: string; label: string }) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>
        {label}
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
  },
  toggleBtnActive: {
    // backgroundColor applied inline (theme-driven)
  },
  toggleText: {
    ...typography.labelMedium,
  },
  diagramContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendLabel: {
    ...typography.bodySmall,
  },
});
