import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Button, Card, Modal, Toast } from '../../../src/components/ui';
import { useProfileStore } from '../../../src/stores/profileStore';
import { useAIMenuStagingStore } from '../../../src/stores/aiMenuStagingStore';
import {
  resolveSlugsBulk,
  type SlugResolution,
} from '../../../src/infra/services/slugResolver';
import { convertToRoutineDraft } from '../../../src/utils/routineConverter';
import * as workoutRepo from '../../../src/infra/repositories/workoutRepository';
import type { MuscleGroup } from '../../../src/types/common';

// Build 15 / Session 8 / Phase 6 / Commit 25 — preview + week/day
// picker + custom-creation dialog + save flow.
//
// Lifecycle:
//   1. Read program from staging store. If null (deep-link / cold-start
//      into this route), bounce back to the generation screen.
//   2. resolveSlugsBulk() against every block's exerciseSlug. Track
//      which fall to needs_custom; surface a single bulk dialog before
//      the user can save (auto-creation forbidden per Session 8 sign-off).
//   3. Render week tab strip (1..durationWeeks) + day chip strip
//      (1..days.length for the selected week) + preview pane for
//      (week, day). Default = (week 0, day 0).
//   4. Save: convertToRoutineDraft → workoutRepo.createRoutine → toast +
//      router.replace back to training index, passing highlightRoutineId
//      so the new card flashes briefly.
//
// Custom-creation defaults: bulk-created exercises get muscle_group =
// the first muscle in targetMuscles (the user's filter from the
// generation screen), or 'full_body' if none survived. nameJa = the
// raw slug — cheap and stable; future Settings UI will let users
// rename. Per Phase 6 Q4 sign-off: skip the slug→katakana helper as
// yak-shaving; users edit the name later if they care.

type ResolutionMap = Map<string, SlugResolution>;

// Extract every slug referenced anywhere in the program.
function collectAllSlugs(weeks: { days: { blocks: { exerciseSlug: string }[] }[] }[]): string[] {
  const seen = new Set<string>();
  for (const w of weeks) {
    for (const d of w.days) {
      for (const b of d.blocks) seen.add(b.exerciseSlug);
    }
  }
  return Array.from(seen);
}

// Pick a sensible default muscle_group for a bulk-created custom
// exercise. Falls back to 'full_body' so the row always lands on a
// valid coarse group even when targetMuscles is somehow empty.
const STRENGTH_MUSCLES: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'full_body',
];
function pickDefaultMuscleGroup(targetMuscles: string[] | null): MuscleGroup {
  if (!targetMuscles || targetMuscles.length === 0) return 'full_body';
  const first = targetMuscles[0];
  return STRENGTH_MUSCLES.includes(first as MuscleGroup)
    ? (first as MuscleGroup)
    : 'full_body';
}

