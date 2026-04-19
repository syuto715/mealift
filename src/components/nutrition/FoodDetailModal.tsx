import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal as RNModal,
  TouchableOpacity,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Food, ExtendedNutrients } from '../../types/food';
import { DAILY_NUTRIENT_TARGETS } from '../../constants/dailyNutrientTargets';
import { Gender } from '../../types/common';
import { formatServingHint } from '../../constants/servingUnits';

// ---------------------------------------------------------------------------
// Nutrient groups
// ---------------------------------------------------------------------------

interface NutrientDef {
  key: keyof ExtendedNutrients;
  label: string;
  unit: string;
  /** Override decimals; default 1 */
  decimals?: number;
  isUpperLimit?: boolean;
}

const MINERALS: NutrientDef[] = [
  { key: 'calciumMg', label: 'カルシウム', unit: 'mg', decimals: 0 },
  { key: 'ironMg', label: '鉄', unit: 'mg', decimals: 1 },
  { key: 'magnesiumMg', label: 'マグネシウム', unit: 'mg', decimals: 0 },
  { key: 'zincMg', label: '亜鉛', unit: 'mg', decimals: 1 },
  { key: 'potassiumMg', label: 'カリウム', unit: 'mg', decimals: 0 },
  { key: 'sodiumMg', label: 'ナトリウム', unit: 'mg', decimals: 0 },
];

const VITAMINS: NutrientDef[] = [
  { key: 'vitaminAUg', label: 'ビタミンA', unit: 'μg', decimals: 0 },
  { key: 'vitaminDUg', label: 'ビタミンD', unit: 'μg', decimals: 1 },
  { key: 'vitaminEMg', label: 'ビタミンE', unit: 'mg', decimals: 1 },
  { key: 'vitaminB1Mg', label: 'ビタミンB1', unit: 'mg', decimals: 2 },
  { key: 'vitaminB2Mg', label: 'ビタミンB2', unit: 'mg', decimals: 2 },
  { key: 'vitaminB6Mg', label: 'ビタミンB6', unit: 'mg', decimals: 2 },
  { key: 'vitaminB12Ug', label: 'ビタミンB12', unit: 'μg', decimals: 1 },
  { key: 'folateUg', label: '葉酸', unit: 'μg', decimals: 0 },
  { key: 'vitaminCMg', label: 'ビタミンC', unit: 'mg', decimals: 0 },
];

