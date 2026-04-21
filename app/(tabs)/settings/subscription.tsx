import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  Alert,
  Modal as RNModal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getColors, radius, shadow } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card, Badge, Button, SegmentedControl } from '../../../src/components/ui';
import { useSubscription } from '../../../src/hooks/useSubscription';
import {
  PRICING,
  TRIAL_DURATION_DAYS,
  priceFor,
  monthlyEquivalent,
  type BillingCycle,
  type PaidTier,
} from '../../../src/constants/pricing';

// ---------------------------------------------------------------------------
// Billing cycle config
// ---------------------------------------------------------------------------

const CYCLE_SEGMENTS: { label: string; value: BillingCycle }[] = [
  { label: '月額', value: 'monthly' },
  { label: '半年', value: 'biannual' },
  { label: '年額', value: 'annual' },
];

const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: '月額',
  biannual: '半年',
  annual: '年額',
};

const CYCLE_PERIOD: Record<BillingCycle, string> = {
  monthly: '/月',
  biannual: '/半年',
  annual: '/年',
};

// Compute "% OFF vs monthly" for the non-monthly cycles.
function computeSavings(tier: PaidTier, cycle: BillingCycle): number {
  if (cycle === 'monthly') return 0;
  const monthlyPerMonth = PRICING[tier].monthly;
  const effectivePerMonth = monthlyEquivalent(tier, cycle);
  return Math.round((1 - effectivePerMonth / monthlyPerMonth) * 100);
}

// ---------------------------------------------------------------------------
// Feature comparison rows
// ---------------------------------------------------------------------------

type CellValue = true | false | string;

interface FeatureRow {
  label: string;
  free: CellValue;
  plus: CellValue;
  pro: CellValue;
}

