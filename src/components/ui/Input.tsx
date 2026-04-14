import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  useColorScheme,
  TextInputProps,
  TouchableOpacity,
} from 'react-native';
import { getColors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  suffix?: string;
  rightIcon?: React.ReactNode;
}

export function Input({ label, error, suffix, rightIcon, multiline, numberOfLines, ...props }: InputProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const [focused, setFocused] = useState(false);

  const isMultiline = multiline === true;
  const lineCount = numberOfLines ?? (isMultiline ? 3 : undefined);
  const inputHeight = isMultiline ? Math.max(48, (lineCount ?? 3) * 22 + spacing.lg) : 48;

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      )}
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.surfaceSecondary,
            borderColor: error
              ? colors.error
              : focused
                ? colors.primary
                : 'transparent',
            height: isMultiline ? undefined : inputHeight,
            minHeight: isMultiline ? inputHeight : undefined,
          },
          isMultiline && styles.inputContainerMultiline,
        ]}
      >
        <TextInput
          style={[
            styles.input,
            { color: colors.textPrimary },
            isMultiline && styles.inputMultiline,
          ]}
          placeholderTextColor={colors.textTertiary}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline={multiline}
          numberOfLines={lineCount}
          textAlignVertical={isMultiline ? 'top' : 'center'}
          {...props}
        />
        {suffix && (
          <Text style={[styles.suffix, { color: colors.textSecondary }]}>{suffix}</Text>
        )}
        {rightIcon && (
          <View style={styles.rightIcon}>{rightIcon}</View>
        )}
      </View>
      {error && (
        <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    ...typography.labelMedium,
    marginBottom: spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
  },
  inputContainerMultiline: {
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
  },
  input: {
    flex: 1,
    ...typography.bodyLarge,
    padding: 0,
  },
  inputMultiline: {
    ...typography.bodyMedium,
    lineHeight: 22,
  },
  suffix: {
    ...typography.bodyMedium,
    marginLeft: spacing.sm,
  },
  rightIcon: {
    marginLeft: spacing.sm,
  },
  error: {
    ...typography.bodySmall,
    marginTop: spacing.xs,
  },
});
