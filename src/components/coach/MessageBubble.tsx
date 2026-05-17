import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import type { LocalChatMessage } from '../../types/chat';

// v1.5 Stage 1 Phase 1.2 — chat message bubble.
//
// Renders a user or assistant message with its current status:
//   - sending  : spinner badge (UI-only transient; clears on meta)
//   - pending  : spinner badge (server-confirmed in-flight)
//   - final    : no badge
//   - partial  : "中断しました" tag + Regenerate button (assistant only)
//   - error    : error tag + Regenerate button (assistant only)
//
// The bubble keeps user vs assistant visually distinct via alignment
// + background color; the status badge sits at the trailing edge.

interface Props {
  message: LocalChatMessage;
  onRegenerate?: (messageId: string) => void;
}

export function MessageBubble({
  message,
  onRegenerate,
}: Props): React.ReactElement {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const bubbleBg = isUser ? colors.primary : colors.surfaceSecondary;
  const textColor = isUser ? '#FFFFFF' : colors.textPrimary;

  const isInFlight =
    message.status === 'sending' || message.status === 'pending';
  const showRegenerate =
    isAssistant &&
    (message.status === 'partial' || message.status === 'error');

  return (
    <View
      style={[
        styles.row,
        { justifyContent: isUser ? 'flex-end' : 'flex-start' },
      ]}
      testID={`message-bubble-${message.id}`}
    >
      <View
        style={[
          styles.bubble,
          { backgroundColor: bubbleBg },
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
        accessibilityRole="text"
        accessibilityLabel={`${
          isUser ? 'あなた' : 'ミー先生'
        }: ${message.content || (isInFlight ? '応答中' : '')}`}
      >
        {message.content.length > 0 && (
          <Text style={[styles.text, { color: textColor }]}>
            {message.content}
          </Text>
        )}
        {isInFlight && message.content.length === 0 && (
          <ActivityIndicator
            color={textColor}
            accessibilityLabel="応答を生成中"
          />
        )}
        {message.status === 'partial' && (
          <Text style={[styles.statusTag, { color: colors.warning }]}>
            中断しました
          </Text>
        )}
        {message.status === 'error' && (
          <Text style={[styles.statusTag, { color: colors.error }]}>
            エラーが発生しました
          </Text>
        )}
      </View>
      {showRegenerate && onRegenerate && (
        <TouchableOpacity
          onPress={() => onRegenerate(message.id)}
          accessibilityRole="button"
          accessibilityLabel="再生成"
          testID={`regenerate-${message.id}`}
          style={styles.regenButton}
        >
          <Ionicons
            name="refresh"
            size={16}
            color={colors.primary}
          />
          <Text style={[styles.regenLabel, { color: colors.primary }]}>
            再生成
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    borderBottomLeftRadius: 4,
  },
  text: {
    ...typography.bodyMedium,
  },
  statusTag: {
    ...typography.labelSmall,
    marginTop: spacing.xs,
    fontWeight: '600',
  },
  regenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  regenLabel: {
    ...typography.labelSmall,
    fontWeight: '600',
  },
});
