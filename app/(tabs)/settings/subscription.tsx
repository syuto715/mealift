import React, { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius, shadow } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card, Badge, Button, Modal } from '../../../src/components/ui';
import { getCurrentTier } from '../../../src/infra/services/subscriptionService';

interface FeatureRow {
  label: string;
  free: boolean;
  plus: boolean;
  pro: boolean;
}

const FEATURE_ROWS: FeatureRow[] = [
  { label: '基本トラッキング', free: true, plus: true, pro: true },
  { label: '目標予測', free: false, plus: true, pro: true },
  { label: '週間レポート', free: false, plus: true, pro: true },
  { label: 'アダプティブカロリー', free: false, plus: false, pro: true },
  { label: '進捗写真', free: false, plus: true, pro: true },
  { label: 'AI レビュー', free: false, plus: false, pro: true },
  { label: 'データエクスポート', free: false, plus: true, pro: true },
];

export default function SubscriptionScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const currentPlan = getCurrentTier();
  const [upgradeModalVisible, setUpgradeModalVisible] = useState(false);

  const planLabel =
    currentPlan === 'pro' ? 'Pro' : currentPlan === 'plus' ? 'Plus' : 'Free';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>プラン管理</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <View style={styles.currentPlanRow}>
            <View>
              <Text style={[styles.currentPlanLabel, { color: colors.textSecondary }]}>
                現在のプラン
              </Text>
              <Text style={[styles.currentPlanName, { color: colors.textPrimary }]}>
                {planLabel} プラン
              </Text>
            </View>
            <Badge label={planLabel} color={colors.primary + '20'} textColor={colors.primary} size="md" />
          </View>
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>機能比較</Text>
        <Card padding="none">
          <View style={[styles.tableHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.featureCol, styles.tableHeaderText, { color: colors.textSecondary }]}>
              機能
            </Text>
            <Text style={[styles.planCol, styles.tableHeaderText, { color: colors.textSecondary }]}>
              Free
            </Text>
            <Text style={[styles.planCol, styles.tableHeaderText, { color: colors.textSecondary }]}>
              Plus
            </Text>
            <Text style={[styles.planCol, styles.tableHeaderText, { color: colors.textSecondary }]}>
              Pro
            </Text>
          </View>
          {FEATURE_ROWS.map((row, index) => (
            <View
              key={row.label}
              style={[
                styles.tableRow,
                index < FEATURE_ROWS.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
              ]}
            >
              <Text
                style={[styles.featureCol, styles.featureLabel, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {row.label}
              </Text>
              <View style={styles.planCol}>
                <Ionicons
                  name={row.free ? 'checkmark-circle' : 'close-circle'}
                  size={18}
                  color={row.free ? colors.success : colors.textTertiary}
                />
              </View>
              <View style={styles.planCol}>
                <Ionicons
                  name={row.plus ? 'checkmark-circle' : 'close-circle'}
                  size={18}
                  color={row.plus ? colors.success : colors.textTertiary}
                />
              </View>
              <View style={styles.planCol}>
                <Ionicons
                  name={row.pro ? 'checkmark-circle' : 'close-circle'}
                  size={18}
                  color={row.pro ? colors.success : colors.textTertiary}
                />
              </View>
            </View>
          ))}
        </Card>

        <View
          style={[
            styles.planCard,
            { backgroundColor: colors.surface, borderColor: colors.primary },
            shadow.md,
          ]}
        >
          <View style={styles.planCardHeader}>
            <Text style={[styles.planCardName, { color: colors.primary }]}>Plus</Text>
            <Text style={[styles.planCardPrice, { color: colors.textPrimary }]}>
              ¥480
              <Text style={[styles.planCardPeriod, { color: colors.textSecondary }]}>/月</Text>
            </Text>
          </View>
          <View style={styles.planCardFeatures}>
            <FeatureBullet text="ルーティン無制限" colors={colors} />
            <FeatureBullet text="目標予測・週間レポート" colors={colors} />
            <FeatureBullet text="進捗写真" colors={colors} />
            <FeatureBullet text="データエクスポート" colors={colors} />
          </View>
          <Button
            title="アップグレード"
            onPress={() => setUpgradeModalVisible(true)}
            variant="primary"
            fullWidth
          />
        </View>

        <View
          style={[
            styles.planCard,
            { backgroundColor: colors.surface, borderColor: colors.accent },
            shadow.md,
          ]}
        >
          <View style={styles.planCardHeader}>
            <Text style={[styles.planCardName, { color: colors.accent }]}>Pro</Text>
            <Text style={[styles.planCardPrice, { color: colors.textPrimary }]}>
              ¥980
              <Text style={[styles.planCardPeriod, { color: colors.textSecondary }]}>/月</Text>
            </Text>
          </View>
          <View style={styles.planCardFeatures}>
            <FeatureBullet text="Plus の全機能" colors={colors} />
            <FeatureBullet text="AI レビュー" colors={colors} />
            <FeatureBullet text="アダプティブカロリー" colors={colors} />
            <FeatureBullet text="写真による食事記録" colors={colors} />
          </View>
          <Button
            title="アップグレード"
            onPress={() => setUpgradeModalVisible(true)}
            variant="primary"
            fullWidth
          />
        </View>
      </ScrollView>

      <Modal
        visible={upgradeModalVisible}
        onClose={() => setUpgradeModalVisible(false)}
        title="近日公開"
      >
        <View style={styles.upgradeModalBody}>
          <Ionicons name="rocket-outline" size={48} color={colors.primary} />
          <Text style={[styles.upgradeModalText, { color: colors.textPrimary }]}>
            近日公開です
          </Text>
          <Text style={[styles.upgradeModalSub, { color: colors.textSecondary }]}>
            有料プランは現在準備中です。もう少しお待ちください。
          </Text>
          <Button
            title="閉じる"
            onPress={() => setUpgradeModalVisible(false)}
            variant="outline"
            fullWidth
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function FeatureBullet({ text, colors }: { text: string; colors: ReturnType<typeof getColors> }) {
  return (
    <View style={featureBulletStyles.row}>
      <Ionicons name="checkmark" size={16} color={colors.success} />
      <Text style={[featureBulletStyles.text, { color: colors.textPrimary }]}>{text}</Text>
    </View>
  );
}

const featureBulletStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { ...typography.bodyMedium },
});

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { ...typography.titleMedium },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxxl },
  currentPlanRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  currentPlanLabel: { ...typography.labelMedium, marginBottom: spacing.xs },
  currentPlanName: { ...typography.titleSmall },
  sectionTitle: { ...typography.titleSmall },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
  },
  tableHeaderText: { ...typography.labelMedium },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  featureCol: { flex: 2 },
  featureLabel: { ...typography.bodySmall },
  planCol: { flex: 1, alignItems: 'center' },
  planCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    gap: spacing.lg,
  },
  planCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  planCardName: { ...typography.titleLarge },
  planCardPrice: { ...typography.titleMedium },
  planCardPeriod: { ...typography.bodySmall },
  planCardFeatures: { gap: spacing.sm },
  upgradeModalBody: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  upgradeModalText: { ...typography.titleMedium },
  upgradeModalSub: { ...typography.bodyMedium, textAlign: 'center' },
});
