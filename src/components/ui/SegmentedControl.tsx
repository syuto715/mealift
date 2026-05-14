import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { getColors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

// v1.4 ステージ 4 Turn 1 / Codex pass 1 Nit fix — segments を
// ReadonlyArray に変えて caller 側の `as const` literal narrow を
// preserve (caller の `as unknown as` double-cast を解消)。
// component 内部では `segments.map(...)` のみ、 mutate しないので
// runtime safety OK.
interface SegmentedControlProps {
  segments: ReadonlyArray<{ label: string; value: string }>;
  selectedValue: string;
  onValueChange: (value: string) => void;
  scrollable?: boolean;
}

export function SegmentedControl({
  segments,
  selectedValue,
  onValueChange,
  scrollable = false,
}: SegmentedControlProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const content = segments.map((segment) => {
    const isSelected = segment.value === selectedValue;
    return (
      <TouchableOpacity
        key={segment.value}
        style={[
          scrollable ? styles.scrollSegment : styles.segment,
          isSelected && { backgroundColor: colors.surface },
        ]}
        onPress={() => onValueChange(segment.value)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.label,
            { color: isSelected ? colors.primary : colors.textSecondary },
          ]}
          numberOfLines={1}
        >
          {segment.label}
        </Text>
      </TouchableOpacity>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContainer,
          { backgroundColor: colors.surfaceSecondary },
        ]}
        style={styles.scrollWrapper}
      >
        {content}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceSecondary }]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 2,
  },
  scrollWrapper: {
    flexGrow: 0,
  },
  scrollContainer: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  scrollSegment: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  label: {
    ...typography.labelMedium,
  },
});
