import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card, Button, ProgressBar, Modal } from '../../../src/components/ui';
import { useProfileStore } from '../../../src/stores/profileStore';
import { RecoveryBodyMap, type RecoverySide } from '../../../src/components/training/RecoveryBodyMap';
import {
  generateWeeklyTrainingReport,
  buildTrainingWeek,
  shiftWeek,
  canGoToNextWeek,
  type WeeklyTrainingReportData,
  type VolumeRow,
  type E1RMHighlight,
} from '../../../src/domain/weeklyTrainingReport';
import type { MuscleGroup } from '../../../src/types/common';
import type { VolumeZone } from '../../../src/domain/volumeLandmark';
import { formatDuration } from '../../../src/utils/format';

// S4-4 — 週次トレーニングレポート画面。筋トレタブ「分析」カードから遷移。
// - 週送りは local 月曜週 (weeklyReport / history と同一規約)、未来週不可
// - 回復マップは「今日時点」の状態のみ表示 (過去週の回復状態は再構成不可の
//   ため現在週でのみレンダリング)。データ源は getRecoveryStatuses (系統A)
//   なので「今日のおすすめ」と矛盾しない
// - 部位タップ → カレンダーを該当部位フィルタで開く (S4-5 param)
// - progress/weekly-report.tsx (食事系) とは別画面。component 名も別
//   (WeeklyTrainingReportScreen)

// VolumeLandmarkChart と同じゾーン語彙 (混在させない)
const ZONE_LABEL_JA: Record<VolumeZone, string> = {
  below_mev: '不足',
  mev_to_mav: '増加余地',
  mav_to_mrv: '適正',
  above_mrv: '過剰',
};

