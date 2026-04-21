import React, { useState, useMemo, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { useNutrition } from '../../../src/hooks/useNutrition';
import { useProfileStore } from '../../../src/stores/profileStore';
import { MealType } from '../../../src/types/common';
import { formatDate } from '../../../src/utils/format';
import {
  calculateNutrientBalance,
  NutrientBalanceResult,
  NutrientBalanceItem,
  BalanceStatus,
  MEAL_RATIO,
} from '../../../src/domain/nutrientBalance';
import { NutrientBar } from '../../../src/components/charts/NutrientBar';
import { getFeatureFlags } from '../../../src/infra/services/subscriptionService';
import {
  fetchNutritionAdvice,
  AIError,
} from '../../../src/infra/services/aiNutritionService';
import { UpgradePromptModal } from '../../../src/components/subscription/UpgradePromptModal';

type UpgradeTarget = 'plus-meal' | 'plus-extended' | 'pro-ai';

const UPGRADE_CONTENT: Record<
  UpgradeTarget,
  {
    featureName: string;
    requiredPlan: 'plus' | 'pro';
    description?: string;
    benefits: string[];
  }
> = {
  'plus-meal': {
    featureName: '食事別の栄養バランス',
    requiredPlan: 'plus',
    description: 'Plus プランで朝・昼・夕・間食ごとの栄養バランスを確認できます。',
    benefits: ['食事ごとのPFC・栄養素', '食事タイミング別の比率', '全24項目の栄養素表示'],
  },
  'plus-extended': {
    featureName: '全24項目の栄養素表示',
    requiredPlan: 'plus',
    description: 'Plus プランでビタミン・ミネラルを含む全栄養素を詳細に確認できます。',
    benefits: ['ビタミン9項目', 'ミネラル6項目', '飽和脂肪酸・コレステロール'],
  },
  'pro-ai': {
    featureName: 'AI 食事アドバイス',
    requiredPlan: 'pro',
    description: 'Pro プランで AI があなたの食事内容に合わせたアドバイスを提案します。',
    benefits: ['パーソナライズされた改善提案', '目標別の食品推薦', '食事ごとに何度でも相談'],
  },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TabKey = MealType | 'daily';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'daily', label: '1日合計' },
  { key: 'breakfast', label: '朝食' },
  { key: 'lunch', label: '昼食' },
  { key: 'dinner', label: '夕食' },
  { key: 'snack', label: '間食' },
];

const GOAL_LABELS: Record<string, string> = {
  cut: '減量',
  bulk: '増量',
  maintain: '維持',
  recomp: 'リコンプ',
};

const MEAL_LABELS_JA: Record<TabKey, string> = {
  daily: '1日',
  breakfast: '朝食',
  lunch: '昼食',
  dinner: '夕食',
  snack: '間食',
};

const STATUS_LABELS: Record<BalanceStatus, string> = {
  adequate: '適正',
  excess: '過剰',
  deficient: '不足',
};

