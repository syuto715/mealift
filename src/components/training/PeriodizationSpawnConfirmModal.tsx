import React, { useEffect, useState } from 'react';
// useEffect imported for both the routine-fetch effect and the
// Codex pass 1 / Critical auto-close-on-downgrade effect.
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
import {
  spawnAllPeriodizedRoutines,
  type PeriodizationTemplate,
} from '../../domain/periodization';
import { useUIStore } from '../../stores/uiStore';
import type {
  WorkoutRoutineWithItems,
  SetPattern,
} from '../../types/workout';

// Build 16 / Phase 5 (Feature G) / Phase 5.2 — modal flow that
// finalizes the periodization-preset application:
//
//   1. Pick a base routine from the user's routine list
//   2. Confirm the spawn count (4 for Linear/DUP, 12 for Block;
//      the count comes from spawnAllPeriodizedRoutines length)
//   3. createRoutine × N sequentially with sort_order assigned so
//      the spawned routines land contiguously in the user's list
//      ordered by week (W1 → W4 / W12, or DUP H/M/L per week)
//   4. Toast on success/error + close
//
// Phase 4.2 lineage:
//   - DeloadRoutinePickerModal pioneered the "pick a base routine ×
//     transform × createRoutine × markApplied" flow. This modal
//     reuses the same shape minus the markApplied step (no state
//     machine to advance — periodization spawning has no
//     persisted recommendation row).
//   - State reset on visible=false (avoid stale list flash on reopen).
//   - applying flag prevents double-tap during the spawn loop.
//
// Sequential createRoutine (not Promise.all) — Build 15 lessons on
// SQLite contention argued for sequential, and the spawn count is
// bounded (≤ 12). The sequential order is also load-bearing: each
// row's sort_order = base + index, and we want monotonic created_at
// to keep the in-list order deterministic.

interface Props {
  visible: boolean;
  profileId: string;
  template: PeriodizationTemplate | null;
  // Codex review pass 1 / Critical — Pro entitlement re-checked
  // inside the modal. Without this, a downgrade (RC listener fires
  // mid-flow) would leave a stale modal able to persist routines
  // for a user who just lost the feature. The screen-level gate
  // alone isn't enough because the modal is rendered independently
  // of the gate-controlled body.
  unlocked: boolean;
  onSpawned: (createdCount: number) => void;
  onClose: () => void;
}

type Mode = 'pick' | 'confirm' | 'spawning';

