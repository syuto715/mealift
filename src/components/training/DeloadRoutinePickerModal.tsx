import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { Modal } from '../ui/Modal';
import { getColors, radius } from '../../theme/tokens';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import {
  getRoutines,
  createRoutine,
} from '../../infra/repositories/workoutRepository';
import { markApplied } from '../../infra/repositories/deloadRecommendationRepository';
import { generateDeloadRoutine } from '../../domain/deloadDetection';
import { useUIStore } from '../../stores/uiStore';
import type {
  WorkoutRoutineWithItems,
  SetPattern,
} from '../../types/workout';

// Build 16 / Phase 4 (Feature F) / Phase 4.2 — modal that lets the
// user pick which routine to deload from. Tapping a routine card:
//   1. Pulls the routine's items + halves them via generateDeloadRoutine
//      (Phase 4.1 pure transform).
//   2. Persists the new routine via createRoutine() — same call path
//      every other "create routine" UI uses, so the new row enters the
//      sync queue + audit pipeline cleanly (no special-case writes).
//   3. Calls markApplied(profileId, recommendationId, newRoutine.id)
//      to advance the state machine. Phase 4.0 enforces the WHERE-clause
//      invariant (only-once transition).
//   4. Calls onApplied with the new routine id so the caller can show
//      a success toast / route the user to the routine.
//
// Routine 0-case: empty list with "先にルーティンを作成してください" copy +
// close button. The user has to leave the modal to author a routine.
//
// Same-name conflict: appended `（デロード）` suffix. We don't dedup
// against existing routines — if the user accepts duplicates by tapping
// the same source twice, that's their choice and the new row gets a
// fresh id either way.

interface DeloadRoutinePickerModalProps {
  visible: boolean;
  profileId: string;
  recommendationId: string;
  onApplied: (newRoutineId: string) => void;
  onClose: () => void;
}

export function DeloadRoutinePickerModal({
  visible,
  profileId,
  recommendationId,
  onApplied,
  onClose,
}: DeloadRoutinePickerModalProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const showToast = useUIStore((s) => s.showToast);

  const [routines, setRoutines] = useState<WorkoutRoutineWithItems[] | null>(
    null,
  );
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!visible) {
      // Reset state on close so the next mount starts from a clean
      // slate (avoids the picker flashing a stale list when reopened
      // after the user creates a new routine).
      setRoutines(null);
      setApplying(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await getRoutines(profileId);
        if (cancelled) return;
        setRoutines(result);
      } catch {
        if (!cancelled) setRoutines([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, profileId]);

  async function handlePick(routine: WorkoutRoutineWithItems) {
    if (applying) return;
    setApplying(true);
    try {
      const deloadItems = generateDeloadRoutine(
        routine.items.map((it) => ({
          exerciseId: it.exerciseId,
          targetSets: it.targetSets,
          targetReps: it.targetReps ?? '8',
          setPattern: it.setPattern as SetPattern | null,
          patternConfig: it.patternConfig,
        })),
      );
      const newRoutine = await createRoutine(
        profileId,
        `${routine.name}（デロード）`,
        deloadItems,
      );
      // Codex review pass 1 / Important #1 — markApplied returns
      // false when the WHERE-clause guard refuses the transition
      // (already-applied / already-dismissed / soft-deleted /
      // wrong profile). Without checking, we'd happily report
      // success and dismiss the banner even though the
      // recommendation row was already in a terminal state on
      // another device. Surface the failure as a toast + close so
      // the user can re-fetch banner state on the next focus.
      const transitioned = await markApplied(
        profileId,
        recommendationId,
        newRoutine.id,
      );
      if (transitioned) {
        onApplied(newRoutine.id);
      } else {
        showToast(
          'すでに適用済みのため、ルーティンのみ作成しました',
          'info',
        );
        onClose();
      }
    } catch {
      showToast('デロード適用に失敗しました', 'error');
      setApplying(false);
    }
  }

  return (
    <Modal visible={visible} onClose={onClose} title="デロードするルーティンを選択">
      <View style={styles.container}>
        {routines === null ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : routines.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              先にルーティンを作成してください。
            </Text>
            <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
              既存のルーティンを 50% ボリュームに変換したものを新しいルーティンとして保存します。
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {routines.map((routine) => (
              <TouchableOpacity
                key={routine.id}
                style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => handlePick(routine)}
                disabled={applying}
                accessibilityRole="button"
                accessibilityLabel={`${routine.name} をデロード`}
              >
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                  {routine.name}
                </Text>
                <Text style={[styles.cardSubtitle, { color: colors.textTertiary }]}>
                  種目数: {routine.items.length}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.footer}>
          <TouchableOpacity onPress={onClose} disabled={applying} style={styles.cancelBtn}>
            <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
              キャンセル
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 220,
    maxHeight: 480,
  },
  center: {
    flex: 1,
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  emptyText: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
  emptyHint: {
    ...typography.bodySmall,
    textAlign: 'center',
    lineHeight: 18,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  cardTitle: {
    ...typography.titleSmall,
    fontWeight: '600',
  },
  cardSubtitle: {
    ...typography.bodySmall,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: spacing.md,
  },
  cancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  cancelBtnText: {
    ...typography.labelLarge,
  },
});
