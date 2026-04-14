import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ProgressBar } from '../ui/ProgressBar';
import { spacing } from '../../theme/spacing';
import { ThemeColors } from '../../theme/tokens';

interface MacroRingsProps {
  proteinCurrent: number;
  proteinTarget: number;
  fatCurrent: number;
  fatTarget: number;
  carbCurrent: number;
  carbTarget: number;
  colors: ThemeColors;
}

export function MacroRings({
  proteinCurrent,
  proteinTarget,
  fatCurrent,
  fatTarget,
  carbCurrent,
  carbTarget,
  colors,
}: MacroRingsProps) {
  return (
    <View style={styles.container}>
      <ProgressBar
        progress={proteinTarget > 0 ? proteinCurrent / proteinTarget : 0}
        color={colors.protein}
        label="タンパク質"
        valueText={`${Math.round(proteinCurrent)} / ${proteinTarget} g`}
        height={8}
      />
      <ProgressBar
        progress={fatTarget > 0 ? fatCurrent / fatTarget : 0}
        color={colors.fat}
        label="脂質"
        valueText={`${Math.round(fatCurrent)} / ${fatTarget} g`}
        height={8}
      />
      <ProgressBar
        progress={carbTarget > 0 ? carbCurrent / carbTarget : 0}
        color={colors.carb}
        label="炭水化物"
        valueText={`${Math.round(carbCurrent)} / ${carbTarget} g`}
        height={8}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
});
