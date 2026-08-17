import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { Toast } from '../ui/Toast';
import { QuickWeightModal } from './QuickWeightModal';
import { getColors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useProfileStore } from '../../stores/profileStore';
import { addWaterLog, deleteLog } from '../../infra/repositories/waterRepository';
import { createSession } from '../../infra/repositories/workoutRepository';
import { getISODate } from '../../utils/format';
import { RECORD_EVENTS, emitRecordEvent } from '../../utils/recordEvents';

// S3-2b — 記録ハブ。FAB タップで「何を記録しますか?」シートを開き、
// [食事] [体重] [水分] [ワークアウト] の4導線へ振り分ける (初回は4つ同等の
// 重み — 使用データが無い段階で食事を優遇しない)。
// - 食事: 従来 FAB 直行と同じ時間帯 mealType + 今日日付で /add-food へ
// - 体重: QuickWeightModal (upsertBodyLog = 進捗タブと同じ保存契約)
// - 水分: シート内で完結 (+200/+500)。追加行 id への deleteLog (既存
//   soft-delete + sync tombstone) による Undo トースト付き — 取り消しは
//   常に「直前に追加したその1行」のみを正確に戻す
// - ワークアウト: createSession → sessionId 付き push (S3-1 で根治した
//   ホーム CTA と同型。params なし起動は禁止)
// RN Modal (BottomSheet) と次の Modal/画面遷移を同フレームで切り替えると
// iOS で遷移が詰まるため、シートを閉じてから 250ms 置いて実行する。

const SHEET_CLOSE_MS = 250;

type HubMode = 'menu' | 'water';

interface RecordHubProps {
  visible: boolean;
  onClose: () => void;
}

interface HubToast {
  message: string;
  type: 'success' | 'error' | 'info';
  undoLogId?: string;
}

