import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card } from '../../../src/components/ui';
import { getDatabase } from '../../../src/infra/database/connection';
import { getSubmissionById } from '../../../src/infra/repositories/userSubmittedFoodRepository';
import type {
  UserSubmittedFood,
  SubmissionStatus,
  FoodCategory,
  FoodSourceType,
} from '../../../src/types/userSubmittedFood';

// Read-only detail view of a single submission. No edit / delete in
// this Part — those are explicit future work. Renders every field
// the form captures, grouped the same way for visual continuity.

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  local: '下書き',
  pending_review: '審査中',
  approved: '公開中',
  rejected: '却下',
};

const CATEGORY_LABELS: Record<FoodCategory, string> = {
  home_cooking: '家庭料理',
  restaurant: '外食',
  convenience_store: 'コンビニ商品',
  packaged_food: 'パッケージ商品',
  beverage: '飲料',
  supplement: 'サプリメント',
  other: 'その他',
};

const SOURCE_LABELS: Record<FoodSourceType, string> = {
  package_label: 'パッケージ',
  menu_board: 'メニュー表示',
  official_site: '公式サイト',
  estimation: '推定',
  other: 'その他',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface FieldRowProps {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  colors: ReturnType<typeof getColors>;
}

function FieldRow({ label, value, unit, colors }: FieldRowProps) {
  const display = value == null || value === '' ? '—' : `${value}${unit ?? ''}`;
  return (
    <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text style={[styles.fieldValue, { color: colors.textPrimary }]}>
        {display}
      </Text>
    </View>
  );
}

export default function MySubmissionDetailScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id;

  const [row, setRow] = useState<UserSubmittedFood | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!id) {
          setError('IDが指定されていません');
          return;
        }
        const db = await getDatabase();
        const result = await getSubmissionById(db, id);
        if (cancelled) return;
        if (!result) {
          setError('投稿が見つかりませんでした');
          return;
        }
        setRow(result);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : '読み込みに失敗しました',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          投稿の詳細
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {error && (
          <Text style={[styles.errorText, { color: colors.error }]}>
            {error}
          </Text>
        )}

        {row && (
          <>
            <Card style={styles.card}>
              <Text
                style={[styles.titleName, { color: colors.textPrimary }]}
              >
                {row.nameJa}
              </Text>
              <View style={styles.metaRow}>
                <Text
                  style={[styles.metaText, { color: colors.textSecondary }]}
                >
                  {CATEGORY_LABELS[row.foodCategory]}
                </Text>
                <Text
                  style={[styles.metaDot, { color: colors.textTertiary }]}
                >
                  ・
                </Text>
                <Text
                  style={[styles.metaText, { color: colors.textSecondary }]}
                >
                  {STATUS_LABELS[row.submissionStatus]}
                </Text>
              </View>
              {row.rejectionReason && (
                <View
                  style={[
                    styles.rejectBox,
                    {
                      backgroundColor: colors.error + '14',
                      borderColor: colors.error + '44',
                    },
                  ]}
                >
                  <Text
                    style={[styles.rejectLabel, { color: colors.error }]}
                  >
                    却下理由
                  </Text>
                  <Text
                    style={[
                      styles.rejectBody,
                      { color: colors.textPrimary },
                    ]}
                  >
                    {row.rejectionReason}
                  </Text>
                </View>
              )}
            </Card>

            <Card style={styles.card}>
              <Text
                style={[styles.sectionTitle, { color: colors.textPrimary }]}
              >
                基本情報
              </Text>
              <FieldRow
                label="ブランド"
                value={row.brand}
                colors={colors}
              />
              <FieldRow
                label="バーコード"
                value={row.barcode}
                colors={colors}
              />
              <FieldRow
                label="情報源"
                value={SOURCE_LABELS[row.sourceType]}
                colors={colors}
              />
              <FieldRow
                label="1食分"
                value={row.servingSizeG}
                unit={` ${row.servingUnit}`}
                colors={colors}
              />
            </Card>

            <Card style={styles.card}>
              <Text
                style={[styles.sectionTitle, { color: colors.textPrimary }]}
              >
                栄養成分（1食分）
              </Text>
              <FieldRow
                label="カロリー"
                value={row.caloriesPerServing}
                unit=" kcal"
                colors={colors}
              />
              <FieldRow
                label="タンパク質"
                value={row.proteinG}
                unit=" g"
                colors={colors}
              />
              <FieldRow
                label="脂質"
                value={row.fatG}
                unit=" g"
                colors={colors}
              />
              <FieldRow
                label="炭水化物"
                value={row.carbG}
                unit=" g"
                colors={colors}
              />
            </Card>

            <Card style={styles.card}>
              <Text
                style={[styles.sectionTitle, { color: colors.textPrimary }]}
              >
                詳細栄養素
              </Text>
              <FieldRow label="食塩相当量" value={row.saltG} unit=" g" colors={colors} />
              <FieldRow label="ナトリウム" value={row.sodiumMg} unit=" mg" colors={colors} />
              <FieldRow label="食物繊維" value={row.fiberG} unit=" g" colors={colors} />
              <FieldRow label="糖質" value={row.sugarG} unit=" g" colors={colors} />
              <FieldRow label="飽和脂肪酸" value={row.saturatedFatG} unit=" g" colors={colors} />
              <FieldRow label="コレステロール" value={row.cholesterolMg} unit=" mg" colors={colors} />
              <FieldRow label="カルシウム" value={row.calciumMg} unit=" mg" colors={colors} />
              <FieldRow label="鉄分" value={row.ironMg} unit=" mg" colors={colors} />
              <FieldRow label="ビタミンA" value={row.vitaminAUg} unit=" μg" colors={colors} />
              <FieldRow label="ビタミンB1" value={row.vitaminB1Mg} unit=" mg" colors={colors} />
              <FieldRow label="ビタミンB2" value={row.vitaminB2Mg} unit=" mg" colors={colors} />
              <FieldRow label="ビタミンC" value={row.vitaminCMg} unit=" mg" colors={colors} />
              <FieldRow label="ビタミンD" value={row.vitaminDUg} unit=" μg" colors={colors} />
              <FieldRow label="ビタミンE" value={row.vitaminEMg} unit=" mg" colors={colors} />
              <FieldRow label="カリウム" value={row.potassiumMg} unit=" mg" colors={colors} />
              <FieldRow label="マグネシウム" value={row.magnesiumMg} unit=" mg" colors={colors} />
              <FieldRow label="亜鉛" value={row.zincMg} unit=" mg" colors={colors} />
            </Card>

            {row.notes && (
              <Card style={styles.card}>
                <Text
                  style={[styles.sectionTitle, { color: colors.textPrimary }]}
                >
                  メモ
                </Text>
                <Text
                  style={[styles.notes, { color: colors.textPrimary }]}
                >
                  {row.notes}
                </Text>
              </Card>
            )}

            <Card style={styles.card}>
              <Text
                style={[styles.sectionTitle, { color: colors.textPrimary }]}
              >
                履歴
              </Text>
              <FieldRow
                label="投稿日時"
                value={formatDateTime(row.createdAt)}
                colors={colors}
              />
              <FieldRow
                label="更新日時"
                value={formatDateTime(row.updatedAt)}
                colors={colors}
              />
              {row.syncedAt && (
                <FieldRow
                  label="同期日時"
                  value={formatDateTime(row.syncedAt)}
                  colors={colors}
                />
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: { ...typography.titleMedium },
  scroll: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxxl,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorText: {
    ...typography.bodySmall,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  card: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  titleName: { ...typography.titleLarge, marginBottom: spacing.xs },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: { ...typography.bodySmall },
  metaDot: { ...typography.bodySmall, paddingHorizontal: 4 },
  rejectBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  rejectLabel: { ...typography.labelMedium },
  rejectBody: { ...typography.bodySmall },
  sectionTitle: {
    ...typography.titleSmall,
    marginBottom: spacing.xs,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldLabel: { ...typography.bodySmall, flex: 1 },
  fieldValue: { ...typography.bodyMedium, textAlign: 'right' },
  notes: { ...typography.bodyMedium, lineHeight: 22 },
});