export default function AIMenuPreviewScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);
  const program = useAIMenuStagingStore((s) => s.program);
  const targetMuscles = useAIMenuStagingStore((s) => s.targetMuscles);
  const clearStaging = useAIMenuStagingStore((s) => s.clear);

  const [resolutions, setResolutions] = useState<ResolutionMap | null>(null);
  const [unresolvedDialogVisible, setUnresolvedDialogVisible] = useState(false);
  const [unresolvedHandled, setUnresolvedHandled] = useState(false);
  const [weekIndex, setWeekIndex] = useState(0);
  const [dayIndex, setDayIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
    visible: boolean;
  }>({ message: '', type: 'info', visible: false });

  // Cold-start protection: if a user deep-links into this route or
  // re-enters after the staging store was cleared, redirect back to
  // generation. router.replace fires after first paint to avoid a
  // dispatch-during-render warning.
  useEffect(() => {
    if (!program) {
      const t = setTimeout(() => {
        router.replace('/(tabs)/training/ai-menu');
      }, 0);
      return () => clearTimeout(t);
    }
  }, [program]);

  // Resolve all slugs once, when the program is first available.
  useEffect(() => {
    if (!program) return;
    let cancelled = false;
    (async () => {
      const slugs = collectAllSlugs(program.weeks);
      const map = await resolveSlugsBulk(slugs, workoutRepo.findExerciseBySlug);
      if (cancelled) return;
      setResolutions(map);
      const hasUnresolved = Array.from(map.values()).some(
        (r) => r.kind === 'needs_custom',
      );
      if (hasUnresolved) {
        setUnresolvedDialogVisible(true);
      } else {
        setUnresolvedHandled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [program]);

  // Clear the staging store on screen leave so a back-tap from training
  // index doesn't re-show this screen with stale state.
  useEffect(() => {
    return () => {
      clearStaging();
    };
  }, [clearStaging]);

  const unresolvedSlugs = useMemo(() => {
    if (!resolutions) return [];
    const out: string[] = [];
    for (const [slug, r] of resolutions) {
      if (r.kind === 'needs_custom') out.push(slug);
    }
    return out;
  }, [resolutions]);

  const currentWeek = program?.weeks[weekIndex];
  const currentDay = currentWeek?.days[dayIndex];

  const previewDraft = useMemo(() => {
    if (!program || !resolutions || !unresolvedHandled) return null;
    return convertToRoutineDraft(program, weekIndex, dayIndex, resolutions);
  }, [program, resolutions, unresolvedHandled, weekIndex, dayIndex]);

  // When the week changes, snap day back to 0 if the new week has
  // fewer days than the previous selection.
  useEffect(() => {
    if (!currentWeek) return;
    if (dayIndex >= currentWeek.days.length) setDayIndex(0);
  }, [currentWeek, dayIndex]);

  const handleAddAllAsCustom = useCallback(async () => {
    if (!resolutions) return;
    const defaultGroup = pickDefaultMuscleGroup(targetMuscles);
    const next: ResolutionMap = new Map(resolutions);
    try {
      for (const [slug, r] of resolutions) {
        if (r.kind !== 'needs_custom') continue;
        const exercise = await workoutRepo.createCustomExercise(
          slug,
          defaultGroup,
          null,
          'strength',
          null,
        );
        next.set(slug, { kind: 'matched', exercise });
      }
      setResolutions(next);
      setUnresolvedDialogVisible(false);
      setUnresolvedHandled(true);
      setToast({
        message: `${unresolvedSlugs.length} 件をカスタム種目として追加しました`,
        type: 'success',
        visible: true,
      });
    } catch {
      setToast({
        message: 'カスタム種目の作成に失敗しました',
        type: 'error',
        visible: true,
      });
    }
  }, [resolutions, targetMuscles, unresolvedSlugs.length]);

  const handleSkipUnresolved = useCallback(() => {
    setUnresolvedDialogVisible(false);
    setUnresolvedHandled(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!profile?.id || !program || !previewDraft) return;
    if (previewDraft.draft.items.length === 0) {
      setToast({
        message: '保存できる種目がありません',
        type: 'error',
        visible: true,
      });
      return;
    }
    setSaving(true);
    try {
      const routine = await workoutRepo.createRoutine(
        profile.id,
        previewDraft.draft.name,
        previewDraft.draft.items.map((it) => ({
          exerciseId: it.exercise.id,
          targetSets: it.targetSets,
          targetReps: it.targetReps,
          setPattern: it.setPattern,
          patternConfig: it.patternConfig,
        })),
      );
      router.replace({
        pathname: '/(tabs)/training',
        params: { highlightRoutineId: routine.id },
      });
    } catch {
      setToast({
        message: 'ルーティンの保存に失敗しました',
        type: 'error',
        visible: true,
      });
      setSaving(false);
    }
  }, [profile?.id, program, previewDraft]);

  if (!program) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.background }]}
        edges={['top']}
      />
    );
  }

  const numWeeks = program.weeks.length;
  const numDays = currentWeek?.days.length ?? 0;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          メニュープレビュー
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Program meta card */}
        <Card>
          <Text style={[styles.programName, { color: colors.textPrimary }]}>
            {program.programName}
          </Text>
          <Text style={[styles.programMeta, { color: colors.textTertiary }]}>
            {program.durationWeeks}週間 ・ {program.splitType}
          </Text>
        </Card>

        {/* Week tab strip */}
        <View>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            週を選択
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabRow}
          >
            {Array.from({ length: numWeeks }).map((_, i) => {
              const selected = i === weekIndex;
              const w = program.weeks[i];
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.weekTab,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surfaceSecondary,
                      borderRadius: radius.md,
                    },
                  ]}
                  onPress={() => setWeekIndex(i)}
                >
                  <Text
                    style={[
                      styles.weekTabText,
                      { color: selected ? '#FFFFFF' : colors.textSecondary },
                    ]}
                  >
                    Week {i + 1}
                  </Text>
                  {w.deload && (
                    <Text
                      style={[
                        styles.deloadBadge,
                        { color: selected ? '#FFFFFF' : colors.textTertiary },
                      ]}
                    >
                      deload
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Day chip strip */}
        <View>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            日を選択
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabRow}
          >
            {Array.from({ length: numDays }).map((_, i) => {
              const selected = i === dayIndex;
              const d = currentWeek?.days[i];
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.dayChip,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surfaceSecondary,
                      borderRadius: radius.full,
                    },
                  ]}
                  onPress={() => setDayIndex(i)}
                >
                  <Text
                    style={[
                      styles.dayChipText,
                      { color: selected ? '#FFFFFF' : colors.textSecondary },
                    ]}
                  >
                    {d?.dayLabel ?? `Day ${i + 1}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Preview pane */}
        <Card>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            プレビュー（保存後に編集可能）
          </Text>
          {!unresolvedHandled ? (
            <Text style={[styles.helperText, { color: colors.textTertiary }]}>
              種目を解決中...
            </Text>
          ) : !previewDraft ? (
            <Text style={[styles.helperText, { color: colors.textTertiary }]}>
              この日のメニューは取得できませんでした
            </Text>
          ) : previewDraft.draft.items.length === 0 ? (
            <Text style={[styles.helperText, { color: colors.textTertiary }]}>
              この日のメニューは空です（全てスキップ済み）
            </Text>
          ) : (
            previewDraft.draft.items.map((item, i) => {
              const block = currentDay?.blocks.find(
                (b) => resolutions?.get(b.exerciseSlug)?.kind === 'matched'
                  && (resolutions?.get(b.exerciseSlug) as { exercise: { id: string } } | undefined)?.exercise.id === item.exercise.id,
              );
              return (
                <View
                  key={`${item.exercise.id}-${i}`}
                  style={[
                    styles.previewRow,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <Text
                    style={[styles.itemName, { color: colors.textPrimary }]}
                  >
                    {item.exercise.nameJa}
                  </Text>
                  <Text
                    style={[styles.itemMeta, { color: colors.textTertiary }]}
                  >
                    {item.targetSets}セット ・ {item.targetReps}回
                    {block && ` ・ RPE ${block.targetRPE} ・ rest ${block.restSeconds}s`}
                  </Text>
                  {block?.notes ? (
                    <Text
                      style={[
                        styles.itemNotes,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {block.notes}
                    </Text>
                  ) : null}
                </View>
              );
            })
          )}
        </Card>

        {/* Routine name preview */}
        {previewDraft && (
          <Text style={[styles.helperText, { color: colors.textTertiary }]}>
            保存名: {previewDraft.draft.name}
          </Text>
        )}

        <Button
          title={saving ? '保存中...' : '保存してルーティン一覧へ'}
          onPress={handleSave}
          variant="primary"
          fullWidth
          disabled={
            saving ||
            !unresolvedHandled ||
            !previewDraft ||
            previewDraft.draft.items.length === 0
          }
        />
      </ScrollView>

      {/* Unresolved-slug bulk dialog. Shown once on first resolve. */}
      <Modal
        visible={unresolvedDialogVisible}
        onClose={handleSkipUnresolved}
        title="未登録の種目があります"
      >
        <View style={styles.modalContent}>
          <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
            AI が以下の種目を提案しましたが、種目データベースに見つかりませんでした:
          </Text>
          <ScrollView style={styles.unresolvedList}>
            {unresolvedSlugs.map((slug) => (
              <Text
                key={slug}
                style={[styles.unresolvedItem, { color: colors.textPrimary }]}
              >
                ・ {slug}
              </Text>
            ))}
          </ScrollView>
          <Text style={[styles.modalHint, { color: colors.textTertiary }]}>
            ※ カスタム追加した種目は、後から名前や部位を編集できます。
          </Text>
          <View style={styles.modalActions}>
            <Button
              title="スキップ"
              onPress={handleSkipUnresolved}
              variant="ghost"
              size="md"
            />
            <Button
              title="全てカスタム追加"
              onPress={handleAddAllAsCustom}
              variant="primary"
              size="md"
            />
          </View>
        </View>
      </Modal>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />
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
    paddingVertical: spacing.sm,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { ...typography.titleMedium, flex: 1, textAlign: 'center' },
  scroll: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxxl,
  },
  programName: { ...typography.titleMedium },
  programMeta: { ...typography.bodySmall, marginTop: spacing.xs },
  sectionLabel: { ...typography.labelMedium, marginBottom: spacing.sm },
  tabRow: { gap: spacing.sm, paddingRight: spacing.lg },
  weekTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 84,
    alignItems: 'center',
  },
  weekTabText: { ...typography.labelMedium },
  deloadBadge: { ...typography.labelSmall, fontSize: 10, marginTop: 2 },
  dayChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  dayChipText: { ...typography.labelMedium },
  previewRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  itemName: { ...typography.bodyMedium },
  itemMeta: { ...typography.bodySmall },
  itemNotes: { ...typography.bodySmall, fontStyle: 'italic' },
  helperText: { ...typography.bodySmall, textAlign: 'center', paddingVertical: spacing.md },
  modalContent: { gap: spacing.md },
  modalBody: { ...typography.bodyMedium },
  unresolvedList: { maxHeight: 160 },
  unresolvedItem: { ...typography.bodySmall, paddingVertical: 2 },
  modalHint: { ...typography.bodySmall },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.md,
  },
});
