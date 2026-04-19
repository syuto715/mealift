import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Card } from '../ui/Card';

interface Props {
  totalMl: number;
  targetMl: number;
  onAdd: (ml: number) => void | Promise<void>;
  onPress?: () => void;
}

const CUP_ML = 250;
const CUP_COUNT = 8;

export function WaterTrackerCard({ totalMl, targetMl, onAdd, onPress }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const filledCups = Math.min(CUP_COUNT, Math.round(totalMl / CUP_ML));

  return (
    <TouchableOpacity activeOpacity={onPress ? 0.7 : 1} onPress={onPress}>
      <Card>
        <View style={styles.row}>
          <View style={styles.left}>
            <Ionicons name="water" size={22} color={colors.primary} />
            <Text style={[styles.label, { color: colors.textPrimary }]}>水分</Text>
          </View>
          <Text style={[styles.total, { color: colors.textPrimary }]}>
            {totalMl.toLocaleString()} / {targetMl.toLocaleString()} ml
          </Text>
        </View>
        <View style={styles.cupsRow}>
          {Array.from({ length: CUP_COUNT }).map((_, i) => (
            <Ionicons
              key={i}
              name={i < filledCups ? 'water' : 'water-outline'}
              size={22}
              color={i < filledCups ? colors.primary : colors.textTertiary}
            />
          ))}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary + '15' }]}
            onPress={(e) => {
              e.stopPropagation();
              onAdd(250);
            }}
          >
            <Text style={[styles.btnText, { color: colors.primary }]}>+250ml</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary + '15' }]}
            onPress={(e) => {
              e.stopPropagation();
              onAdd(500);
            }}
          >
            <Text style={[styles.btnText, { color: colors.primary }]}>+500ml</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.titleSmall },
  total: { ...typography.numberSmall, fontSize: 16 },
  cupsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  actions: { flexDirection: 'row', gap: spacing.md },
  btn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: 8,
  },
  btnText: { ...typography.labelLarge },
});
