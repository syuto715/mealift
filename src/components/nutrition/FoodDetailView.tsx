import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import type {
  SearchIndexDetail,
  SearchIndexNutrition,
  SearchSourceLabel,
} from '../../infra/repositories/searchIndexRepository';
import { formatNutritionValue } from '../../utils/formatNutritionValue';

// v1.5 Phase 2.3 Sprint 2.3.3 — detail view for a single search hit.
//
// Reads the v37 `nutrition_json` snapshot directly off the index
// row, so the screen works for both 八訂 foods (full 17-micronutrient
// grid) and restaurant menu items (the subset the chain discloses)
// without depending on restaurant sync (Phase 2.2 helpers still
// pending). Provenance is rendered with the same Drafting 152 badge
// the search list uses; missing micronutrient fields render as "—"
// rather than 0 so the user sees disclosure boundaries explicitly.

const SOURCE_LABEL_BADGE: Record<SearchSourceLabel, { label: string; tone: BadgeTone }> = {
  official_disclosure: { label: '公式', tone: 'success' },
  ai_estimate: { label: 'AI 推定', tone: 'warning' },
  package_label: { label: 'パッケージ', tone: 'primary' },
  manual: { label: '手動', tone: 'textTertiary' },
};

type BadgeTone = 'success' | 'warning' | 'primary' | 'textTertiary';

interface RowSpec {
  key: keyof SearchIndexNutrition;
  label: string;
  unit: string;
  decimals?: number;
}

const MACROS: RowSpec[] = [
  { key: 'caloriesPerServing', label: 'エネルギー', unit: 'kcal' },
  { key: 'proteinG', label: 'たんぱく質', unit: 'g', decimals: 1 },
  { key: 'fatG', label: '脂質', unit: 'g', decimals: 1 },
  { key: 'carbG', label: '炭水化物', unit: 'g', decimals: 1 },
];
const CARB_DETAIL: RowSpec[] = [
  { key: 'fiberG', label: '食物繊維', unit: 'g', decimals: 1 },
  { key: 'sugarG', label: '糖質', unit: 'g', decimals: 1 },
];
const LIPID_DETAIL: RowSpec[] = [
  { key: 'saturatedFatG', label: '飽和脂肪酸', unit: 'g', decimals: 1 },
  { key: 'cholesterolMg', label: 'コレステロール', unit: 'mg' },
];
const SALT: RowSpec[] = [
  { key: 'saltG', label: '食塩相当量', unit: 'g', decimals: 2 },
  { key: 'sodiumMg', label: 'ナトリウム', unit: 'mg' },
];
const VITAMINS: RowSpec[] = [
  { key: 'vitaminAUg', label: 'ビタミン A', unit: 'μg' },
  { key: 'vitaminB1Mg', label: 'ビタミン B1', unit: 'mg', decimals: 2 },
  { key: 'vitaminB2Mg', label: 'ビタミン B2', unit: 'mg', decimals: 2 },
  { key: 'vitaminB6Mg', label: 'ビタミン B6', unit: 'mg', decimals: 2 },
  { key: 'vitaminB12Ug', label: 'ビタミン B12', unit: 'μg', decimals: 1 },
  { key: 'folateUg', label: '葉酸', unit: 'μg' },
  { key: 'vitaminCMg', label: 'ビタミン C', unit: 'mg' },
  { key: 'vitaminDUg', label: 'ビタミン D', unit: 'μg', decimals: 1 },
  { key: 'vitaminEMg', label: 'ビタミン E', unit: 'mg', decimals: 1 },
];
const MINERALS: RowSpec[] = [
  { key: 'calciumMg', label: 'カルシウム', unit: 'mg' },
  { key: 'ironMg', label: '鉄', unit: 'mg', decimals: 1 },
  { key: 'magnesiumMg', label: 'マグネシウム', unit: 'mg' },
  { key: 'zincMg', label: '亜鉛', unit: 'mg', decimals: 1 },
  { key: 'potassiumMg', label: 'カリウム', unit: 'mg' },
];

interface FoodDetailViewProps {
  detail: SearchIndexDetail;
  onBack?: () => void;
}

