import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useProfileStore } from '../../../src/stores/profileStore';
import { useChatStore } from '../../../src/stores/chatStore';
import { useSubscription } from '../../../src/hooks/useSubscription';
import { useAiCoachChatQuota } from '../../../src/hooks/useAiCoachChatQuota';
import { PersonaHeader } from '../../../src/components/coach/PersonaHeader';
import { MessageBubble } from '../../../src/components/coach/MessageBubble';
import { DisclaimerFooter } from '../../../src/components/coach/DisclaimerFooter';
import { ProInlineCTA } from '../../../src/components/shared/ProInlineCTA';
import {
  isDisclaimerSeen,
  markDisclaimerSeen,
} from '../../../src/utils/disclaimerStorage';
import { getColors } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import type { LocalChatMessage } from '../../../src/types/chat';

// v1.5 Stage 1 Phase 1.2 — chat conversation surface.
// Renders the message stream + send box. The `id` param is either
// a server conversation id OR the literal `'new'` (no DB row yet);
// on first send the meta event supplies the server id and we
// router.replace to that route.

export default function CoachConversationScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const profile = useProfileStore((s) => s.profile);
  const userId = profile?.id ?? '';

  const messages = useChatStore((s) => s.messages);
  const isStreaming =
    useChatStore((s) => s.streamingState.abortController) !== null;
  const error = useChatStore((s) => s.error);
  const isOffline = useChatStore((s) => s.isOffline);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const refreshQuotaCount = useChatStore((s) => s.refreshQuotaCount);
  const setActiveConversationId = useChatStore(
    (s) => s.setActiveConversationId,
  );
  const sendMessage = useChatStore((s) => s.sendMessage);
  const regenerateMessage = useChatStore((s) => s.regenerateMessage);
  const abortStream = useChatStore((s) => s.abortStream);
  const dismissError = useChatStore((s) => s.dismissError);
  const dismissOffline = useChatStore((s) => s.dismissOffline);

  const sub = useSubscription();
  const quota = useAiCoachChatQuota();

  const [draft, setDraft] = useState('');
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const listRef = useRef<FlatList<LocalChatMessage>>(null);

  // Load messages on mount + when id changes. For /(tabs)/coach/new
  // we reset every surfaceable piece of state — Codex round 1
  // Important #4 fix: previously only `messages` was cleared, so a
  // failed send in the prior conversation left `error` / `isOffline`
  // / `streamingState` set, which kept the compose screen banner-up
  // and `sendDisabled=true` for the fresh thread.
  useEffect(() => {
    if (isNew) {
      setActiveConversationId(null);
      useChatStore.setState({
        messages: [],
        error: null,
        isOffline: false,
        streamingState: {
          conversationId: null,
          assistantMessageId: null,
          abortController: null,
        },
      });
      return;
    }
    if (id && userId) {
      void loadMessages(id);
      void refreshQuotaCount(userId);
    }
  }, [
    id,
    isNew,
    userId,
    loadMessages,
    refreshQuotaCount,
    setActiveConversationId,
  ]);

  // Pattern 19 (lifecycle defense): abort any in-flight stream on
  // unmount / screen background / id change.
  useEffect(() => {
    return () => {
      const ctrl = useChatStore.getState().streamingState.abortController;
      if (ctrl) ctrl.abort();
    };
  }, []);

  // Codex round 1 Nit #2 fix — mark the disclaimer seen as soon as
  // the user opens the FIRST conversation (§7.3 says "first
  // conversation open", not "first send"). If the user backs out
  // without sending, they should not see it again on the next
  // open.
  useEffect(() => {
    if (!isDisclaimerSeen()) {
      setShowDisclaimer(true);
      markDisclaimerSeen();
    }
  }, []);

  // Auto-scroll to the latest message as new content streams in.
  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || !userId) return;
    setDraft('');
    // Hide the disclaimer once the user actually engages; the
    // 'seen' flag was already persisted on open (§7.3).
    if (showDisclaimer) setShowDisclaimer(false);
    try {
      const wasNew = isNew;
      const result = await sendMessage({
        userId,
        conversationId: isNew ? null : id ?? null,
        text,
      });
      if (wasNew && result.conversationId) {
        router.replace(`/(tabs)/coach/${result.conversationId}`);
      }
    } catch {
      // chatStore already populated `error` / `isOffline` state;
      // the banner UI surfaces it. Don't escalate.
    }
  }, [draft, userId, isNew, id, sendMessage, showDisclaimer]);

  const handleRegenerate = useCallback(
    (messageId: string) => {
      if (!userId || !id || isNew) return;
      void regenerateMessage({
        userId,
        conversationId: id,
        assistantMessageId: messageId,
      });
    },
    [userId, id, isNew, regenerateMessage],
  );

  const sendDisabled = useMemo(() => {
    if (isStreaming) return true;
    if (!draft.trim()) return true;
    if (!sub.hasFeature('aiCoachChat')) return true;
    if (quota.isExhausted) return true;
    if (isOffline) return true;
    return false;
  }, [isStreaming, draft, sub, quota.isExhausted, isOffline]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={[styles.headerRow, { borderColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="戻る"
          accessibilityHint="会話一覧に戻ります"
          style={styles.backButton}
          testID="coach-back-button"
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={colors.textPrimary}
          />
        </TouchableOpacity>
        <PersonaHeader testID="coach-thread-persona-header" />
        <View style={styles.headerSpacer} />
      </View>

      {!quota.isUnlimited && (
        <View
          style={[
            styles.quotaBanner,
            { backgroundColor: colors.surfaceSecondary },
          ]}
        >
          <Text style={[styles.quotaText, { color: colors.textSecondary }]}>
            今月の残り: {quota.remaining} / {quota.limit}
          </Text>
          {quota.isExhausted && sub.isFree && (
            <ProInlineCTA
              label="今月の上限に達しました。 Plus / Pro へ →"
              variant="link"
            />
          )}
        </View>
      )}

      {isOffline && (
        <TouchableOpacity
          onPress={dismissOffline}
          accessibilityRole="button"
          accessibilityLabel="オフライン通知を閉じる"
          accessibilityHint="この通知を閉じます"
          style={[styles.banner, { backgroundColor: colors.warning + '22' }]}
          testID="offline-banner"
        >
          <Ionicons
            name="cloud-offline-outline"
            size={16}
            color={colors.warning}
          />
          <Text style={[styles.bannerText, { color: colors.warning }]}>
            ネットワーク接続が必要です
          </Text>
        </TouchableOpacity>
      )}

      {error && !isOffline && (
        <TouchableOpacity
          onPress={dismissError}
          accessibilityRole="button"
          accessibilityLabel="エラー通知を閉じる"
          accessibilityHint="この通知を閉じます"
          style={[styles.banner, { backgroundColor: colors.error + '22' }]}
          testID="error-banner"
        >
          <Ionicons
            name="alert-circle-outline"
            size={16}
            color={colors.error}
          />
          <Text style={[styles.bannerText, { color: colors.error }]}>
            {error.message}
          </Text>
        </TouchableOpacity>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.clientTempId}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              onRegenerate={isNew ? undefined : handleRegenerate}
            />
          )}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={showDisclaimer ? <DisclaimerFooter /> : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text
                style={[styles.emptyText, { color: colors.textSecondary }]}
              >
                ミー先生に話しかけてみましょう
              </Text>
            </View>
          }
        />

        <View
          style={[
            styles.composer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="ミー先生に質問する..."
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={2000}
            style={[styles.input, { color: colors.textPrimary }]}
            editable={!isStreaming}
            accessibilityLabel="メッセージ入力"
            testID="coach-input"
          />
          {isStreaming ? (
            <TouchableOpacity
              onPress={abortStream}
              accessibilityRole="button"
              accessibilityLabel="停止"
              accessibilityHint="進行中の応答を中止します"
              style={[styles.sendButton, { backgroundColor: colors.error }]}
              testID="coach-abort-button"
            >
              <Ionicons name="stop" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleSend}
              accessibilityRole="button"
              accessibilityLabel="送信"
              accessibilityHint={
                isOffline
                  ? 'ネット接続を確認してください'
                  : quota.isExhausted
                    ? '今月のチャット上限に達しました'
                    : !draft.trim()
                      ? 'メッセージを入力してください'
                      : 'ミー先生にメッセージを送信します'
              }
              accessibilityState={{ disabled: sendDisabled }}
              style={[
                styles.sendButton,
                {
                  backgroundColor: sendDisabled
                    ? colors.textTertiary
                    : colors.primary,
                },
              ]}
              disabled={sendDisabled}
              testID="coach-send-button"
            >
              {isStreaming ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Ionicons name="send" size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
  },
  backButton: {
    paddingRight: spacing.sm,
  },
  headerSpacer: {
    flex: 1,
  },
  quotaBanner: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignItems: 'flex-end',
  },
  quotaText: {
    ...typography.labelSmall,
    fontVariant: ['tabular-nums'],
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bannerText: {
    ...typography.labelMedium,
    fontWeight: '500',
  },
  listContent: {
    paddingVertical: spacing.sm,
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxxl,
  },
  emptyText: {
    ...typography.bodyMedium,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 0.5,
  },
  input: {
    flex: 1,
    ...typography.bodyMedium,
    minHeight: 36,
    maxHeight: 120,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