const OTHERS: NutrientDef[] = [
  { key: 'fiberG', label: '食物繊維', unit: 'g', decimals: 1 },
  { key: 'saltG', label: '食塩相当量', unit: 'g', decimals: 1, isUpperLimit: true },
  { key: 'saturatedFatG', label: '飽和脂肪酸', unit: 'g', decimals: 1, isUpperLimit: true },
  { key: 'sugarG', label: '糖質', unit: 'g', decimals: 1 },
  { key: 'cholesterolMg', label: 'コレステロール', unit: 'mg', decimals: 0, isUpperLimit: true },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FoodDetailModalProps {
  visible: boolean;
  onClose: () => void;
  food: Food | null;
  gender?: Gender;
  /** Called when user taps "この食品を追加" */
  onAdd?: (food: Food) => void;
}

type DisplayMode = 'serving' | '100g';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(v: number | null, decimals: number): string {
  if (v == null) return '—';
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(v * factor) / factor;
  return decimals === 0 ? String(Math.round(rounded)) : rounded.toFixed(decimals);
}

function computeRatio(
  intake: number | null,
  def: NutrientDef,
  gender: Gender,
): number | null {
  if (intake == null) return null;
  const target = DAILY_NUTRIENT_TARGETS[def.key];
  if (!target) return null;
  const base = gender === 'female' ? target.female : target.male;
  if (base <= 0) return null;
  return intake / base;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FoodDetailModal({
  visible,
  onClose,
  food,
  gender = 'male',
  onAdd,
}: FoodDetailModalProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const [mode, setMode] = useState<DisplayMode>('serving');
  const [mineralsOpen, setMineralsOpen] = useState(true);
  const [vitaminsOpen, setVitaminsOpen] = useState(true);
  const [othersOpen, setOthersOpen] = useState(true);

  const scale = useMemo(() => {
    if (!food) return 1;
    if (mode === '100g') {
      return 100 / food.servingSizeG;
    }
    return 1;
  }, [food, mode]);

  const scaleVal = (v: number | null): number | null =>
    v == null ? null : v * scale;

  if (!food) return null;

  const servingLabel = formatServingHint(
    food.servingUnit,
    food.servingSizeG,
    Math.round(food.caloriesPerServing * scale),
  );

  const pfc = {
    calories: Math.round(food.caloriesPerServing * scale),
    proteinG: Math.round(food.proteinG * scale * 10) / 10,
    fatG: Math.round(food.fatG * scale * 10) / 10,
    carbG: Math.round(food.carbG * scale * 10) / 10,
  };

  const renderSection = (
    title: string,
    defs: NutrientDef[],
    open: boolean,
    onToggle: () => void,
  ) => {
    const rows = defs.filter((d) => food[d.key] != null);
    if (rows.length === 0) return null;
    return (
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={onToggle}
          activeOpacity={0.7}
        >
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            {title}
          </Text>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
        {open && (
          <View style={styles.sectionBody}>
            {rows.map((def) => {
              const scaled = scaleVal(food[def.key]);
              const ratio = computeRatio(scaled, def, gender);
              const pct = ratio != null ? Math.min(ratio, 1.5) : null;
              const hasTarget = ratio != null;
              let barColor: string = colors.primary;
              if (ratio != null) {
                if (def.isUpperLimit) {
                  barColor = ratio > 1 ? colors.error : colors.success;
                } else if (ratio >= 0.8 && ratio <= 1.2) {
                  barColor = colors.success;
                } else if (ratio > 1.2) {
                  barColor = colors.warning;
                } else {
                  barColor = colors.primary;
                }
              }
              return (
                <View key={def.key} style={styles.row}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>
                      {def.label}
                    </Text>
                    <View style={styles.rowValues}>
                      <Text
                        style={[styles.rowValue, { color: colors.textPrimary }]}
                      >
                        {formatValue(scaled, def.decimals ?? 1)}
                        {def.unit}
                      </Text>
                      {hasTarget && (
                        <Text
                          style={[styles.rowPct, { color: colors.textTertiary }]}
                        >
                          {Math.round((ratio ?? 0) * 100)}%
                        </Text>
                      )}
                    </View>
                  </View>
                  {hasTarget && (
                    <View
                      style={[
                        styles.barTrack,
                        { backgroundColor: colors.surfaceSecondary },
                      ]}
                    >
                      <View
                        style={[
                          styles.barFill,
                          {
                            width: `${((pct ?? 0) / 1.5) * 100}%`,
                            backgroundColor: barColor,
                          },
                        ]}
                      />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text
            style={[styles.headerTitle, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {food.nameJa}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Mode toggle */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[
              styles.modeTab,
              {
                backgroundColor:
                  mode === 'serving' ? colors.primary : colors.surface,
                borderColor: colors.border,
              },
            ]}
            onPress={() => setMode('serving')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.modeTabText,
                { color: mode === 'serving' ? '#FFFFFF' : colors.textPrimary },
              ]}
            >
              1食あたり
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeTab,
              {
                backgroundColor:
                  mode === '100g' ? colors.primary : colors.surface,
                borderColor: colors.border,
              },
            ]}
            onPress={() => setMode('100g')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.modeTabText,
                { color: mode === '100g' ? '#FFFFFF' : colors.textPrimary },
              ]}
            >
              100gあたり
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.servingHint, { color: colors.textSecondary }]}>
          {mode === '100g' ? `100g / ${pfc.calories}kcal` : servingLabel}
        </Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* PFC summary */}
          <View
            style={[
              styles.pfcCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.pfcKcalRow}>
              <Text style={[styles.pfcKcal, { color: colors.calorie }]}>
                {pfc.calories}
              </Text>
              <Text style={[styles.pfcKcalUnit, { color: colors.textSecondary }]}>
                kcal
              </Text>
            </View>
            <View style={styles.pfcRow}>
              <View style={styles.pfcItem}>
                <Text style={[styles.pfcValue, { color: colors.protein }]}>
                  {pfc.proteinG}g
                </Text>
                <Text style={[styles.pfcLabel, { color: colors.textTertiary }]}>
                  たんぱく質
                </Text>
              </View>
              <View style={styles.pfcItem}>
                <Text style={[styles.pfcValue, { color: colors.fat }]}>
                  {pfc.fatG}g
                </Text>
                <Text style={[styles.pfcLabel, { color: colors.textTertiary }]}>
                  脂質
                </Text>
              </View>
              <View style={styles.pfcItem}>
                <Text style={[styles.pfcValue, { color: colors.carb }]}>
                  {pfc.carbG}g
                </Text>
                <Text style={[styles.pfcLabel, { color: colors.textTertiary }]}>
                  炭水化物
                </Text>
              </View>
            </View>
          </View>

          {renderSection('ミネラル', MINERALS, mineralsOpen, () =>
            setMineralsOpen((p) => !p),
          )}
          {renderSection('ビタミン', VITAMINS, vitaminsOpen, () =>
            setVitaminsOpen((p) => !p),
          )}
          {renderSection('その他', OTHERS, othersOpen, () =>
            setOthersOpen((p) => !p),
          )}

          <Text style={[styles.footnote, { color: colors.textTertiary }]}>
            ％は日本人の食事摂取基準（2020年版）の推奨量/目安量に対する割合（
            {gender === 'female' ? '成人女性' : '成人男性'}）。
            「—」は未測定データです。
          </Text>
        </ScrollView>

        {onAdd && (
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[
                styles.addButton,
                { backgroundColor: colors.primary, borderRadius: radius.md },
              ]}
              onPress={() => onAdd(food)}
              activeOpacity={0.8}
            >
              <Text style={styles.addButtonText}>この食品を追加</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </RNModal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    gap: spacing.md,
  },
  headerTitle: {
    ...typography.titleMedium,
    flex: 1,
  },
  modeRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  modeTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  modeTabText: {
    ...typography.labelLarge,
  },
  servingHint: {
    ...typography.bodySmall,
    textAlign: 'center',
    paddingTop: spacing.xs,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxxl,
    gap: spacing.lg,
  },
  pfcCard: {
    borderRadius: radius.md,
    borderWidth: 0.5,
    padding: spacing.lg,
    gap: spacing.md,
  },
  pfcKcalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  pfcKcal: {
    fontSize: 36,
    fontWeight: '700',
  },
  pfcKcalUnit: {
    ...typography.bodyLarge,
  },
  pfcRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  pfcItem: {
    alignItems: 'center',
    gap: 2,
  },
  pfcValue: {
    ...typography.labelLarge,
    fontSize: 16,
    fontWeight: '700',
  },
  pfcLabel: {
    ...typography.labelSmall,
  },
  section: {
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  sectionTitle: {
    ...typography.titleSmall,
  },
  sectionBody: {
    gap: spacing.sm,
  },
  row: {
    gap: 4,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  rowLabel: {
    ...typography.bodyMedium,
  },
  rowValues: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  rowValue: {
    ...typography.labelLarge,
    fontVariant: ['tabular-nums'],
  },
  rowPct: {
    ...typography.labelSmall,
    minWidth: 40,
    textAlign: 'right',
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  footnote: {
    ...typography.bodySmall,
    lineHeight: 18,
    marginTop: spacing.md,
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxxl,
    borderTopWidth: 0.5,
  },
  addButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    ...typography.labelLarge,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
