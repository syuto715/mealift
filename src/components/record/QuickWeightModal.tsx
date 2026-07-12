import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Modal } from '../ui/Modal';
import { NumberInput } from '../ui/NumberInput';
import { Button } from '../ui/Button';
import { useProfileStore } from '../../stores/profileStore';
import { upsertBodyLog } from '../../infra/repositories/bodyLogRepository';
import { getISODate } from '../../utils/format';
import { spacing } from '../../theme/spacing';

// S3-2b — 記録ハブ (FAB シート) からの体重クイック入力。
// 進捗タブの体重 modal は画面 state に密結合した inline 実装のため流用せず、
// 保存契約 (upsertBodyLog = useBodyLogs.recordWeight と同一の repo 関数、
// 同日 upsert) だけを共有する軽量版。メモ・体調ノート連携は進捗タブ側の
// 機能として残す (ここでは体重 + 任意の体脂肪率のみ)。
// 記録先は常に今日 (ハブはグローバル導線のため選択日に連動しない — FAB の
// 食事導線と同じ規則)。

interface QuickWeightModalProps {
  visible: boolean;
  onClose: () => void;
  /** 保存成功時 (トースト表示は呼び出し側)。 */
  onSaved: () => void;
}

export function QuickWeightModal({ visible, onClose, onSaved }: QuickWeightModalProps) {
  const profile = useProfileStore((s) => s.profile);
  const [weight, setWeight] = useState<number | null>(
    profile?.currentWeightKg ?? null,
  );
  const [bodyFat, setBodyFat] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!profile || weight == null || isSaving) return;
    setIsSaving(true);
    try {
      await upsertBodyLog(profile.id, {
        date: getISODate(),
        weightKg: weight,
        bodyFatPct: bodyFat,
      });
      onSaved();
    } catch {
      // modal は閉じない — 再試行できる (進捗タブの体重 modal と同じ方針)
      Alert.alert('エラー', '体重の記録に失敗しました。もう一度お試しください。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} onClose={() => { if (!isSaving) onClose(); }} title="体重を記録">
      <View style={styles.content}>
        <NumberInput
          label="体重"
          suffix="kg"
          value={weight}
          onValueChange={setWeight}
          step={0.1}
          decimals={1}
          min={20}
          max={300}
        />
        <NumberInput
          label="体脂肪率（任意）"
          suffix="%"
          value={bodyFat}
          onValueChange={setBodyFat}
          step={0.1}
          decimals={1}
          min={1}
          max={75}
        />
        <Button
          title="記録する"
          onPress={handleSave}
          variant="primary"
          size="lg"
          fullWidth
          loading={isSaving}
          disabled={isSaving || weight == null}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
});
