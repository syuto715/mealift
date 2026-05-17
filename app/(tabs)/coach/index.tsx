import React, { useCallback, useEffect } from 'react';
import {
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
      accessibilityRole="button"
      accessibilityLabel={item.title ?? '会話を開く'}
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