interface FeatureGroup {
  title: string;
  rows: FeatureRow[];
}

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: '基本機能',
    rows: [
      { label: '食事・体重・トレーニング記録', free: true, plus: true, pro: true },
      { label: '食品検索（八訂 2,500品）', free: true, plus: true, pro: true },
      { label: '通知リマインダー', free: true, plus: true, pro: true },
    ],
  },
  {
    title: '履歴・写真',
    rows: [
      { label: '履歴保存期間', free: '30日', plus: '無制限', pro: '無制限' },
      { label: '進捗写真', free: '3枚', plus: '無制限', pro: '無制限' },
    ],
  },
  {
    title: '栄養分析',
    rows: [
      { label: '栄養素24項目表示', free: false, plus: true, pro: true },
      { label: '食事別の栄養バランス', free: false, plus: true, pro: true },
      { label: '適応型目標調整', free: false, plus: true, pro: true },
      { label: '週次レポート完全版', free: false, plus: true, pro: true },
    ],
  },
  {
    title: 'トレーニング機能',
    rows: [
      { label: 'ワークアウト自動提案', free: false, plus: true, pro: true },
      { label: 'カスタム種目登録', free: false, plus: true, pro: true },
      { label: 'PR 全種別・履歴', free: false, plus: true, pro: true },
      { label: 'バーコードスキャン', free: false, plus: true, pro: true },
      { label: 'シェア画像生成', free: false, plus: true, pro: true },
    ],
  },
  {
    title: 'Pro 限定',
    rows: [
      { label: 'AI 栄養推定 (Gemini)', free: false, plus: false, pro: true },
      { label: 'AI 食事アドバイス', free: false, plus: false, pro: true },
      { label: 'HealthKit / Health Connect 連携', free: false, plus: false, pro: true },
      { label: 'CSV エクスポート', free: false, plus: false, pro: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// Plan card data
// ---------------------------------------------------------------------------

const FREE_FEATURES = [
  '食事・体重・トレーニング記録',
  '食品検索（八訂 2,500品）',
  '通知リマインダー',
  '履歴30日、進捗写真3枚まで',
];

const PLUS_FEATURES = [
  'すべての記録を無制限',
  '栄養素24項目表示',
  '適応型目標調整',
  '進捗写真無制限',
  'ワークアウト自動提案',
  'カスタム種目登録・PR履歴',
  '週次レポート完全版',
  'バーコードスキャン',
  'シェア画像生成',
];

const PRO_FEATURES = [
  'Plus のすべての機能',
  'AI 栄養推定 (Gemini)',
  'HealthKit / Health Connect 連携',
  'CSV エクスポート',
  'AI コーチング（近日実装）',
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SubscriptionScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const sub = useSubscription();
  const [cycle, setCycle] = useState<BillingCycle>('annual');
  const [compareOpen, setCompareOpen] = useState(false);

  // Status sub-line beneath screen title
  const statusLine = useMemo(() => {
    if (sub.isTrial && sub.trialEndsAt) {
      const days = sub.trialDaysRemaining ?? 0;
      const endFmt = format(new Date(sub.trialEndsAt), 'yyyy/MM/dd');
      return `Plusトライアル中 あと${days}日（${endFmt}まで）`;
    }
    if (sub.isPaid && sub.planExpiresAt) {
      const expFmt = format(new Date(sub.planExpiresAt), 'yyyy/MM/dd');
      const cycleLabel = sub.billingCycle ? CYCLE_LABEL[sub.billingCycle] : null;
      return cycleLabel
        ? `${cycleLabel}プラン 次回更新 ${expFmt}`
        : `次回更新 ${expFmt}`;
    }
    if (sub.isFree) return 'Free プランを利用中';
    return null;
  }, [sub]);

  const handlePurchase = (tier: PaidTier) => {
    const tierLabel = tier === 'plus' ? 'Plus' : 'Pro';
    const price = priceFor(tier, cycle);
    Alert.alert(
      `${tierLabel} ${CYCLE_LABEL[cycle]}プラン`,
      `¥${price.toLocaleString()} での購入フローは近日公開です。`,
      [{ text: 'OK' }],
    );
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            プラン
          </Text>
          {statusLine && (
            <Text
              style={[styles.statusLine, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {statusLine}
            </Text>
          )}
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Billing cycle tabs */}
        <View style={styles.cycleWrap}>
          <SegmentedControl
            segments={CYCLE_SEGMENTS}
            selectedValue={cycle}
            onValueChange={(v) => setCycle(v as BillingCycle)}
          />
        </View>

        {/* Free card */}
        <PlanCard
          tier="free"
          current={sub.isFree}
          title="Free"
          subtitle="基本機能のみ"
          priceText="¥0"
          periodText="/月"
          features={FREE_FEATURES}
          accent={colors.textSecondary}
          badgeText={null}
        />

        {/* Plus card */}
        <PlanCard
          tier="plus"
          current={sub.isPlus}
          disabledUpgrade={sub.isPro}
          title="Plus"
          subtitle="全ての記録機能とレポート"
          priceText={`¥${priceFor('plus', cycle).toLocaleString()}`}
          periodText={CYCLE_PERIOD[cycle]}
          monthlyEquivText={
            cycle !== 'monthly'
              ? `月あたり ¥${monthlyEquivalent('plus', cycle).toLocaleString()} / ${computeSavings('plus', cycle)}% OFF`
              : null
          }
          features={PLUS_FEATURES}
          accent={colors.primary}
          badgeText="おすすめ"
          ctaLabel={
            sub.isPlus
              ? '現在のプラン'
              : sub.isPro
                ? 'Plus にダウングレード不可'
                : sub.isTrial
                  ? `Plus を継続（${CYCLE_LABEL[cycle]}）`
                  : `${TRIAL_DURATION_DAYS}日間無料で試す`
          }
          onPress={() => handlePurchase('plus')}
        />

        {/* Pro card */}
        <PlanCard
          tier="pro"
          current={sub.isPro}
          title="Pro"
          subtitle="AI と外部連携を追加"
          priceText={`¥${priceFor('pro', cycle).toLocaleString()}`}
          periodText={CYCLE_PERIOD[cycle]}
          monthlyEquivText={
            cycle !== 'monthly'
              ? `月あたり ¥${monthlyEquivalent('pro', cycle).toLocaleString()} / ${computeSavings('pro', cycle)}% OFF`
              : null
          }
          features={PRO_FEATURES}
          accent={colors.accent}
          badgeText={null}
          ctaLabel={sub.isPro ? '現在のプラン' : 'Pro にアップグレード'}
          onPress={() => handlePurchase('pro')}
        />

        {/* Comparison opener */}
        <TouchableOpacity
          style={[styles.compareButton, { borderColor: colors.border }]}
          onPress={() => setCompareOpen(true)}
          activeOpacity={0.7}
        >
          <Ionicons
            name="list-outline"
            size={18}
            color={colors.textPrimary}
          />
          <Text style={[styles.compareButtonText, { color: colors.textPrimary }]}>
            機能を詳しく比較する
          </Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.textTertiary}
          />
        </TouchableOpacity>

        {/* Legal / note */}
        <Text style={[styles.legalNote, { color: colors.textTertiary }]}>
          サブスクリプションは自動更新されます。更新日の24時間前までにキャンセルしない限り、同じ期間で自動更新されます。
          解約はストアのアカウント設定から行えます。
        </Text>

        <View style={{ height: spacing.xxxxl }} />
      </ScrollView>

      {/* Comparison modal */}
      <RNModal
        visible={compareOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCompareOpen(false)}
      >
        <SafeAreaView
          style={[styles.compareSheet, { backgroundColor: colors.background }]}
          edges={['top', 'bottom']}
        >
          <View
            style={[
              styles.compareSheetHeader,
              { borderBottomColor: colors.border },
            ]}
          >
            <Text style={[styles.compareSheetTitle, { color: colors.textPrimary }]}>
              機能比較
            </Text>
            <TouchableOpacity
              onPress={() => setCompareOpen(false)}
              style={styles.compareSheetClose}
              hitSlop={8}
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.compareModalScroll}
            contentContainerStyle={styles.compareModalContent}
            showsVerticalScrollIndicator={true}
          >
          {/* Column header */}
          <View
            style={[
              styles.compareHeader,
              { borderBottomColor: colors.border },
            ]}
          >
            <Text
              style={[
                styles.compareCol,
                styles.compareLabelCol,
                { color: colors.textSecondary },
              ]}
            >
              機能
            </Text>
            <Text
              style={[
                styles.compareCol,
                styles.comparePlanCol,
                { color: colors.textSecondary },
              ]}
            >
              Free
            </Text>
            <Text
              style={[
                styles.compareCol,
                styles.comparePlanCol,
                { color: colors.primary, fontWeight: '700' },
              ]}
            >
              Plus
            </Text>
            <Text
              style={[
                styles.compareCol,
                styles.comparePlanCol,
                { color: colors.accent, fontWeight: '700' },
              ]}
            >
              Pro
            </Text>
          </View>

          {FEATURE_GROUPS.map((group) => (
            <View key={group.title} style={styles.compareGroup}>
              <Text
                style={[
                  styles.compareGroupTitle,
                  { color: colors.textSecondary },
                ]}
              >
                {group.title}
              </Text>
              {group.rows.map((row) => (
                <View
                  key={row.label}
                  style={[
                    styles.compareRow,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.compareCol,
                      styles.compareLabelCol,
                      { color: colors.textPrimary },
                    ]}
                    numberOfLines={2}
                  >
                    {row.label}
                  </Text>
                  <CompareCell value={row.free} colors={colors} />
                  <CompareCell value={row.plus} colors={colors} />
                  <CompareCell value={row.pro} colors={colors} />
                </View>
              ))}
            </View>
          ))}
          </ScrollView>
        </SafeAreaView>
      </RNModal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// PlanCard subcomponent
// ---------------------------------------------------------------------------

interface PlanCardProps {
  tier: 'free' | 'plus' | 'pro';
  current: boolean;
  disabledUpgrade?: boolean;
  title: string;
  subtitle: string;
  priceText: string;
  periodText: string;
  monthlyEquivText?: string | null;
  features: string[];
  accent: string;
  badgeText: string | null;
  ctaLabel?: string;
  onPress?: () => void;
}

function PlanCard({
  tier,
  current,
  disabledUpgrade = false,
  title,
  subtitle,
  priceText,
  periodText,
  monthlyEquivText,
  features,
  accent,
  badgeText,
  ctaLabel,
  onPress,
}: PlanCardProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const borderColor = current ? accent : colors.border;
  const borderWidth = current ? 2 : 1;

  return (
    <View
      style={[
        styles.planCard,
        { backgroundColor: colors.surface, borderColor, borderWidth },
        shadow.sm,
      ]}
    >
      {/* Recommended ribbon */}
      {badgeText && !current && (
        <View style={[styles.ribbon, { backgroundColor: accent }]}>
          <Text style={styles.ribbonText}>{badgeText}</Text>
        </View>
      )}

      {/* Current-plan badge */}
      {current && (
        <View style={styles.currentBadgeWrap}>
          <Badge
            label="現在のプラン"
            color={accent + '20'}
            textColor={accent}
            size="sm"
          />
        </View>
      )}

      {/* Title row */}
      <View style={styles.planHeader}>
        <Text style={[styles.planName, { color: accent }]}>{title}</Text>
        <Text style={[styles.planSubtitle, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
      </View>

      {/* Price */}
      <View style={styles.priceRow}>
        <Text style={[styles.price, { color: colors.textPrimary }]}>
          {priceText}
        </Text>
        <Text style={[styles.period, { color: colors.textSecondary }]}>
          {periodText}
        </Text>
      </View>
      {monthlyEquivText && (
        <Text style={[styles.monthlyEquiv, { color: colors.success }]}>
          {monthlyEquivText}
        </Text>
      )}

      {/* Features */}
      <View style={styles.featureList}>
        {features.map((f) => (
          <View key={f} style={styles.featureRow}>
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={accent}
            />
            <Text style={[styles.featureText, { color: colors.textPrimary }]}>
              {f}
            </Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      {tier !== 'free' && ctaLabel && (
        <Button
          title={ctaLabel}
          onPress={onPress ?? (() => {})}
          variant={current || disabledUpgrade ? 'outline' : 'primary'}
          fullWidth
          disabled={current || disabledUpgrade}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// CompareCell subcomponent
// ---------------------------------------------------------------------------

function CompareCell({
  value,
  colors,
}: {
  value: CellValue;
  colors: ReturnType<typeof getColors>;
}) {
  if (typeof value === 'string') {
    return (
      <View style={styles.comparePlanCol}>
        <Text
          style={[styles.compareValue, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.comparePlanCol}>
      <Ionicons
        name={value ? 'checkmark-circle' : 'remove-circle-outline'}
        size={18}
        color={value ? colors.success : colors.textTertiary}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  headerRight: { width: 24 },
  title: { ...typography.titleMedium },
  statusLine: {
    ...typography.labelSmall,
    marginTop: 2,
  },

  // Scroll
  scroll: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },

  // Cycle tabs
  cycleWrap: {
    marginBottom: spacing.xs,
  },

  // Plan card
  planCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    position: 'relative',
  },
  ribbon: {
    position: 'absolute',
    top: -10,
    right: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  ribbonText: {
    ...typography.labelSmall,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  currentBadgeWrap: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
  },
  planHeader: {
    gap: 2,
  },
  planName: {
    ...typography.titleLarge,
    fontWeight: '700',
  },
  planSubtitle: {
    ...typography.bodySmall,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  price: {
    ...typography.displayMedium,
    fontWeight: '700',
  },
  period: {
    ...typography.bodyMedium,
  },
  monthlyEquiv: {
    ...typography.labelSmall,
    fontWeight: '600',
    marginTop: -spacing.xs,
  },
  featureList: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  featureText: {
    ...typography.bodyMedium,
    flex: 1,
  },

  // Compare button
  compareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  compareButtonText: {
    ...typography.labelLarge,
  },

  // Legal
  legalNote: {
    ...typography.bodySmall,
    lineHeight: 18,
    textAlign: 'center',
  },

  // Compare modal
  compareSheet: {
    flex: 1,
  },
  compareSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  compareSheetTitle: {
    ...typography.titleMedium,
  },
  compareSheetClose: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compareModalScroll: {
    flex: 1,
  },
  compareModalContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxxl,
  },
  compareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  compareGroup: {
    marginTop: spacing.md,
  },
  compareGroupTitle: {
    ...typography.labelMedium,
    fontWeight: '700',
    paddingVertical: spacing.xs,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  compareCol: {
    ...typography.bodySmall,
  },
  compareLabelCol: {
    flex: 3,
    paddingRight: spacing.sm,
  },
  comparePlanCol: {
    flex: 1,
    alignItems: 'center',
  },
  compareValue: {
    ...typography.labelSmall,
    textAlign: 'center',
  },
});
