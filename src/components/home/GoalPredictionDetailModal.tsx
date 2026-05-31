import React from 'react';
import {
  Modal as RNModal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line, Polyline, Circle, Text as SvgText } from 'react-native-svg';
import { getColors, radius, shadow } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { GoalPrediction } from '../../types/goalPrediction';
import { statusMessage } from '../../domain/goalPrediction';
import { formatDate } from '../../utils/format';
import { useSubscription } from '../../hooks/useSubscription';
import { parseISO, differenceInCalendarDays } from 'date-fns';

interface Props {
  visible: boolean;
  prediction: GoalPrediction;
  onClose: () => void;
}

const CHART_HEIGHT = 200;

function TrajectoryChart({ prediction, width }: { prediction: GoalPrediction; width: number }) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const points = prediction.trajectory;
  if (points.length < 2) return null;

  const weights = points.map((p) => p.weight);
  const minW = Math.min(...weights, prediction.targetWeight);
  const maxW = Math.max(...weights, prediction.targetWeight);
  const rangeW = Math.max(0.5, maxW - minW);
  const pad = 24;
  const innerW = width - pad * 2;
  const innerH = CHART_HEIGHT - pad * 2;

  const firstDate = parseISO(points[0].date);
  const lastDate = parseISO(points[points.length - 1].date);
  const totalDays = Math.max(1, differenceInCalendarDays(lastDate, firstDate));

  const toX = (date: string) =>
    pad + (differenceInCalendarDays(parseISO(date), firstDate) / totalDays) * innerW;
  const toY = (w: number) => pad + ((maxW - w) / rangeW) * innerH;

  const actualPoints = points.filter((p) => p.type === 'actual');
  const projectedPoints = points.filter((p) => p.type === 'projected');

  const actualStr = actualPoints
    .map((p) => `${toX(p.date).toFixed(1)},${toY(p.weight).toFixed(1)}`)
    .join(' ');
  const projectedStr = projectedPoints
    .map((p) => `${toX(p.date).toFixed(1)},${toY(p.weight).toFixed(1)}`)
    .join(' ');

  const targetY = toY(prediction.targetWeight);

  return (
    <Svg width={width} height={CHART_HEIGHT}>
      {/* Target line */}
      <Line
        x1={pad}
        x2={width - pad}
        y1={targetY}
        y2={targetY}
        stroke={colors.accent}
        strokeWidth={1.5}
        strokeDasharray="4,4"
      />
      <SvgText
        x={width - pad}
        y={targetY - 4}
        fontSize={10}
        fill={colors.accent}
        textAnchor="end"
      >
        目標 {prediction.targetWeight.toFixed(1)}kg
      </SvgText>

      {/* Actual line */}
      {actualStr.length > 0 && (
        <Polyline
          points={actualStr}
          fill="none"
          stroke={colors.primary}
          strokeWidth={2}
        />
      )}

      {/* Projected line */}
      {projectedStr.length > 0 && (
        <Polyline
          points={projectedStr}
          fill="none"
          stroke={colors.primary}
          strokeWidth={2}
          strokeDasharray="4,4"
          opacity={0.6}
        />
      )}

      {/* Actual points */}
      {actualPoints.map((p, i) => (
        <Circle
          key={i}
          cx={toX(p.date)}
          cy={toY(p.weight)}
          r={2.5}
          fill={colors.primary}
        />
      ))}
    </Svg>
  );
}

