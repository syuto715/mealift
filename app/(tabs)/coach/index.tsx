import React, { useCallback, useEffect, useMemo } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useProfileStore } from '../../../src/stores/profileStore';
import { useChatStore } from '../../../src/stores/chatStore';
import { useNutrition } from '../../../src/hooks/useNutrition';
import { useAiCoachChatQuota } from '../../../src/hooks/useAiCoachChatQuota';
import { useSubscription } from '../../../src/hooks/useSubscription';
import { PersonaHeader } from '../../../src/components/coach/PersonaHeader';
import { ProInlineCTA } from '../../../src/components/shared/ProInlineCTA';
import {
  COACH_THEMES,
  NEW_CONVERSATION_OPTIONS,
} from '../../../src/domain/coachThemes';
import { displayConversationTitle } from '../../../src/domain/conversationTitle';
import { formatDateTimeJa } from '../../../src/utils/format';
import { getColors } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import type { LocalChatConversation } from '../../../src/types/chat';

// v1.5.2 レビュー #7 — コーチ画面 redesign。
// 「チャットを開く」ではなく「記録に基づいて次に何をすべきか相談する」画面へ。
//   1. 今日の提案 (決定論的・新 AI call なし — home の meeHitokoto を流用)
//   2. 記録から診断 (主 CTA — 既存 diagnostic フローを昇格)
//   3. 相談テーマ 6 カード (テーマ起点会話 = テーマ名で自動タイトル)
//   4. 最近の会話 (自動タイトル・旧会話は日時フォールバック・主役にしない)
//   5. 新しい会話 (+) → テーマ選択 (いきなり白紙にしない)
// data/AI 層は不可触: 会話・診断・quota・gating のロジックは既存のまま。
export default function CoachConversationList() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const profile = useProfileStore((s) => s.profile);
  const userId = profile?.id ?? '';
  const conversations = useChatStore((s) => s.conversations);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const refreshQuotaCount = useChatStore((s) => s.refreshQuotaCount);
  const archiveConv = useChatStore((s) => s.archiveConversation);
  const deleteConv = useChatStore((s) => s.deleteConversation);

  const quota = useAiCoachChatQuota();
  const sub = useSubscription();

  // 今日の提案用のデータ。home と同じ useNutrition(today) + profile 目標を
  // 流用した決定論的な一言 (新 AI call なし・gating なし)。
  const { totalCalories, totalProteinG } = useNutrition();
  const targetCalories = profile?.targetCalories ?? 0;
  const targetProteinG = profile?.targetProteinG ?? 0;
  const consumedCalories = totalCalories;
  const remaining = Math.max(0, targetCalories - consumedCalories);

  const meeHitokoto = useMemo(() => {
    if (targetCalories <= 0) {
      return 'プロフィールで目標カロリーを設定すると、 記録に基づくアドバイスをお届けします。';
    }
    if (consumedCalories === 0) {
      return '今日はまだ記録がありません。 まずは最初の一食を記録してみましょう。';
    }
    const proteinShort =
      targetProteinG > 0 && totalProteinG < targetProteinG * 0.7;
    if (consumedCalories >= targetCalories) {
      return '今日の目標カロリーに到達しました。 お疲れさまです。 水分補給も忘れずに。';
    }
    if (proteinShort) {
      return `あと ${remaining} kcal。 タンパク質がやや不足ぎみなので、 次の食事で意識してみましょう。`;
    }
    return `あと ${remaining} kcal 記録できます。 バランスよく栄養を摂りましょう。`;
  }, [targetCalories, consumedCalories, remaining, totalProteinG, targetProteinG]);

  const hasRecordToday = consumedCalories > 0;

  // Phase 1.6 — long-press a conversation row → 3-way action sheet
  // (Archive / Delete / Cancel). Both require online; the repository
  // returns `{ ok: false, errorMessage }` when offline. (unchanged)
  const handleConversationLongPress = useCallback(
    (conv: LocalChatConversation) => {
      const title = displayConversationTitle(conv.title, conv.updatedAt);
      Alert.alert(title, '操作を選択してください', [
        {
          text: 'アーカイブ',
          onPress: async () => {
            const result = await archiveConv({
              userId,
              conversationId: conv.id,
            });
            if (!result.ok) {
              Alert.alert(
                'アーカイブできませんでした',
                result.errorMessage ?? '時間をおいて再度お試しください',
              );
            }
          },
        },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              '会話を削除',
              '会話のメッセージはすべて削除されます。 元に戻せません。',
              [
                { text: 'キャンセル', style: 'cancel' },
                {
                  text: '削除する',
                  style: 'destructive',
                  onPress: async () => {
                    const result = await deleteConv({
                      userId,
                      conversationId: conv.id,
                    });
                    if (!result.ok) {
                      Alert.alert(
                        '削除できませんでした',
                        result.errorMessage ?? '時間をおいて再度お試しください',
                      );
                    }
                  },
                },
              ],
            );
          },
        },
        { text: 'キャンセル', style: 'cancel' },
      ]);
    },
    [userId, archiveConv, deleteConv],
  );

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      void loadConversations(userId);
      void refreshQuotaCount(userId);
    }, [userId, loadConversations, refreshQuotaCount]),
  );

  useEffect(() => {
    if (!userId) return;
    void loadConversations(userId);
  }, [userId, loadConversations]);

  const openThemeChat = useCallback((themeId: string | null) => {
    router.push(
      themeId
        ? `/(tabs)/coach/new?theme=${themeId}`
        : '/(tabs)/coach/new',
    );
  }, []);

  // 「新しい会話」(+) → いきなり白紙にせず、テーマ選択を挟む。
  const handleStartNew = useCallback(() => {
    Alert.alert('相談テーマを選ぶ', '何について相談しますか？', [
      ...NEW_CONVERSATION_OPTIONS.map((opt) => ({
        text: opt.label,
        onPress: () => openThemeChat(opt.themeId),
      })),
      { text: 'キャンセル', style: 'cancel' as const },
    ]);
  }, [openThemeChat]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.headerRow}>
        <PersonaHeader testID="coach-list-persona-header" />
        <TouchableOpacity
          style={[styles.newButton, { backgroundColor: colors.primary }]}
          onPress={handleStartNew}
          accessibilityRole="button"
          accessibilityLabel="新しい会話を始める"
          accessibilityHint="相談テーマを選んでミー先生と会話を始めます"
          testID="coach-start-new-button"
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.newButtonLabel}>新しい会話</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 今日の提案 — 記録に基づく決定論的な一言 + 相談導線 (最上部・主役)。 */}
        <View
          style={[
            styles.suggestionCard,
            { backgroundColor: colors.primary + '14', borderColor: colors.primary + '33' },
          ]}
        >
          <View style={styles.suggestionHeader}>
            <Ionicons name="bulb-outline" size={18} color={colors.primary} />
            <Text style={[styles.suggestionLabel, { color: colors.primary }]}>
              今日の提案
            </Text>
          </View>
          <Text style={[styles.suggestionBody, { color: colors.textPrimary }]}>
            {meeHitokoto}
          </Text>
          <TouchableOpacity
            style={[styles.suggestionCta, { borderColor: colors.primary }]}
            onPress={() => openThemeChat('meal_improve')}
            accessibilityRole="button"
            accessibilityLabel="今日の食事について詳しく聞く"
            accessibilityHint="今日の記録をもとにミー先生に相談します"
            testID="coach-suggestion-cta"
          >
            <Text style={[styles.suggestionCtaLabel, { color: colors.primary }]}>
              詳しく聞く
            </Text>
            <Ionicons name="arrow-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* 記録から診断 — 主 CTA。既存 diagnostic フローを昇格 (gating 不変)。 */}
        <TouchableOpacity
          style={[styles.diagnosticCard, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/(tabs)/coach/diagnostic')}
          accessibilityRole="button"
          accessibilityLabel="記録から診断してもらう"
          accessibilityHint="今日の食事・体重・運動から改善点をまとめます"
          testID="coach-diagnostic-entry"
        >
          <View style={styles.diagnosticHeader}>
            <Ionicons name="clipboard-outline" size={22} color="#FFFFFF" />
            <Text style={styles.diagnosticTitle}>記録から診断</Text>
          </View>
          <Text style={styles.diagnosticBody}>
            今日の食事・体重・運動から改善点をまとめます。
          </Text>
          <Text style={styles.diagnosticStatus}>
            {hasRecordToday
              ? `今日の記録: ${Math.round(consumedCalories)} kcal`
              : '今日の記録はまだありません（簡易診断になります）'}
          </Text>
          <View style={styles.diagnosticActions}>
            <View style={styles.diagnosticPrimaryBtn}>
              <Text style={[styles.diagnosticPrimaryLabel, { color: colors.primary }]}>
                診断してもらう
              </Text>
              <Ionicons name="arrow-forward" size={16} color={colors.primary} />
            </View>
          </View>
        </TouchableOpacity>
        {!hasRecordToday && (
          <TouchableOpacity
            style={[styles.recordHint, { borderColor: colors.border }]}
            onPress={() =>
              router.push({ pathname: '/add-food', params: { mealType: 'dinner' } })
            }
            accessibilityRole="button"
            accessibilityLabel="食事を記録する"
            accessibilityHint="食品追加画面を開きます"
            testID="coach-record-food-hint"
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={[styles.recordHintLabel, { color: colors.textSecondary }]}>
              記録するともっと正確に診断できます — 食事を記録する
            </Text>
          </TouchableOpacity>
        )}

        {!quota.isUnlimited && (
          <View style={[styles.quotaRow, { borderColor: colors.border }]}>
            <Text style={[styles.quotaLabel, { color: colors.textSecondary }]}>
              今月の残り相談: {quota.remaining} / {quota.limit}
            </Text>
            {quota.isExhausted && sub.isFree && (
              <ProInlineCTA
                label="続けて相談するには Plus / Pro へ →"
                variant="link"
              />
            )}
          </View>
        )}

        {/* 相談テーマ — 説明つき 6 カード。テーマ起点会話は自動タイトル付き。 */}
        <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>
          相談テーマ
        </Text>
        <View style={styles.themeGrid}>
          {COACH_THEMES.map((theme) => (
            <TouchableOpacity
              key={theme.id}
              style={[
                styles.themeCard,
                { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
              ]}
              onPress={() => openThemeChat(theme.id)}
              accessibilityRole="button"
              accessibilityLabel={theme.cardTitle}
              accessibilityHint={theme.cardDescription}
              testID={`coach-theme-${theme.id}`}
            >
              <Ionicons name={theme.icon} size={20} color={colors.primary} />
              <Text
                style={[styles.themeTitle, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {theme.cardTitle}
              </Text>
              <Text
                style={[styles.themeDesc, { color: colors.textSecondary }]}
                numberOfLines={2}
              >
                {theme.cardDescription}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 最近の会話 — 主役にしない。自動タイトル / 旧会話は日時フォールバック。 */}
        <Text
          style={[styles.sectionHeadingMuted, { color: colors.textSecondary }]}
        >
          最近の会話
        </Text>
        {conversations.length === 0 ? (
          <View style={styles.emptyConversations}>
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
              まだ会話がありません。 上のテーマから相談を始めてみましょう。
            </Text>
          </View>
        ) : (
          conversations.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.row, { borderColor: colors.border }]}
              onPress={() => router.push(`/(tabs)/coach/${item.id}`)}
              onLongPress={() => handleConversationLongPress(item)}
              delayLongPress={400}
              accessibilityRole="button"
              accessibilityLabel={displayConversationTitle(
                item.title,
                item.updatedAt,
              )}
              accessibilityHint="長押しでアーカイブ・削除メニューを開きます"
              testID={`conversation-row-${item.id}`}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={20}
                color={colors.textSecondary}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.rowTitle, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {displayConversationTitle(item.title, item.updatedAt)}
                </Text>
                <Text style={[styles.rowMeta, { color: colors.textTertiary }]}>
                  {formatDateTimeJa(item.updatedAt)}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textTertiary}
              />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 9999,
  },
  newButtonLabel: {
    ...typography.labelMedium,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  suggestionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  suggestionLabel: {
    ...typography.labelMedium,
    fontWeight: '700',
  },
  suggestionBody: {
    ...typography.bodyMedium,
    lineHeight: 22,
  },
  suggestionCta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 9999,
    borderWidth: 1,
  },
  suggestionCtaLabel: {
    ...typography.labelMedium,
    fontWeight: '600',
  },
  diagnosticCard: {
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.xs,
  },
  diagnosticHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  diagnosticTitle: {
    ...typography.titleSmall,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  diagnosticBody: {
    ...typography.bodyMedium,
    color: '#FFFFFF',
    opacity: 0.95,
  },
  diagnosticStatus: {
    ...typography.labelSmall,
    color: '#FFFFFF',
    opacity: 0.85,
  },
  diagnosticActions: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  diagnosticPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 9999,
  },
  diagnosticPrimaryLabel: {
    ...typography.labelMedium,
    fontWeight: '700',
  },
  recordHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 0.5,
  },
  recordHintLabel: {
    ...typography.labelMedium,
    flex: 1,
  },
  quotaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
  },
  quotaLabel: {
    ...typography.labelMedium,
  },
  sectionHeading: {
    ...typography.titleSmall,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  sectionHeadingMuted: {
    ...typography.labelMedium,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  themeCard: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 0.5,
    padding: spacing.md,
    gap: spacing.xs,
  },
  themeTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  themeDesc: {
    ...typography.labelSmall,
  },
  emptyConversations: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
  },
  rowTitle: {
    ...typography.bodyLarge,
    fontWeight: '500',
  },
  rowMeta: {
    ...typography.labelSmall,
    marginTop: 2,
  },
});