export default function WeeklyTrainingReportScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);

  const [weekStart, setWeekStart] = useState(() => buildTrainingWeek(new Date()).weekStart);
  const [report, setReport] = useState<WeeklyTrainingReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [side, setSide] = useState<RecoverySide>('front');
  const [helpVisible, setHelpVisible] = useState(false);

  const weekStartMs = weekStart.getTime();

  // 週送り連打時に古い週の Promise が後から resolve して表示週と中身が
  // ズレるのを防ぐ世代カウンタ (Codex S4 R1 Important #3)
  const requestSeqRef = useRef(0);

  const loadReport = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    if (!profile) {
      setReport(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await generateWeeklyTrainingReport(profile.id, new Date(weekStartMs));
      if (seq !== requestSeqRef.current) return; // 古いリクエスト — 破棄
      setReport(data);
    } catch {
      if (seq !== requestSeqRef.current) return;
      setReport(null);
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  }, [profile, weekStartMs]);

  useFocusEffect(
    useCallback(() => {
      loadReport();
    }, [loadReport]),
  );

  const week = report?.week ?? buildTrainingWeek(new Date(weekStartMs));
  const canGoNext = canGoToNextWeek(weekStart);

  const handleMusclePress = useCallback((group: MuscleGroup) => {
    // カレンダーを該当部位フィルタで開く (フィルタ体系は同じ 7-key MuscleGroup)
    router.push({ pathname: '/(tabs)/training/calendar', params: { muscle: group } });
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Button
          title="戻る"
          onPress={() => router.back()}
          variant="ghost"
          size="sm"
          icon={<Ionicons name="chevron-back" size={18} color={colors.primary} />}
        />
        <Text style={[styles.title, { color: colors.textPrimary }]}>週次レポート</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 週ナビゲータ (カレンダーの月ヘッダと同型・未来週へは進めない) */}
        <View style={styles.weekHeader}>
          <TouchableOpacity
            onPress={() => setWeekStart((w) => shiftWeek(w, -1))}
            hitSlop={8}
            style={styles.weekArrow}
            accessibilityRole="button"
            accessibilityLabel="前の週"
          >
            <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={styles.weekLabelBox}>
            <Text style={[styles.weekLabel, { color: colors.textPrimary }]}>{week.label}</Text>
            <Text style={[styles.weekRange, { color: colors.textSecondary }]}>
              {week.rangeLabel}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => canGoNext && setWeekStart((w) => shiftWeek(w, 1))}
            hitSlop={8}
            style={styles.weekArrow}
            disabled={!canGoNext}
            accessibilityRole="button"
            accessibilityLabel="次の週"
            accessibilityState={{ disabled: !canGoNext }}
          >
            <Ionicons
              name="chevron-forward"
              size={20}
              color={canGoNext ? colors.textSecondary : colors.border}
            />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !report ? (
          <Card>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              レポートを読み込めませんでした。
            </Text>
          </Card>
        ) : (
          // 将来 entitlement を足す場合はこのブロック全体を 1 箇所の
          // {unlocked ? (...) : (<LockCard />)} 分岐で包む (weekly-report.tsx の
          // hasDetailAccess / muscle-heatmap.tsx の unlocked パターン)
          <>
            {report.recovery && (
              <Card>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                    今日時点の回復状態
                  </Text>
                  <TouchableOpacity
                    onPress={() => setHelpVisible(true)}
                    hitSlop={8}
                    style={styles.helpBtn}
                    accessibilityRole="button"
                    accessibilityLabel="回復状態の見かたを表示"
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={20}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
                <RecoveryBodyMap
                  entries={report.recovery}
                  currentSide={side}
                  onToggleSide={() => setSide((s) => (s === 'front' ? 'back' : 'front'))}
                  onMusclePress={handleMusclePress}
                />
                <Text style={[styles.mapHint, { color: colors.textTertiary }]}>
                  部位をタップするとカレンダーで履歴を確認できます
                </Text>
              </Card>
            )}

            <Card>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                部位別セット数
              </Text>
              {report.hasAnyVolume ? (
                <View style={styles.volumeList}>
                  {report.volumeRows
                    .filter((row) => row.weeklySets > 0 || row.prevWeekSets > 0)
                    .map((row) => (
                      <VolumeRowItem key={row.group} row={row} />
                    ))}
                  <RestedGroupsNote rows={report.volumeRows} />
                </View>
              ) : (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  この週のセット記録はありません。トレーニングを完了するとここに集計されます。
                </Text>
              )}
            </Card>

            <Card>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                週次ハイライト
              </Text>
              <View style={[styles.totalsRow, { borderBottomColor: colors.border }]}>
                <TotalItem
                  label="セッション"
                  value={report.totals.sessionCount > 0 ? `${report.totals.sessionCount}回` : '—'}
                  subValue={`先週 ${report.prevTotals.sessionCount}回`}
                />
                <TotalItem
                  label="合計時間"
                  value={
                    report.totals.totalDurationSeconds > 0
                      ? formatDuration(report.totals.totalDurationSeconds)
                      : '—'
                  }
                  subValue={
                    report.prevTotals.totalDurationSeconds > 0
                      ? `先週 ${formatDuration(report.prevTotals.totalDurationSeconds)}`
                      : '先週 —'
                  }
                />
              </View>
              {report.e1rmHighlights.length > 0 ? (
                <View style={styles.highlightList}>
                  <Text style={[styles.subSectionTitle, { color: colors.textSecondary }]}>
                    推定1RMのベスト
                  </Text>
                  {report.e1rmHighlights.map((h) => (
                    <E1RMHighlightRow key={h.exerciseId} highlight={h} />
                  ))}
                </View>
              ) : (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  この週の推定1RM記録はありません。
                </Text>
              )}
            </Card>
          </>
        )}
      </ScrollView>

      <Modal visible={helpVisible} onClose={() => setHelpVisible(false)} title="回復状態の見かた">
        <Text style={[styles.helpText, { color: colors.textSecondary }]}>
          部位ごとの標準回復時間（24〜72時間）と最終トレーニングからの経過時間をもとに推定しています。「今日のおすすめ」と同じ基準です。{'\n\n'}
          ✓ 回復済み — 十分に回復し、トレーニングに適した状態{'\n'}
          △ 回復中 — 回復の途中。軽めにするか他の部位がおすすめ{'\n'}
          — 記録なし — まだこの部位のトレーニング記録がありません
        </Text>
        <Button title="閉じる" onPress={() => setHelpVisible(false)} variant="ghost" fullWidth />
      </Modal>
    </SafeAreaView>
  );
}

function VolumeRowItem({ row }: { row: VolumeRow }) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  // 状態を担うバー色は statusXText (3-3 契約)。適正圏は success、不足/過剰は
  // warning (責めないトーン・赤なし)
  const inBand = row.zone === 'mev_to_mav' || row.zone === 'mav_to_mrv';
  const barColor = inBand ? colors.statusSuccessText : colors.statusWarningText;
  const diff = row.weeklySets - row.prevWeekSets;
  const diffText = diff === 0 ? '±0' : diff > 0 ? `+${diff}` : `${diff}`;
  return (
    <View
      accessibilityLabel={`${row.labelJa}: 今週${row.weeklySets}セット、目安${row.targetSets}セット、${ZONE_LABEL_JA[row.zone]}。先週比${diffText}セット`}
    >
      <View style={styles.volumeRowHeader}>
        <Text style={[styles.volumeLabel, { color: colors.textPrimary }]}>{row.labelJa}</Text>
        <Text style={[styles.volumeZone, { color: colors.textSecondary }]}>
          {ZONE_LABEL_JA[row.zone]}
        </Text>
        <Text style={[styles.volumeValue, { color: colors.textPrimary }]}>
          {row.weeklySets}
          <Text style={{ color: colors.textSecondary }}>{` / ${row.targetSets}セット`}</Text>
        </Text>
      </View>
      <ProgressBar progress={row.weeklySets / row.targetSets} color={barColor} height={6} />
      <Text style={[styles.volumePrev, { color: colors.textTertiary }]}>
        先週 {row.prevWeekSets}セット ({diffText})
      </Text>
    </View>
  );
}

