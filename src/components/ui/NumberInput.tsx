import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface NumberInputProps {
  value: number | null;
  onValueChange: (value: number | null) => void;
  label?: string;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
}

export function NumberInput({
  value,
  onValueChange,
  label,
  suffix,
  step = 1,
  min = 0,
  max = 9999,
  decimals = 0,
}: NumberInputProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');

  const formatValue = (v: number | null): string =>
    v !== null ? v.toFixed(decimals) : '';

  const decrement = () => {
    const current = value ?? 0;
    const next = Math.max(min, current - step);
    onValueChange(Number(next.toFixed(decimals)));
  };

  const increment = () => {
    const current = value ?? 0;
    const next = Math.min(max, current + step);
    onValueChange(Number(next.toFixed(decimals)));
  };

  const handleFocus = () => {
    setEditing(true);
    setDraft(formatValue(value));
  };

  const handleTextChange = (text: string) => {
    // Allow empty, digits, and a single decimal point
    if (text === '' || /^\d*\.?\d*$/.test(text)) {
      setDraft(text);
    }
  };

  const handleBlur = () => {
    setEditing(false);
    if (draft === '') {
      onValueChange(null);
      return;
    }
    const num = parseFloat(draft);
    if (!isNaN(num)) {
      const clamped = Math.min(max, Math.max(min, num));
      onValueChange(Number(clamped.toFixed(decimals)));
    }
    // If parse fails, value stays unchanged
  };

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      )}
      <View style={[styles.row, { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md }]}>
        <TouchableOpacity
          onPress={decrement}
          style={[styles.button, { borderRightWidth: 1, borderRightColor: colors.border }]}
          activeOpacity={0.6}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Ionicons name="remove" size={20} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.inputWrapper}>
          <TextInput
            style={[styles.input, { color: colors.textPrimary }]}
            value={editing ? draft : formatValue(value)}
            onFocus={handleFocus}
            onChangeText={handleTextChange}
            onBlur={handleBlur}
            keyboardType="decimal-pad"
            textAlign="center"
            selectTextOnFocus
            placeholder="-"
            placeholderTextColor={colors.textTertiary}
          />
          {suffix && (
            <Text style={[styles.suffix, { color: colors.textTertiary }]}>{suffix}</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={increment}
          style={[styles.button, { borderLeftWidth: 1, borderLeftColor: colors.border }]}
          activeOpacity={0.6}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Ionicons name="add" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    ...typography.labelMedium,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    minHeight: 44,
    overflow: 'hidden',
  },
  button: {
    width: 48,
    height: 48,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  input: {
    ...typography.numberSmall,
    minWidth: 60,
    textAlign: 'center',
    padding: 0,
  },
  suffix: {
    ...typography.bodySmall,
  },
});
