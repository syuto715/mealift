import React, { useEffect, useState } from 'react';
import {
  Modal as RNModal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius, shadow } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Button } from '../ui/Button';
import { WaterLog } from '../../types/water';
import {
  getHistory,
} from '../../infra/repositories/waterRepository';
import { formatDate } from '../../utils/format';

interface Props {
  visible: boolean;
  profileId: string;
  todayMl: number;
  targetMl: number;
  logs: WaterLog[];
  onClose: () => void;
  onAdd: (ml: number) => void | Promise<void>;
  onRemove: (id: string) => void | Promise<void>;
}

export function WaterHistoryModal({
  visible,
  profileId,
  todayMl,
  targetMl,
  logs,
  onClose,
  onAdd,
  onRemove,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const [history, setHistory] = useState<{ date: string; totalMl: number }[]>([]);
  const [customAmount, setCustomAmount] = useState('');

  useEffect(() => {
    if (!visible) return;
    getHistory(profileId, 7).then(setHistory).catch(() => setHistory([]));
  }, [visible, profileId, todayMl]);

  const maxHistory = Math.max(targetMl, ...history.map((h) => h.totalMl), 1);

  return (
    <RNModal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }, shadow.lg]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>水分摂取</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <View style={[styles.summary, { backgroundColor: colors.primary + '10' }]}>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>
                {todayMl.toLocaleString()} ml
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                目標 {targetMl.toLocaleString()} ml
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                カスタム量を追加
              </Text>
              <View style={[styles.inputRow, { borderColor: colors.border }]}>
                <TextInput
                  value={customAmount}
                  onChangeText={setCustomAmount}
                  keyboardType="number-pad"
                  style={[styles.input, { color: colors.textPrimary }]}
                  placeholder="例: 330"
                  placeholderTextColor={colors.textTertiary}
                />
                <Text style={{ color: colors.textSecondary }}>ml</Text>
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: colors.primary }]}
                  onPress={async () => {
                    const n = Number(customAmount);
                    if (Number.isFinite(n) && n > 0) {
                      await onAdd(n);
                      setCustomAmount('');
                    }
                  }}
                >
                  <Text style={[styles.addBtnText, { color: '#fff' }]}>追加</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                今日の記録
              </Text>
              {logs.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textSecondary }]}>
                  まだ記録がありません
                </Text>
              ) : (
                logs.map((l) => (
                  <View key={l.id} style={[styles.logRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.logTime, { color: colors.textSecondary }]}>
                      {formatDate(l.loggedAt, 'HH:mm')}
                    </Text>
                    <Text style={[styles.logAmount, { color: colors.textPrimary }]}>
                      {l.amountMl} ml
                    </Text>
                    <TouchableOpacity onPress={() => onRemove(l.id)}>
                      <Ionicons name="trash-outline" size={18} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>

            <View style={styles.field}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                過去7日間
              </Text>
              {history.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textSecondary }]}>データなし</Text>
              ) : (
                history.map((h) => {
                  const ratio = h.totalMl / maxHistory;
                  const hit = h.totalMl >= targetMl;
                  return (
                    <View key={h.date} style={styles.barRow}>
                      <Text style={[styles.barDate, { color: colors.textSecondary }]}>
                        {formatDate(h.date, 'M/d')}
                      </Text>
                      <View style={[styles.barBg, { backgroundColor: colors.surfaceSecondary }]}>
                        <View
                          style={[
                            styles.barFg,
                            {
                              width: `${Math.min(100, ratio * 100)}%`,
                              backgroundColor: hit ? colors.success : colors.primary,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.barValue, { color: colors.textPrimary }]}>
                        {h.totalMl.toLocaleString()}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Button title="閉じる" onPress={onClose} variant="ghost" fullWidth />
          </View>
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  title: { ...typography.titleMedium },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  summary: {
    padding: spacing.lg,
    borderRadius: 12,
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryValue: { ...typography.displayMedium },
  summaryLabel: { ...typography.labelMedium },
  field: { gap: spacing.sm },
  sectionTitle: { ...typography.labelMedium },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  input: { flex: 1, ...typography.numberSmall, fontSize: 16 },
  addBtn: { paddingHorizontal: spacing.md, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { ...typography.labelMedium },
  empty: { ...typography.bodyMedium, color: '#888', textAlign: 'center', paddingVertical: spacing.md },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  logTime: { ...typography.labelMedium, width: 60 },
  logAmount: { ...typography.numberSmall, flex: 1, fontSize: 16 },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  barDate: { ...typography.labelMedium, width: 40 },
  barBg: { flex: 1, height: 14, borderRadius: 7, overflow: 'hidden' },
  barFg: { height: '100%', borderRadius: 7 },
  barValue: { ...typography.labelMedium, width: 56, textAlign: 'right' },
  footer: {
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