const FEEDBACK_KEY_PREFIX = 'nutrient_advice_feedback_';

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function BalanceScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);

  const params = useLocalSearchParams<{ mealType?: string; date?: string }>();
  const initialTab = (params.mealType as TabKey) ?? 'daily';
  const date = params.date ?? new Date().toISOString().slice(0, 10);

  const { todaySummary } = useNutrition(date);

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [displayMode, setDisplayMode] = useState<'graph' | 'table'>('graph');

  // AI advice state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFeedback, setAiFeedback] = useState<'up' | 'down' | null>(null);

  const flags = getFeatureFlags();
  const canViewExtended = flags.extendedNutrientBalance;
  const canViewMeal = flags.mealNutrientBalance;
  const canViewAI = flags.aiNutrientAdvice;

  const [upgradeTarget, setUpgradeTarget] = useState<UpgradeTarget | null>(null);

  const dateFormatted = formatDate(date, 'M月d日 (E)');

  const targets = useMemo(
    () => ({
      targetCalories: profile?.targetCalories ?? 2200,
      targetProteinG: profile?.targetProteinG ?? 160,
      targetFatG: profile?.targetFatG ?? 61,
      targetCarbG: profile?.targetCarbG ?? 248,
    }),
    [profile],
  );

  const balance: NutrientBalanceResult | null = useMemo(() => {
    if (!todaySummary) return null;
    return calculateNutrientBalance(
      todaySummary,
      targets,
      profile?.gender ?? 'male',
      activeTab,
    );
  }, [todaySummary, targets, profile?.gender, activeTab]);

  // Split items into PFC (free) and extended (premium)
  const pfcItems = useMemo(
    () => balance?.items.filter((i) => !i.isPremium) ?? [],
    [balance],
  );
  const extItems = useMemo(
    () => balance?.items.filter((i) => i.isPremium) ?? [],
    [balance],
  );

  // -----------------------------------------------------------------------
  // Tab press handler
  // -----------------------------------------------------------------------
  const handleTabPress = useCallback(
    (key: TabKey) => {
      if (key !== 'daily' && !canViewMeal) {
        setUpgradeTarget('plus-meal');
        return;
      }
      setActiveTab(key);
      // Reset AI advice when switching tabs
      setAiAdvice(null);
      setAiError(null);
      setAiFeedback(null);
    },
    [canViewMeal],
  );

  // -----------------------------------------------------------------------
  // AI Advice
  // -----------------------------------------------------------------------
  const handleRequestAdvice = useCallback(async () => {
    if (!balance || !profile) return;

    setAiLoading(true);
    setAiError(null);
    setAiAdvice(null);

    const mealLabel = MEAL_LABELS_JA[activeTab];
    const nutrientList = balance.items
      .filter((i) => i.target > 0)
      .map(
        (i) =>
          `${i.label}: ${i.intake}${i.unit} / ${i.target}${i.unit} (${STATUS_LABELS[i.status]})`,
      )
      .join('\n');

    const goalLabel = GOAL_LABELS[profile.goalType] ?? profile.goalType;

    const prompt = `以下は${profile.displayName}さんの${mealLabel}の栄養摂取データです。

${nutrientList}

ユーザー情報:
- 目標: ${goalLabel}（${profile.goalType}）
- 性別: ${profile.gender === 'female' ? '女性' : '男性'}
- 体重: ${profile.currentWeightKg}kg

このデータに基づいて、以下の形式で簡潔にアドバイスしてください:
1. 全体の評価（1文、親しみやすく）
2. 改善すべき点（2-3個、具体的な食品名を挙げて）
3. 良かった点（1-2個）

日本語で、筋トレをしている人向けの実用的なトーンで答えてください。
「〜してみてください」「〜がおすすめです」のような提案型で。`;

    try {
      const text = await fetchNutritionAdvice(prompt);
      setAiAdvice(text);
    } catch (e) {
      if (e instanceof AIError) {
        switch (e.code) {
          case 'pro_required':
            setUpgradeTarget('pro-ai');
            break;
          case 'quota_exceeded':
            setAiError(e.message);
            break;
          case 'unauthorized':
          case 'invalid_token':
            setAiError('ログインが必要です');
            break;
          default:
            setAiError('アドバイスを取得できませんでした');
        }
      } else {
        setAiError('アドバイスを取得できませんでした');
      }
    } finally {
      setAiLoading(false);
    }
  }, [balance, profile, activeTab]);

  const handleAiFeedback = useCallback(
    async (type: 'up' | 'down') => {
      setAiFeedback(type);
      await AsyncStorage.setItem(
        `${FEEDBACK_KEY_PREFIX}${date}_${activeTab}`,
        type,
      );
    },
    [date, activeTab],
  );

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const renderStatusBadge = (status: BalanceStatus) => {
    const bg =
      status === 'adequate'
        ? colors.success
        : status === 'excess'
          ? colors.warning
          : colors.primary;
    return (
      <View style={[styles.tableBadge, { backgroundColor: bg }]}>
        <Text style={styles.tableBadgeText}>{STATUS_LABELS[status]}</Text>
      </View>
    );
  };

  if (!todaySummary || !balance) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            栄養バランス
          </Text>
          <Text style={[styles.headerDate, { color: colors.textSecondary }]}>
            {dateFormatted}
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabBar, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.tabBarContent}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const isLocked = tab.key !== 'daily' && !canViewMeal;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab,
                isActive && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
              ]}
              onPress={() => handleTabPress(tab.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: isActive
                      ? colors.primary
                      : isLocked
                        ? colors.textTertiary
                        : colors.textSecondary,
                    fontWeight: isActive ? '600' : '400',
                  },
                ]}
              >
                {isLocked ? `${tab.label} ` : tab.label}
              </Text>
              {isLocked && (
                <Ionicons name="lock-closed" size={12} color={colors.textTertiary} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Display mode toggle */}
      <View style={styles.segmentRow}>
        <View style={[styles.segment, { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md }]}>
          {(['graph', 'table'] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.segmentButton,
                displayMode === mode && {
                  backgroundColor: colors.surface,
                  borderRadius: radius.sm,
                },
              ]}
              onPress={() => setDisplayMode(mode)}
            >
              <Text
                style={[
                  styles.segmentText,
                  {
                    color:
                      displayMode === mode
                        ? colors.textPrimary
                        : colors.textSecondary,
                    fontWeight: displayMode === mode ? '600' : '400',
                  },
                ]}
              >
                {mode === 'graph' ? 'グラフ' : '数値'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Overall score */}
        <View style={styles.scoreContainer}>
          <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>
            スコア
          </Text>
          <Text
            style={[
              styles.scoreValue,
              {
                color:
                  balance.overallScore >= 70
                    ? colors.success
                    : balance.overallScore >= 40
                      ? colors.warning
                      : colors.error,
              },
            ]}
          >
            {balance.overallScore}
          </Text>
          <Text style={[styles.scoreUnit, { color: colors.textTertiary }]}>
            点
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ============================================ */}
        {/* GRAPH MODE                                   */}
        {/* ============================================ */}
        {displayMode === 'graph' && (
          <>
            {/* PFC Section — visible to all */}
            <View style={[styles.section, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                PFC・カロリー
              </Text>
              {pfcItems.map((item) => (
                <NutrientBar
                  key={item.key}
                  label={item.label}
                  intake={item.intake}
                  target={item.target}
                  unit={item.unit}
                  status={item.status}
                  isUpperLimit={item.isUpperLimit}
                  colors={colors}
                />
              ))}
            </View>

            {/* Extended nutrients section */}
            <View style={[styles.section, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                ビタミン・ミネラル
              </Text>

              {canViewExtended ? (
                extItems.map((item) => (
                  <NutrientBar
                    key={item.key}
                    label={item.label}
                    intake={item.intake}
                    target={item.target}
                    unit={item.unit}
                    status={item.status}
                    isUpperLimit={item.isUpperLimit}
                    colors={colors}
                  />
                ))
              ) : (
                <View style={styles.lockWrapper}>
                  {/* Blurred preview */}
                  <View style={styles.blurredPreview}>
                    {extItems.slice(0, 5).map((item) => (
                      <NutrientBar
                        key={item.key}
                        label={item.label}
                        intake={item.intake}
                        target={item.target}
                        unit={item.unit}
                        status={item.status}
                        isUpperLimit={item.isUpperLimit}
                        colors={colors}
                      />
                    ))}
                  </View>
                  {/* Lock overlay */}
                  <View
                    style={[
                      styles.lockOverlay,
                      {
                        backgroundColor:
                          scheme === 'dark'
                            ? 'rgba(0,0,0,0.7)'
                            : 'rgba(255,255,255,0.85)',
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.lockContent}
                      onPress={() => setUpgradeTarget('plus-extended')}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="lock-closed"
                        size={28}
                        color={colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.lockText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Plusプランで全栄養素を確認
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </>
        )}

        {/* ============================================ */}
        {/* TABLE MODE                                   */}
        {/* ============================================ */}
        {displayMode === 'table' && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
            {/* Table header */}
            <View style={[styles.tableRow, styles.tableHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.tableHeaderCell, styles.tableColName, { color: colors.textSecondary }]}>
                栄養素
              </Text>
              <Text style={[styles.tableHeaderCell, styles.tableColTarget, { color: colors.textSecondary }]}>
                基準値
              </Text>
              <Text style={[styles.tableHeaderCell, styles.tableColIntake, { color: colors.textSecondary }]}>
                摂取量
              </Text>
              <Text style={[styles.tableHeaderCell, styles.tableColStatus, { color: colors.textSecondary }]}>
                判定
              </Text>
            </View>

            {/* PFC rows — always visible */}
            {pfcItems.map((item) => (
              <View
                key={item.key}
                style={[styles.tableRow, { borderBottomColor: colors.border }]}
              >
                <Text
                  style={[styles.tableCell, styles.tableColName, { color: colors.textPrimary }]}
                >
                  {item.label}
                </Text>
                <Text
                  style={[styles.tableCell, styles.tableColTarget, { color: colors.textSecondary }]}
                >
                  {item.target} {item.unit}
                </Text>
                <Text
                  style={[styles.tableCell, styles.tableColIntake, { color: colors.textPrimary }]}
                >
                  {item.intake} {item.unit}
                </Text>
                <View style={styles.tableColStatus}>
                  {item.target > 0 && renderStatusBadge(item.status)}
                </View>
              </View>
            ))}

            {/* Extended rows */}
            {canViewExtended ? (
              extItems.map((item) => (
                <View
                  key={item.key}
                  style={[styles.tableRow, { borderBottomColor: colors.border }]}
                >
                  <Text
                    style={[styles.tableCell, styles.tableColName, { color: colors.textPrimary }]}
                  >
                    {item.label}
                  </Text>
                  <Text
                    style={[styles.tableCell, styles.tableColTarget, { color: colors.textSecondary }]}
                  >
                    {item.target} {item.unit}
                  </Text>
                  <Text
                    style={[styles.tableCell, styles.tableColIntake, { color: colors.textPrimary }]}
                  >
                    {item.intake} {item.unit}
                  </Text>
                  <View style={styles.tableColStatus}>
                    {item.target > 0 && renderStatusBadge(item.status)}
                  </View>
                </View>
              ))
            ) : (
              <TouchableOpacity
                style={[styles.tableLockRow, { borderTopColor: colors.border }]}
                onPress={() => setUpgradeTarget('plus-extended')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="lock-closed"
                  size={16}
                  color={colors.textTertiary}
                />
                <Text style={[styles.tableLockText, { color: colors.textTertiary }]}>
                  Plusプランで全栄養素を表示
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ============================================ */}
        {/* AI Advice Section                            */}
        {/* ============================================ */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
          <View style={styles.aiHeader}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0 }]}>
              AIアドバイス
            </Text>
          </View>

          {!canViewAI ? (
            <TouchableOpacity
              style={[styles.aiLockCard, { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md }]}
              onPress={() => setUpgradeTarget('pro-ai')}
              activeOpacity={0.7}
            >
              <Ionicons name="lock-closed" size={20} color={colors.textTertiary} />
              <Text style={[styles.aiLockText, { color: colors.textSecondary }]}>
                Proプランで AI による食事アドバイスが受けられます
              </Text>
              <Text style={[styles.aiLockLink, { color: colors.primary }]}>
                詳しく見る
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              {!aiAdvice && !aiLoading && !aiError && (
                <TouchableOpacity
                  style={[styles.aiRequestButton, { backgroundColor: colors.primary, borderRadius: radius.md }]}
                  onPress={handleRequestAdvice}
                  activeOpacity={0.7}
                >
                  <Ionicons name="sparkles" size={16} color="#FFFFFF" />
                  <Text style={styles.aiRequestButtonText}>
                    アドバイスを受ける
                  </Text>
                </TouchableOpacity>
              )}

              {aiLoading && (
                <View style={styles.aiLoadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.aiLoadingText, { color: colors.textSecondary }]}>
                    AIがアドバイスを作成中...
                  </Text>
                </View>
              )}

              {aiError && (
                <View style={[styles.aiErrorCard, { backgroundColor: colors.error + '10', borderRadius: radius.md }]}>
                  <Text style={[styles.aiErrorText, { color: colors.error }]}>
                    {aiError}
                  </Text>
                </View>
              )}

              {aiAdvice && (
                <View>
                  <View
                    style={[
                      styles.aiCard,
                      {
                        backgroundColor: colors.surfaceSecondary,
                        borderRadius: radius.lg,
                        borderLeftColor: colors.primary,
                      },
                    ]}
                  >
                    <Text style={[styles.aiCardText, { color: colors.textPrimary }]}>
                      {aiAdvice}
                    </Text>
                  </View>
                  <View style={styles.aiFeedbackRow}>
                    <TouchableOpacity
                      style={[
                        styles.aiFeedbackButton,
                        aiFeedback === 'up' && { backgroundColor: colors.success + '20' },
                        { borderColor: colors.border, borderRadius: radius.md },
                      ]}
                      onPress={() => handleAiFeedback('up')}
                      disabled={aiFeedback !== null}
                    >
                      <Text style={{ fontSize: 16 }}>
                        {aiFeedback === 'up' ? '👍' : '👍'}
                      </Text>
                      <Text style={[styles.aiFeedbackLabel, { color: colors.textSecondary }]}>
                        役立った
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.aiFeedbackButton,
                        aiFeedback === 'down' && { backgroundColor: colors.error + '20' },
                        { borderColor: colors.border, borderRadius: radius.md },
                      ]}
                      onPress={() => handleAiFeedback('down')}
                      disabled={aiFeedback !== null}
                    >
                      <Text style={{ fontSize: 16 }}>
                        {aiFeedback === 'down' ? '👎' : '👎'}
                      </Text>
                      <Text style={[styles.aiFeedbackLabel, { color: colors.textSecondary }]}>
                        イマイチ
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* Bottom spacer */}
        <View style={{ height: spacing.xxxxl }} />
      </ScrollView>

      <UpgradePromptModal
        visible={upgradeTarget !== null}
        onClose={() => setUpgradeTarget(null)}
        featureName={
          upgradeTarget ? UPGRADE_CONTENT[upgradeTarget].featureName : ''
        }
        featureDescription={
          upgradeTarget ? UPGRADE_CONTENT[upgradeTarget].description : undefined
        }
        requiredPlan={
          upgradeTarget ? UPGRADE_CONTENT[upgradeTarget].requiredPlan : 'plus'
        }
        benefits={
          upgradeTarget ? UPGRADE_CONTENT[upgradeTarget].benefits : undefined
        }
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
  },
  backButton: {
    width: 32,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.titleMedium,
  },
  headerDate: {
    ...typography.bodySmall,
    marginTop: 2,
  },
  headerRight: {
    width: 32,
  },

  // Tabs
  tabBar: {
    borderBottomWidth: 0.5,
    maxHeight: 44,
  },
  tabBarContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    ...typography.labelLarge,
  },

  // Segment control
  segmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  segment: {
    flexDirection: 'row',
    padding: 3,
  },
  segmentButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  segmentText: {
    ...typography.labelMedium,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  scoreLabel: {
    ...typography.labelSmall,
  },
  scoreValue: {
    ...typography.numberMedium,
  },
  scoreUnit: {
    ...typography.labelSmall,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },

  // Section card
  section: {
    padding: spacing.lg,
  },
  sectionTitle: {
    ...typography.titleSmall,
    marginBottom: spacing.sm,
  },

  // Lock overlay (graph mode)
  lockWrapper: {
    position: 'relative',
    minHeight: 200,
    overflow: 'hidden',
  },
  blurredPreview: {
    opacity: 0.3,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockContent: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  lockText: {
    ...typography.labelLarge,
  },

  // Table
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
  },
  tableHeader: {
    paddingVertical: spacing.xs,
  },
  tableHeaderCell: {
    ...typography.labelSmall,
  },
  tableCell: {
    ...typography.bodySmall,
  },
  tableColName: {
    flex: 2,
  },
  tableColTarget: {
    flex: 2,
    textAlign: 'right',
  },
  tableColIntake: {
    flex: 2,
    textAlign: 'right',
  },
  tableColStatus: {
    flex: 1,
    alignItems: 'flex-end',
  },
  tableBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  tableBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 14,
  },
  tableLockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderTopWidth: 0.5,
  },
  tableLockText: {
    ...typography.labelMedium,
  },

  // AI section
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  aiLockCard: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  aiLockText: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
  aiLockLink: {
    ...typography.labelLarge,
    marginTop: spacing.xs,
  },
  aiRequestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  aiRequestButtonText: {
    ...typography.labelLarge,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  aiLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  aiLoadingText: {
    ...typography.bodyMedium,
  },
  aiErrorCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  aiErrorText: {
    ...typography.bodyMedium,
  },
  aiErrorLink: {
    ...typography.labelMedium,
  },
  aiCard: {
    padding: spacing.lg,
    borderLeftWidth: 3,
  },
  aiCardText: {
    ...typography.bodyMedium,
    lineHeight: 22,
  },
  aiFeedbackRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  aiFeedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
  },
  aiFeedbackLabel: {
    ...typography.labelSmall,
  },
});
