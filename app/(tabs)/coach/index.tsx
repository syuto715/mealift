import React, { useCallback, useEffect } from 'react';
import {
  Alert,
  FlatList,
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
import { useAiCoachChatQuota } from '../../../src/hooks/useAiCoachChatQuota';
import { useSubscription } from '../../../src/hooks/useSubscription';
import { PersonaHeader } from '../../../src/components/coach/PersonaHeader';
import { ProInlineCTA } from '../../../src/components/shared/ProInlineCTA';
import { getColors } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import type { LocalChatConversation } from '../../../src/types/chat';

// v1.5 Stage 1 Phase 1.2 — coach tab landing screen.
// Lists prior conversations (SQLite v31 read-cache) + presents a
// 「+ 新しい会話」 entry that routes to /(tabs)/coach/new.
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

  // Phase 1.6 — long-press a conversation row to surface a 3-way
  // action sheet (Archive / Delete / Cancel). Delete prompts a
  // second confirmation since it's irreversible. Both actions
  // require online (the repository layer returns
  // `{ ok: false, errorMessage }` when supabase=null); the
  // surfaced message hits the user via Alert.
  const handleConversationLongPress = useCallback(
    (conv: LocalChatConversation) => {
      const title = conv.title ?? '名前のない会話';
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

  const quota = useAiCoachChatQuota();
  const sub = useSubscription();

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

  const handleStartNew = () => {
    router.push('/(tabs)/coach/new');
  };

  const renderItem = ({ item }: { item: LocalChatConversation }) => (
    <TouchableOpacity
      style={[styles.row, { borderColor: colors.border }]}
      onPress={() => router.push(`/(tabs)/coach/${item.id}`)}
      onLongPress={() => handleConversationLongPress(item)}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={item.title ?? '会話を開く'}
      accessibilityHint="長押しでアーカイブ・削除メニューを開きます"
      testID={`conversation-row-${item.id}`}
    >
      <Ionicons
        name="chatbubble-ellipses-outline"
        size={20}
        color={colors.primary}
      />
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.rowTitle, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {item.title ?? '名前のない会話'}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.textTertiary }]}>
          {new Date(item.updatedAt).toLocaleString('ja-JP')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );

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
          accessibilityHint="ミー先生と新しい会話を開始します"
          testID="coach-start-new-button"
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.newButtonLabel}>新しい会話</Text>
        </TouchableOpacity>
      </View>

      {!quota.isUnlimited && (
        <View style={[styles.quotaRow, { borderColor: colors.border }]}>
          <Text style={[styles.quotaLabel, { color: colors.textSecondary }]}>
            今月の残り: {quota.remaining} / {quota.limit}
          </Text>
          {quota.isExhausted && sub.isFree && (
            <ProInlineCTA
              label="ミー先生にもっと相談するには Plus へ →"
              variant="link"
            />
          )}
        </View>
      )}

      {/* v1.5 Stage 1 Phase 1.3 — diagnostic wizard entry. Same
          surface as the chat list so users find diagnostic +
          chat side-by-side. The entry screen handles the Free
          user ProInlineCTA case (plan check there). */}
      <TouchableOpacity
        style={[
          styles.diagnosticEntry,
          { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
        ]}
        onPress={() => router.push('/(tabs)/coach/diagnostic')}
        accessibilityRole="button"
        accessibilityLabel="ミー先生に診断してもらう"
        accessibilityHint="質問に答えると、 オリジナルのルーティンを生成します"
        testID="coach-diagnostic-entry"
      >
        <Ionicons
          name="clipboard-outline"
          size={20}
          color={colors.primary}
        />
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.diagnosticEntryTitle, { color: colors.textPrimary }]}
          >
            ミー先生に診断してもらう
          </Text>
          <Text
            style={[styles.diagnosticEntryHint, { color: colors.textTertiary }]}
          >
            いくつかの質問にお答えいただくと、 オリジナルのルーティンを生成します
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </TouchableOpacity>

      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        contentContainerStyle={
          conversations.length === 0 ? styles.emptyContainer : styles.list
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons
              name="chatbubbles-outline"
              size={48}
              color={colors.textTertiary}
            />
            <Text
              style={[styles.emptyText, { color: colors.textSecondary }]}
            >
              ミー先生に話しかけてみましょう
            </Text>
            <TouchableOpacity
              style={[styles.emptyCta, { backgroundColor: colors.primary }]}
              onPress={handleStartNew}
              accessibilityRole="button"
              accessibilityLabel="新しい会話を始める"
              accessibilityHint="ミー先生と最初の会話を開始します"
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.newButtonLabel}>新しい会話を始める</Text>
            </TouchableOpacity>
          </View>
        }
      />
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
  quotaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
  },
  quotaLabel: {
    ...typography.labelMedium,
  },
  diagnosticEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 0.5,
  },
  diagnosticEntryTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },
  diagnosticEntryHint: {
    ...typography.labelSmall,
    marginTop: 2,
  },
  list: {
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
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
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 9999,
    marginTop: spacing.sm,
  },
});
