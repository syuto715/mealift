import React, { useCallback, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card } from '../../../src/components/ui';
import { PeriodizationSpawnConfirmModal } from '../../../src/components/training/PeriodizationSpawnConfirmModal';
import { useProfileStore } from '../../../src/stores/profileStore';
import { useUIStore } from '../../../src/stores/uiStore';
import { useSubscription } from '../../../src/hooks/useSubscription';
import {
  PERIODIZATION_TEMPLATES,
  type PeriodizationTemplate,
  type PeriodizationWeek,
} from '../../../src/constants/periodizationTemplates';

// Build 16 / Phase 5 (Feature G) / Phase 5.2 — periodization preset
// browser screen.
//
// Two modes (in-screen state machine, no nested route):
//   - 'list'  → 3 template cards
//   - 'detail' → selected template's week-by-week grid + "Create" CTA
// Tapping back from 'detail' returns to 'list'; from 'list' router.back()
// to training/index. Single-screen state keeps deep-link surface area
// small and matches Phase 4.2's volume-dashboard ergonomics.
//
// Pro-only gate (hasFeature('periodizationPresets')) at the top of
// the body. Free / Plus / Trial users see the lock screen mirroring
// volume-dashboard.tsx; defense-in-depth even though the index.tsx
// CTA only renders for Pro users.

type Mode = 'list' | 'detail';