export function GoalPredictionDetailModal({ visible, prediction, onClose }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = screenWidth - spacing.lg * 4;

  const msg = statusMessage(prediction.status);
  // v1.5 UI sprint Phase 1a — reactive gate (was canUse). Same tier gated.
  const { hasFeature } = useSubscription();
  const detailedAllowed = hasFeature('goalPredictionDetailed');

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }, shadow.lg]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>目標到達予測</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {detailedAllowed && prediction.trajectory.length >= 2 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                  体重推移と予測
                </Text>
                <TrajectoryChart prediction={prediction} width={chartWidth} />
              </View>
            )}

            {!detailedAllowed && (
              <View style={[styles.lockBanner, { backgroundColor: colors.primary + '10' }]}>
                <Ionicons name="lock-closed" size={16} color={colors.primary} />
                <Text style={[styles.lockText, { color: colors.primary }]}>
                  詳細グラフはPlusプランで利用できます
                </Text>
              </View>
            )}

            <View style={styles.section}>
              <View style={styles.kv}>
                <Text style={[styles.kvLabel, { color: colors.textSecondary }]}>現在のペース</Text>
                <Text style={[styles.kvValue, { color: colors.textPrimary }]}>
                  {prediction.weeklyChangeRate >= 0 ? '+' : ''}
                  {prediction.weeklyChangeRate.toFixed(2)} kg/週
                </Text>
              </View>
              <View style={styles.kv}>
                <Text style={[styles.kvLabel, { color: colors.textSecondary }]}>現在の体重</Text>
                <Text style={[styles.kvValue, { color: colors.textPrimary }]}>
                  {prediction.currentWeight.toFixed(1)} kg
                </Text>
              </View>
              <View style={styles.kv}>
                <Text style={[styles.kvLabel, { color: colors.textSecondary }]}>目標体重</Text>
                <Text style={[styles.kvValue, { color: colors.textPrimary }]}>
                  {prediction.targetWeight.toFixed(1)} kg
                </Text>
              </View>
              {prediction.estimatedArrivalDate && (
                <View style={styles.kv}>
                  <Text style={[styles.kvLabel, { color: colors.textSecondary }]}>推定到達日</Text>
                  <Text style={[styles.kvValue, { color: colors.primary }]}>
                    {formatDate(prediction.estimatedArrivalDate, 'yyyy年M月d日')}
                  </Text>
                </View>
              )}
              {prediction.gapFromDeadline !== null && (
                <View style={styles.kv}>
                  <Text style={[styles.kvLabel, { color: colors.textSecondary }]}>期限との差</Text>
                  <Text
                    style={[
                      styles.kvValue,
                      {
                        color:
                          prediction.gapFromDeadline > 0 ? colors.warning : colors.success,
                      },
                    ]}
                  >
                    {prediction.gapFromDeadline >= 0 ? '+' : ''}
                    {prediction.gapFromDeadline}日
                  </Text>
                </View>
              )}
            </View>

            <View
              style={[
                styles.adviceBox,
                {
                  backgroundColor:
                    msg.tone === 'success'
                      ? colors.success + '10'
                      : msg.tone === 'warning'
                        ? colors.warning + '10'
                        : msg.tone === 'error'
                          ? colors.error + '10'
                          : colors.primary + '10',
                },
              ]}
            >
              <Text
                style={[
                  styles.adviceTitle,
                  {
                    color:
                      msg.tone === 'success'
                        ? colors.success
                        : msg.tone === 'warning'
                          ? colors.warning
                          : msg.tone === 'error'
                            ? colors.error
                            : colors.primary,
                  },
                ]}
              >
                {msg.title}
              </Text>
              <Text style={[styles.adviceText, { color: colors.textPrimary }]}>
                {getAdviceText(prediction)}
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </RNModal>
  );
}

function getAdviceText(prediction: GoalPrediction): string {
  switch (prediction.status) {
    case 'completed':
      return '目標体重に到達しました。維持フェーズに移行するか、新しい目標を設定しましょう。';
    case 'on_track':
      return 'このペースを維持すれば、予定通りに目標到達できます。';
    case 'ahead_of_schedule':
      return '先行しています。急激な変化は避け、安全なペースで継続してください。';
    case 'behind_schedule':
      return '想定より遅れています。目標カロリーの見直しやトレーニング強度の調整を検討しましょう。';
    case 'stalled':
      return '体重変化が停滞しています。摂取カロリーやトレーニング内容の見直しが必要です。';
    case 'insufficient_data':
    default:
      return '予測に必要なデータを貯めてください。毎日体重を記録することをおすすめします。';
  }
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  title: { ...typography.titleMedium },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxxl },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.labelMedium },
  kv: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  kvLabel: { ...typography.bodyMedium },
  kvValue: { ...typography.numberSmall, fontSize: 16 },
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 8,
  },
  lockText: { ...typography.labelMedium, flex: 1 },
  adviceBox: {
    padding: spacing.md,
    borderRadius: 12,
    gap: spacing.sm,
  },
  adviceTitle: { ...typography.titleSmall },
  adviceText: { ...typography.bodyMedium, lineHeight: 22 },
});
