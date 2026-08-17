import React, { useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useProfileStore } from '../../../src/stores/profileStore';
import { useSubscription } from '../../../src/hooks/useSubscription';
import {
  useCoachAdviceStore,
  selectLatestAdvice,
} from '../../../src/stores/coachAdviceStore';
import { pickHomeAdvice } from '../../../src/components/home/coachHomeAdvice';
import { parseCoachText } from '../../../src/domain/coachText';
import { ProInlineCTA } from '../../../src/components/shared/ProInlineCTA';
import { getColors } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { formatDate } from '../../../src/utils/format';

// S4.6-B — ミー先生アドバイスの全文表示画面。
//
// review #7 の redesign でコーチ index から AdviceCard が外れて以来、
// ホームカード/要約カードの「詳しく見る」の行き先に全文表示が存在しなかった
// (S3-3-D コメントの「コーチ画面の既存表示」は stale)。この画面がその
// 行き先になる: parseCoachText で挨拶・Markdown を整形した全文を表示する。
//
// データは CoachHomeCard と同じ read-only パス (selectLatestAdvice +
// loadFromCache の hydrate のみ)。EF 呼び出しはしない — 生成は既存の
// AdviceCard/ホーム経由で走っており、この画面は閲覧専用 (quota 影響ゼロ)。
// tier gate も CoachHomeCard と同一 (hasFeature、I1 no-free-reads)。
export default function CoachAdviceScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const userId = useProfileStore((s) => s.profile?.id ?? '');
  const sub = useSubscription();
  const canWeekly = sub.hasFeature('aiCoachAdviceWeekly');
  const canDaily = sub.hasFeature('aiCoachAdviceDaily');
  const daily = useCoachAdviceStore((s) => selectLatestAdvice(s, userId, 'daily'));
  const weekly = useCoachAdviceStore((s) =>
    selectLatestAdvice(s, userId, 'weekly'),
  );
  const loadFromCache = useCoachAdviceStore((s) => s.loadFromCache);

  useEffect(() => {
    if (!userId || (!canWeekly && !canDaily)) return;
    let cancelled = false;
    void (async () => {
      try {
        if (canWeekly) await loadFromCache(userId, 'weekly');
        if (!cancelled && canDaily) await loadFromCache(userId, 'daily');
      } catch {
        // 未取得なら空状態が受ける
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, canWeekly, canDaily, loadFromCache]);

  const advice = pickHomeAdvice({ daily, weekly, canDaily, canWeekly });
  const parsed = advice ? parseCoachText(advice.content) : null;
  const scopeLabel = advice?.scope === 'daily' ? '今日' : '今週';
  const locked = !canWeekly && !canDaily;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel="戻る"
          testID="coach-advice-back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          ミー先生からのアドバイス
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {locked ? (
          <View style={styles.emptyBox}>
            <Ionicons name="lock-closed" size={32} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              ミー先生のアドバイスは Plus プランで利用できます
            </Text>
            <ProInlineCTA
              label="ミー先生のアドバイスを受けるには Plus へ →"
              variant="card"
            />
          </View>
        ) : !advice || parsed === null || parsed.body === '' ? (
          <View style={styles.emptyBox}>
            <Ionicons
              name="sparkles-outline"
              size={32}
              color={colors.textTertiary}
            />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              まだアドバイスがありません。{'\n'}
              記録を続けるとミー先生からアドバイスが届きます。
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.meta, { color: colors.textTertiary }]}>
              {scopeLabel}のアドバイス ・ {formatDate(advice.generatedAt, 'M月d日')}
            </Text>
            {parsed.title != null && (
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                {parsed.title}
              </Text>
            )}
            <Text
              style={[styles.body, { color: colors.textPrimary }]}
              testID="coach-advice-body"
            >
              {parsed.body}
            </Text>
            <Text style={[styles.footer, { color: colors.textTertiary }]}>
              ミー先生 (AI コーチ)
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  headerBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { ...typography.titleMedium },
  scroll: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  meta: { ...typography.labelSmall },
  title: { ...typography.titleSmall, fontWeight: '700' },
  body: { ...typography.bodyMedium, lineHeight: 24 },
  footer: { ...typography.labelSmall, marginTop: spacing.md },
  emptyBox: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  emptyText: {
    ...typography.bodyMedium,
    textAlign: 'center',
    lineHeight: 22,
  },
});
