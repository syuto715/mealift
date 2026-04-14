import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card, Button, Modal, Input, Badge } from '../../../src/components/ui';
import { MUSCLE_GROUPS, MUSCLE_GROUP_MAP } from '../../../src/constants/muscleGroups';
import { MuscleGroup } from '../../../src/types/common';
import { Exercise } from '../../../src/types/workout';
import {
  getCustomExercises,
  createCustomExercise,
  updateCustomExercise,
  deleteCustomExercise,
} from '../../../src/infra/repositories/workoutRepository';

export default function CustomExercisesScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Edit/Create modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('chest');
  const [equipment, setEquipment] = useState('');

  const loadExercises = useCallback(async () => {
    const data = await getCustomExercises();
    setExercises(data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadExercises();
  }, [loadExercises]);

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setMuscleGroup('chest');
    setEquipment('');
    setShowModal(true);
  };

  const openEdit = (ex: Exercise) => {
    setEditingId(ex.id);
    setName(ex.nameJa);
    setMuscleGroup(ex.muscleGroup);
    setEquipment(ex.equipment ?? '');
    setShowModal(true);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    if (editingId) {
      await updateCustomExercise(editingId, trimmed, muscleGroup, equipment.trim() || null);
    } else {
      await createCustomExercise(trimmed, muscleGroup, equipment.trim() || null);
    }

    setShowModal(false);
    loadExercises();
  };

  const handleDelete = (ex: Exercise) => {
    Alert.alert('削除確認', `「${ex.nameJa}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await deleteCustomExercise(ex.id);
          loadExercises();
        },
      },
    ]);
  };

  if (!loaded) return null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>カスタム種目</Text>
        <TouchableOpacity onPress={openCreate} style={styles.headerBtn}>
          <Ionicons name="add" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {exercises.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
              カスタム種目なし
            </Text>
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
              トレーニング画面の種目追加からカスタム種目を作成できます。
            </Text>
          </View>
        )}

        {exercises.length > 0 && (
          <Card padding="none">
            {exercises.map((ex, index) => (
              <View
                key={ex.id}
                style={[
                  styles.row,
                  {
                    borderBottomColor: colors.border,
                    borderBottomWidth: index < exercises.length - 1 ? 0.5 : 0,
                  },
                ]}
              >
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowName, { color: colors.textPrimary }]}>
                    {ex.nameJa}
                  </Text>
                  <View style={styles.rowMeta}>
                    <Badge
                      label={MUSCLE_GROUP_MAP[ex.muscleGroup]?.nameJa ?? ex.muscleGroup}
                      size="sm"
                    />
                    {ex.equipment && (
                      <Text style={[styles.rowEquipment, { color: colors.textTertiary }]}>
                        {ex.equipment}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.rowActions}>
                  <TouchableOpacity onPress={() => openEdit(ex)} style={styles.actionBtn}>
                    <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(ex)} style={styles.actionBtn}>
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      {/* Create/Edit Modal */}
      <Modal
        visible={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'カスタム種目を編集' : 'カスタム種目を追加'}
      >
        <View style={styles.modalContent}>
          <Input
            label="種目名（必須）"
            placeholder="例: ケーブルフライ"
            value={name}
            onChangeText={setName}
          />
          <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>部位</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {MUSCLE_GROUPS.map((mg) => (
                <TouchableOpacity
                  key={mg.id}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        muscleGroup === mg.id ? colors.primary : colors.surfaceSecondary,
                      borderRadius: radius.full,
                    },
                  ]}
                  onPress={() => setMuscleGroup(mg.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: muscleGroup === mg.id ? '#FFFFFF' : colors.textSecondary,
                      },
                    ]}
                  >
                    {mg.nameJa}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <Input
            label="器具メモ（任意）"
            placeholder="例: ケーブルマシン"
            value={equipment}
            onChangeText={setEquipment}
          />
          <View style={styles.modalActions}>
            <Button
              title="キャンセル"
              onPress={() => setShowModal(false)}
              variant="ghost"
              size="md"
            />
            <Button
              title={editingId ? '保存' : '追加'}
              onPress={handleSave}
              variant="primary"
              size="md"
              disabled={!name.trim()}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  headerBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { ...typography.titleMedium },
  scroll: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxxl,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    gap: spacing.md,
  },
  emptyTitle: { ...typography.titleSmall },
  emptyText: {
    ...typography.bodySmall,
    textAlign: 'center',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  rowInfo: {
    flex: 1,
    gap: 4,
  },
  rowName: { ...typography.bodyLarge },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowEquipment: { ...typography.bodySmall },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: { gap: spacing.md },
  modalLabel: { ...typography.labelMedium },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipText: { ...typography.labelSmall },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
});