export function FoodDetailView({ detail, onBack }: FoodDetailViewProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const badge = SOURCE_LABEL_BADGE[detail.sourceLabel] ?? SOURCE_LABEL_BADGE.manual;
  const badgeBg = colors[badge.tone] + '24';
  const badgeText = colors[badge.tone];

  const sourceUrl = detail.nutrition.sourceUrl;
  const serving = useMemo(() => {
    const sizeG = detail.nutrition.servingSizeG ?? 100;
    const unit = detail.nutrition.servingUnit ?? 'g';
    const desc = detail.nutrition.servingDescription;
    if (desc) return `${desc} (${sizeG}${unit})`;
    return `${sizeG}${unit}`;
  }, [detail.nutrition]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={8} accessibilityRole="button">
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {detail.nameJa}
          </Text>
          {detail.brand ? (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {detail.brand}
            </Text>
          ) : null}
        </View>
        <Badge label={badge.label} color={badgeBg} textColor={badgeText} size="sm" />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.card}>
          <Text style={[styles.servingLabel, { color: colors.textTertiary }]}>1 サービング</Text>
          <Text style={[styles.servingValue, { color: colors.textPrimary }]}>{serving}</Text>
        </Card>

        <NutritionSection
          title="基本（マクロ）"
          rows={MACROS}
          nutrition={detail.nutrition}
          colors={colors}
        />
        <NutritionSection
          title="炭水化物の内訳"
          rows={CARB_DETAIL}
          nutrition={detail.nutrition}
          colors={colors}
        />
        <NutritionSection
          title="脂質の内訳"
          rows={LIPID_DETAIL}
          nutrition={detail.nutrition}
          colors={colors}
        />
        <NutritionSection
          title="塩分"
          rows={SALT}
          nutrition={detail.nutrition}
          colors={colors}
        />
        <NutritionSection
          title="ビタミン"
          rows={VITAMINS}
          nutrition={detail.nutrition}
          colors={colors}
        />
        <NutritionSection
          title="ミネラル"
          rows={MINERALS}
          nutrition={detail.nutrition}
          colors={colors}
        />

        <Card style={styles.attributionCard}>
          <View style={styles.attributionHeader}>
            <Ionicons name="information-circle" size={16} color={colors.textSecondary} />
            <Text style={[styles.attributionTitle, { color: colors.textSecondary }]}>
              データソース
            </Text>
          </View>
          {detail.sourceLabel === 'ai_estimate' ? (
            <Text style={[styles.attributionBody, { color: colors.textTertiary }]}>
              * AI による推定値です。正確な値は商品ラベルをご確認ください。
            </Text>
          ) : null}
          {sourceUrl ? (
            <TouchableOpacity
              onPress={() => {
                void Linking.openURL(sourceUrl);
              }}
              accessibilityRole="link"
            >
              <Text style={[styles.attributionLink, { color: colors.primary }]} numberOfLines={1}>
                原典を見る →
              </Text>
            </TouchableOpacity>
          ) : null}
        </Card>
      </ScrollView>
    </View>
  );
}

interface NutritionSectionProps {
  title: string;
  rows: RowSpec[];
  nutrition: SearchIndexNutrition;
  colors: ReturnType<typeof getColors>;
}

function NutritionSection({ title, rows, nutrition, colors }: NutritionSectionProps) {
  return (
    <Card style={styles.card}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
      {rows.map((row, idx) => {
        const raw = nutrition[row.key] as number | null | undefined;
        const value = formatNutritionValue(raw, row.decimals);
        const isMissing = value === '—';
        return (
          <View
            key={row.key}
            style={[
              styles.dataRow,
              idx < rows.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.dataLabel, { color: colors.textSecondary }]}>{row.label}</Text>
            <Text
              style={[
                styles.dataValue,
                { color: isMissing ? colors.textTertiary : colors.textPrimary },
              ]}
            >
              {isMissing ? '—' : `${value} ${row.unit}`}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  headerText: { flex: 1, gap: spacing.xs / 2 },
  title: { ...typography.titleMedium },
  subtitle: { ...typography.bodySmall },
  scroll: { padding: spacing.md, gap: spacing.md },
  card: { padding: spacing.md, gap: spacing.sm },
  servingLabel: { ...typography.labelSmall },
  servingValue: { ...typography.titleSmall },
  sectionTitle: { ...typography.titleSmall, marginBottom: spacing.xs },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  dataLabel: { ...typography.bodyMedium },
  dataValue: { ...typography.bodyMedium, fontVariant: ['tabular-nums'], fontWeight: '600' },
  attributionCard: { padding: spacing.md, gap: spacing.xs },
  attributionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  attributionTitle: { ...typography.labelMedium },
  attributionBody: { ...typography.bodySmall },
  attributionLink: { ...typography.bodyMedium, fontWeight: '600' },
});