export function PeriodizationSpawnConfirmModal({
  visible,
  profileId,
  template,
  unlocked,
  onSpawned,
  onClose,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const showToast = useUIStore((s) => s.showToast);

  const [routines, setRoutines] = useState<WorkoutRoutineWithItems[] | null>(
    null,
  );
  const [mode, setMode] = useState<Mode>('pick');
  const [selectedRoutine, setSelectedRoutine] =
    useState<WorkoutRoutineWithItems | null>(null);

  // Codex review pass 1 / Critical — auto-close on live downgrade.
  // hasFeature is reactive to subscription state changes, so a
  // RevenueCat-driven Pro→Plus transition while this modal is open
  // flips `unlocked` to false. We bail out (parent's onClose
  // resets visible→false) instead of leaving a half-finished spawn
  // path armed.
  useEffect(() => {
    if (visible && !unlocked && mode !== 'spawning') {
      onClose();
    }
  }, [visible, unlocked, mode, onClose]);

  useEffect(() => {
    if (!visible) {
      setRoutines(null);
      setMode('pick');
      setSelectedRoutine(null);
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

  const handlePickRoutine = (routine: WorkoutRoutineWithItems) => {
    setSelectedRoutine(routine);
    setMode('confirm');
  };

  const handleBackToPick = () => {
    setSelectedRoutine(null);
    setMode('pick');
  };

  const handleConfirmSpawn = async () => {
    if (!template || !selectedRoutine) return;
    // Codex review pass 1 / Critical — defensive gate-recheck right
    // before persistence. Even with the auto-close useEffect above,
    // a downgrade landing in the same render cycle as the user tap
    // could otherwise still let the spawn fire.
    if (!unlocked) {
      onClose();
      return;
    }
    setMode('spawning');
    try {
      const outputs = spawnAllPeriodizedRoutines({
        baseName: selectedRoutine.name,
        baseItems: selectedRoutine.items.map((it) => ({
          exerciseId: it.exerciseId,
          targetSets: it.targetSets,
          targetReps: it.targetReps ?? '8',
          setPattern: it.setPattern as SetPattern | null,
          patternConfig: it.patternConfig,
        })),
        template,
      });
      // Codex review pass 1 / Important #1 — sort_order base uses
      // millisecond Date.now() rather than epoch seconds. The prior
      // second-granularity base could collide on consecutive spawns
      // and let two batches interleave week-by-week (Block-12 has
      // 12 routines × 1-second base = guaranteed overlap if the
      // user spawned twice in the same second). Millisecond base
      // gives 1ms/routine within a batch, so batches need ≥ N ms
      // separation (trivial for human-driven taps).
      const sortBase = Date.now();
      let created = 0;
      try {
        for (let i = 0; i < outputs.length; i++) {
          const out = outputs[i];
          await createRoutine(profileId, out.name, out.items, sortBase + i);
          created += 1;
        }
      } catch (err) {
        // Codex review pass 1 / Important #2 — partial-failure UX.
        // Mid-loop failure leaves `created` routines persisted; the
        // user gets an honest "X created, then failed" toast rather
        // than a generic "create failed" that hides the partial
        // state. We do NOT roll back: per kickoff §3 orphans are
        // user-deletable, and a follow-up cleanup of just-spawned
        // routines could itself fail and compound the mess.
        if (created > 0) {
          showToast(
            `${created} 個まで作成しましたが、${created + 1} 個目で失敗しました`,
            'error',
          );
        } else {
          showToast(
            'ピリオダイゼーション routine の作成に失敗しました',
            'error',
          );
        }
        setMode('confirm');
        return;
      }
      onSpawned(created);
    } catch {
      // spawnAllPeriodizedRoutines itself throwing — should not happen
      // for a healthy template + base routine.
      showToast('ピリオダイゼーション routine の作成に失敗しました', 'error');
      setMode('confirm');
    }
  };

  // Codex review pass 1 / Important #3 — warn the user when the
  // selected base routine has set_pattern items (5×5 / トップ /
  // ドロップ). Periodization templates overwrite targetSets +
  // targetReps but preserve setPattern + patternConfig, which is
  // an intentional v1 inconsistency (Phase 5.1 header comment).
  // Surface a clear note in the confirm step so the user isn't
  // surprised by a "5×5" routine that ends up logging 5×8.
  const baseHasSetPattern = !!selectedRoutine?.items.some(
    (it) => it.setPattern != null,
  );

  const spawnCount = template
    ? template.id === 'dup'
      ? template.durationWeeks * 3
      : template.durationWeeks
    : 0;

  return (
    <Modal
      visible={visible}
      onClose={mode === 'spawning' ? () => undefined : onClose}
      title={
        mode === 'pick'
          ? 'ベースルーティンを選択'
          : mode === 'confirm'
            ? '生成内容の確認'
            : '生成中...'
      }
    >
      <View style={styles.container}>
        {mode === 'pick' && (
          <>
            {routines === null ? (
              <View style={styles.center}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : routines.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text
                  style={[styles.emptyText, { color: colors.textSecondary }]}
                >
                  先にルーティンを作成してください。
                </Text>
                <Text
                  style={[styles.emptyHint, { color: colors.textTertiary }]}
                >
                  既存のルーティンをベースに、
                  {template?.nameJa ?? 'プリセット'}に沿った
                  {spawnCount} 個のルーティンを生成します。
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
              >
                {routines.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    onPress={() => handlePickRoutine(r)}
                    style={[
                      styles.card,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${r.name} をベースに ${spawnCount} 個生成`}
                  >
                    <Text
                      style={[styles.cardTitle, { color: colors.textPrimary }]}
                    >
                      {r.name}
                    </Text>
                    <Text
                      style={[
                        styles.cardSubtitle,
                        { color: colors.textTertiary },
                      ]}
                    >
                      種目数: {r.items.length}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        )}

        {mode === 'confirm' && template && selectedRoutine && (
          <View style={styles.confirmContainer}>
            <Text style={[styles.confirmText, { color: colors.textPrimary }]}>
              「{selectedRoutine.name}」をベースに、
            </Text>
            <Text style={[styles.confirmEmphasis, { color: colors.primary }]}>
              {template.nameJa}
            </Text>
            <Text style={[styles.confirmText, { color: colors.textPrimary }]}>
              {spawnCount} 個のルーティンを生成します。
            </Text>
            <Text style={[styles.confirmHint, { color: colors.textTertiary }]}>
              生成後、ルーティン一覧に [{template.id === 'dup' ? 'DUP W1 Heavy' : `${capitalize(template.id)} W1`}] のような名前で表示されます。
            </Text>
            {baseHasSetPattern && (
              <Text
                style={[
                  styles.warningText,
                  { color: colors.warning, borderColor: colors.warning },
                ]}
              >
                ⚠ ベースルーティンに 5×5 / トップ / ドロップなどのセット形式が含まれています。生成されるルーティンはセット数とレップ数のみプリセットに合わせて上書きされ、セット形式は維持されます。意図しない組み合わせになる場合は、ベースルーティンを「標準」に戻してから再実行してください。
              </Text>
            )}
          </View>
        )}

        {mode === 'spawning' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text
              style={[styles.spawningText, { color: colors.textSecondary }]}
            >
              {spawnCount} 個のルーティンを生成中...
            </Text>
          </View>
        )}

        <View style={styles.footer}>
          {mode === 'pick' && (
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
              <Text
                style={[styles.cancelBtnText, { color: colors.textSecondary }]}
              >
                キャンセル
              </Text>
            </TouchableOpacity>
          )}
          {mode === 'confirm' && (
            <>
              <TouchableOpacity
                onPress={handleBackToPick}
                style={styles.cancelBtn}
              >
                <Text
                  style={[
                    styles.cancelBtnText,
                    { color: colors.textSecondary },
                  ]}
                >
                  戻る
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmSpawn}
                style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
                accessibilityRole="button"
                accessibilityLabel={`${spawnCount} 個生成`}
              >
                <Text style={styles.confirmBtnText}>生成する</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function capitalize(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

const styles = StyleSheet.create({
  container: {
    minHeight: 220,
    maxHeight: 480,
  },
  center: {
    flex: 1,
    minHeight: 160,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    minHeight: 160,
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
  list: { flex: 1 },
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
  confirmContainer: {
    flex: 1,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  confirmText: {
    ...typography.bodyMedium,
  },
  confirmEmphasis: {
    ...typography.titleSmall,
    fontWeight: '600',
  },
  confirmHint: {
    ...typography.bodySmall,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  warningText: {
    ...typography.bodySmall,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    lineHeight: 18,
  },
  spawningText: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  cancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  cancelBtnText: {
    ...typography.labelLarge,
  },
  confirmBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    ...typography.labelLarge,
    color: '#FFFFFF',
  },
});