export function RecordHub({ visible, onClose }: RecordHubProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);

  const [mode, setMode] = useState<HubMode>('menu');
  const [weightVisible, setWeightVisible] = useState(false);
  const [toast, setToast] = useState<HubToast | null>(null);
  const [waterBusy, setWaterBusy] = useState(false);
  // C-11 パターン: ワークアウト開始 (createSession) の二重起動 guard
  const startingWorkoutRef = useRef(false);
  // 水分追加も同パターン — state (waterBusy) は UI 表示用、再入 guard は ref
  // (setState 反映前の連打で複数 INSERT が通るのを防ぐ)
  const addingWaterRef = useRef(false);

  // profile 未ロード (起動直後の稀な窓) では書き込み系導線を無音で落とさず
  // 案内する (Codex 3-2b R1 Important #5)
  const alertProfileNotReady = () => {
    Alert.alert('エラー', 'プロフィールを読み込み中です。しばらくしてからお試しください。');
  };

  const close = () => {
    setMode('menu');
    onClose();
  };

  const afterClose = (fn: () => void) => {
    close();
    setTimeout(fn, SHEET_CLOSE_MS);
  };

  const handleFood = () => {
    afterClose(() => {
      // 従来の FAB 直行と同一規則 (時間帯 mealType・日付は常に今日)
      const h = new Date().getHours();
      const mealType = h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
      router.push({ pathname: '/add-food', params: { mealType, date: getISODate() } });
    });
  };

  const handleWeight = () => {
    if (!profile) {
      alertProfileNotReady();
      return;
    }
    afterClose(() => setWeightVisible(true));
  };

  const handleWorkout = () => {
    if (!profile) {
      alertProfileNotReady();
      return;
    }
    afterClose(async () => {
      if (!profile || startingWorkoutRef.current) return;
      startingWorkoutRef.current = true;
      try {
        const session = await createSession(profile.id, null);
        router.push({
          pathname: '/(tabs)/training/session',
          params: { sessionId: session.id },
        });
      } catch {
        Alert.alert('エラー', 'セッションの開始に失敗しました');
      } finally {
        startingWorkoutRef.current = false;
      }
    });
  };

  const handleAddWater = async (ml: number) => {
    if (!profile) {
      alertProfileNotReady();
      return;
    }
    if (addingWaterRef.current) return;
    addingWaterRef.current = true;
    setWaterBusy(true);
    try {
      const log = await addWaterLog(profile.id, ml);
      emitRecordEvent(RECORD_EVENTS.waterLogChanged);
      close();
      setToast({
        message: `${ml}mlを記録しました`,
        type: 'success',
        undoLogId: log.id,
      });
    } catch {
      Alert.alert('エラー', '水分の記録に失敗しました。もう一度お試しください。');
    } finally {
      addingWaterRef.current = false;
      setWaterBusy(false);
    }
  };

  const handleUndoWater = async (logId: string) => {
    try {
      await deleteLog(logId);
      emitRecordEvent(RECORD_EVENTS.waterLogChanged);
      setToast({ message: '取り消しました', type: 'info' });
    } catch {
      Alert.alert('エラー', '取り消しに失敗しました');
    }
  };

  const menuOptions: {
    key: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    hint: string;
    onPress: () => void;
  }[] = [
    // S4.6-D — 押した結果が分かる動詞付き形式に統一 (accessibilityLabel は
    // opt.label をそのまま使うため自動追従)。key/testID は e2e 安定性のため不変。
    { key: 'food', icon: 'restaurant-outline', label: '食事を記録', hint: '食品追加画面を開きます', onPress: handleFood },
    { key: 'weight', icon: 'scale-outline', label: '体重を記録', hint: '体重入力を開きます', onPress: handleWeight },
    { key: 'water', icon: 'water-outline', label: '水分を記録', hint: 'シート内で水分を記録します', onPress: () => setMode('water') },
    { key: 'workout', icon: 'barbell-outline', label: '筋トレを開始', hint: '筋トレセッションを開始します', onPress: handleWorkout },
  ];

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={() => {
          if (!waterBusy) close();
        }}
        title={mode === 'menu' ? '何を記録しますか?' : '水分を記録'}
      >
        {mode === 'menu' ? (
          <View style={styles.grid}>
            {menuOptions.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.gridItem,
                  { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                ]}
                onPress={opt.onPress}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
                accessibilityHint={opt.hint}
                testID={`record-hub-${opt.key}`}
              >
                <Ionicons name={opt.icon} size={24} color={colors.primary} />
                <Text style={[styles.gridLabel, { color: colors.textPrimary }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.waterPanel}>
            <View style={styles.waterBtnRow}>
              {[200, 500].map((ml) => (
                <TouchableOpacity
                  key={ml}
                  style={[
                    styles.waterBtn,
                    { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' },
                    waterBusy && styles.busy,
                  ]}
                  onPress={() => handleAddWater(ml)}
                  disabled={waterBusy}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`水分を${ml}ml記録`}
                  accessibilityState={{ disabled: waterBusy, busy: waterBusy }}
                  testID={`record-hub-water-${ml}`}
                >
                  <Ionicons name="water-outline" size={18} color={colors.primary} />
                  <Text style={[styles.waterBtnText, { color: colors.primary }]}>+{ml}ml</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Button
              title="戻る"
              onPress={() => setMode('menu')}
              variant="ghost"
              size="md"
              fullWidth
              disabled={waterBusy}
            />
          </View>
        )}
      </BottomSheet>

      <QuickWeightModal
        visible={weightVisible}
        onClose={() => setWeightVisible(false)}
        onSaved={() => {
          setWeightVisible(false);
          setToast({ message: '体重を記録しました', type: 'success' });
        }}
      />

      <Toast
        message={toast?.message ?? ''}
        type={toast?.type ?? 'info'}
        visible={toast !== null}
        onHide={() => setToast(null)}
        duration={toast?.undoLogId ? 5000 : 3000}
        actionLabel={toast?.undoLogId ? '取り消す' : undefined}
        onAction={
          toast?.undoLogId
            ? () => {
                void handleUndoWater(toast.undoLogId!);
              }
            : undefined
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  gridItem: {
    width: '48%',
    minHeight: 84,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  gridLabel: { ...typography.labelLarge, fontWeight: '600' },
  waterPanel: { gap: spacing.md },
  waterBtnRow: { flexDirection: 'row', gap: spacing.sm },
  waterBtnText: { ...typography.labelLarge, fontWeight: '700' },
  waterBtn: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  busy: { opacity: 0.5 },
});