// セットゼロの部位は 1 行に畳む (9 行固定で縦に伸ばさない)
function RestedGroupsNote({ rows }: { rows: VolumeRow[] }) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const rested = rows.filter((r) => r.weeklySets === 0 && r.prevWeekSets === 0);
  if (rested.length === 0) return null;
  return (
    <Text style={[styles.restedNote, { color: colors.textTertiary }]}>
      記録なし: {rested.map((r) => r.labelJa).join('・')}
    </Text>
  );
}

function TotalItem({
  label,
  value,
  subValue,
}: {
  label: string;
  value: string;
  subValue: string;
}) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  return (
    <View style={styles.totalItem}>
      <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.totalValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.totalSub, { color: colors.textTertiary }]}>{subValue}</Text>
    </View>
  );
}

function E1RMHighlightRow({ highlight }: { highlight: E1RMHighlight }) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  let badgeText: string;
  let badgeTint: string;
  let badgeColor: string;
  if (highlight.prevKg === null) {
    badgeText = '初記録';
    badgeTint = colors.statusNeutral;
    badgeColor = colors.statusNeutralText;
  } else if ((highlight.diffKg ?? 0) > 0) {
    badgeText = `↑ +${(highlight.diffKg as number).toFixed(1)}kg`;
    badgeTint = colors.statusSuccess;
    badgeColor = colors.statusSuccessText;
  } else {
    // 維持/低下は責めないトーンで中立表示 (赤・warning を使わない)
    const d = highlight.diffKg as number;
    badgeText = d === 0 ? '± 0kg' : `${d.toFixed(1)}kg`;
    badgeTint = colors.statusNeutral;
    badgeColor = colors.statusNeutralText;
  }

  return (
    <View
      style={styles.highlightRow}
      accessibilityLabel={`${highlight.exerciseNameJa}: 推定1RM ${highlight.currentKg.toFixed(1)}kg、${
        highlight.prevKg === null ? '初記録' : `先週比${badgeText.replace('↑ ', '')}`
      }`}
    >
      <Text
        style={[styles.highlightName, { color: colors.textPrimary }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {highlight.exerciseNameJa}
      </Text>
      <Text style={[styles.highlightKg, { color: colors.textPrimary }]}>
        {highlight.currentKg.toFixed(1)}kg
      </Text>
      <View style={[styles.highlightBadge, { backgroundColor: badgeTint + '18' }]}>
        <Text style={[styles.highlightBadgeText, { color: badgeColor }]}>{badgeText}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
  },
  title: { ...typography.titleMedium },
  headerSpacer: { width: 60 },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekArrow: { padding: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  weekLabelBox: { alignItems: 'center' },
  weekLabel: { ...typography.titleSmall, fontWeight: '700' },
  weekRange: { ...typography.labelSmall },
  loadingBox: { paddingVertical: spacing.xxl, alignItems: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...typography.titleSmall, fontWeight: '700', marginBottom: spacing.sm },
  helpBtn: { padding: spacing.xs, marginBottom: spacing.sm },
  mapHint: { ...typography.labelSmall, textAlign: 'center', marginTop: spacing.sm },
  volumeList: { gap: spacing.md },
  volumeRowHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  volumeLabel: { ...typography.bodyMedium, fontWeight: '600', flex: 1 },
  volumeZone: { ...typography.labelSmall },
  volumeValue: { ...typography.bodyMedium, fontWeight: '700' },
  volumePrev: { ...typography.labelSmall, marginTop: spacing.xs },
  restedNote: { ...typography.labelSmall, marginTop: spacing.xs },
  totalsRow: {
    flexDirection: 'row',
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.md,
  },
  totalItem: { flex: 1, alignItems: 'center', gap: 2 },
  totalLabel: { ...typography.labelSmall },
  totalValue: { ...typography.titleSmall, fontWeight: '700' },
  totalSub: { ...typography.labelSmall },
  highlightList: { gap: spacing.sm },
  subSectionTitle: { ...typography.labelMedium, fontWeight: '600' },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  highlightName: { ...typography.bodyMedium, flex: 1 },
  highlightKg: { ...typography.bodyMedium, fontWeight: '700' },
  highlightBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    minWidth: 64,
    alignItems: 'center',
  },
  highlightBadgeText: { ...typography.labelSmall, fontWeight: '600' },
  emptyText: { ...typography.bodySmall },
  helpText: { ...typography.bodySmall, lineHeight: 20, marginBottom: spacing.md },
});