export default function PeriodizationPresetsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);
  const sub = useSubscription();
  const unlocked = sub.hasFeature('periodizationPresets');
  const showToast = useUIStore((s) => s.showToast);

  const [mode, setMode] = useState<Mode>('list');
  const [selected, setSelected] = useState<PeriodizationTemplate | null>(null);
  const [spawnModalVisible, setSpawnModalVisible] = useState(false);

  const handleBack = useCallback(() => {
    if (mode === 'detail') {
      setMode('list');
      setSelected(null);
    } else {
      router.back();
    }
  }, [mode]);

  const handleSelectTemplate = useCallback((t: PeriodizationTemplate) => {
    setSelected(t);
    setMode('detail');
  }, []);

  const handleSpawned = useCallback(
    (count: number) => {
      setSpawnModalVisible(false);
      setSelected(null);
      setMode('list');
      showToast(`${count} 個のルーティンを生成しました`, 'success');
      router.back();
    },
    [showToast],
  );

  const headerTitle =
    mode === 'detail' && selected
      ? selected.nameJa
      : 'ピリオダイゼーション・プリセット';

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text
          style={[styles.title, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {headerTitle}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      {!unlocked ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="lock-closed" size={32} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            ピリオダイゼーション・プリセットは Pro プランで利用できます
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/settings/subscription')}
            style={[styles.upgradeBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.upgradeBtnText}>プランを見る</Text>
          </TouchableOpacity>
        </View>
      ) : mode === 'list' ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            体系的なトレーニングプログラムから選択してください。選んだベースルーティンに沿って、週ごとの sets / reps が自動調整されたルーティンを生成します。
          </Text>
          {PERIODIZATION_TEMPLATES.map((t) => (
            <TouchableOpacity
              key={t.id}
              onPress={() => handleSelectTemplate(t)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${t.nameJa} の詳細を見る`}
            >
              <Card>
                <View style={styles.templateHeader}>
                  <Text
                    style={[
                      styles.templateTitle,
                      { color: colors.textPrimary },
                    ]}
                  >
                    {t.nameJa}
                  </Text>
                  <Text
                    style={[
                      styles.templateMeta,
                      { color: colors.textTertiary },
                    ]}
                  >
                    {t.durationWeeks} 週
                  </Text>
                </View>
                <Text
                  style={[
                    styles.templateDesc,
                    { color: colors.textSecondary },
                  ]}
                >
                  {t.description}
                </Text>
              </Card>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : selected ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            {selected.description}
          </Text>

          <Card>
            <Text
              style={[styles.sectionTitle, { color: colors.textPrimary }]}
            >
              週ごとの内容
            </Text>
            <View style={styles.gridList}>
              {selected.weeks.map((w) => (
                <WeekRow
                  key={`w-${w.weekIndex}`}
                  week={w}
                  isDup={selected.id === 'dup'}
                  colors={colors}
                />
              ))}
            </View>
            <Text style={[styles.intensityNote, { color: colors.textTertiary }]}>
              ％1RM (1回最大重量比) は目安です。実際のセット重量は、過去のトレーニング履歴と RPE 設定から自動計算されます。
            </Text>
          </Card>

          <TouchableOpacity
            onPress={() => setSpawnModalVisible(true)}
            disabled={!profile}
            style={[
              styles.createBtn,
              { backgroundColor: colors.primary, opacity: profile ? 1 : 0.5 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="このプリセットでルーティンを作成"
          >
            <Text style={styles.createBtnText}>このプリセットで作成</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}

      {profile?.id && selected && (
        <PeriodizationSpawnConfirmModal
          visible={spawnModalVisible}
          profileId={profile.id}
          template={selected}
          onSpawned={handleSpawned}
          onClose={() => setSpawnModalVisible(false)}
        />
      )}
    </SafeAreaView>
  );
}

function WeekRow({
  week,
  isDup,
  colors,
}: {
  week: PeriodizationWeek;
  isDup: boolean;
  colors: ReturnType<typeof getColors>;
}) {
  if (isDup) {
    return (
      <View style={styles.dupWeekBlock}>
        <Text style={[styles.weekLabel, { color: colors.textPrimary }]}>
          Week {week.weekIndex}
        </Text>
        {(week.sessions ?? []).map((s) => (
          <View key={s.sessionLabel} style={styles.dupSessionRow}>
            <Text
              style={[styles.dupSessionLabel, { color: colors.textSecondary }]}
            >
              {s.sessionLabel}
            </Text>
            <Text
              style={[styles.dupSessionDetail, { color: colors.textTertiary }]}
            >
              {s.sets} × {s.reps} @ {s.intensityPctOf1RM}%
            </Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.linearWeekRow}>
      <Text style={[styles.weekLabel, { color: colors.textPrimary }]}>
        Week {week.weekIndex}
      </Text>
      <Text style={[styles.linearDetail, { color: colors.textSecondary }]}>
        {week.sets} × {week.reps} @ {week.intensityPctOf1RM}%
      </Text>
    </View>
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
  title: {
    ...typography.titleMedium,
    flex: 1,
    textAlign: 'center',
  },
  scroll: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxxl,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
  upgradeBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: 999,
  },
  upgradeBtnText: {
    ...typography.labelLarge,
    color: '#FFFFFF',
  },
  intro: {
    ...typography.bodySmall,
    lineHeight: 18,
  },
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  templateTitle: {
    ...typography.titleSmall,
    fontWeight: '600',
  },
  templateMeta: {
    ...typography.labelMedium,
  },
  templateDesc: {
    ...typography.bodySmall,
    lineHeight: 18,
  },
  sectionTitle: {
    ...typography.titleSmall,
    marginBottom: spacing.sm,
  },
  gridList: {
    gap: spacing.sm,
  },
  linearWeekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  weekLabel: {
    ...typography.labelMedium,
    fontWeight: '600',
    width: 90,
  },
  linearDetail: {
    ...typography.bodyMedium,
    flex: 1,
    textAlign: 'right',
  },
  dupWeekBlock: {
    paddingVertical: spacing.xs,
  },
  dupSessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
    paddingLeft: spacing.lg,
  },
  dupSessionLabel: {
    ...typography.labelMedium,
    width: 80,
  },
  dupSessionDetail: {
    ...typography.bodySmall,
    flex: 1,
    textAlign: 'right',
  },
  intensityNote: {
    ...typography.bodySmall,
    fontSize: 11,
    lineHeight: 16,
    marginTop: spacing.md,
  },
  createBtn: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  createBtnText: {
    ...typography.labelLarge,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
