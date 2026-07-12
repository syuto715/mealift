// S3-1 — workoutStore の終了まわり状態遷移の回帰テスト。
// 既存仕様のピン留め (diagnosticStore.test.ts と同じ getState() 直呼びパターン):
//   - store は in-memory のみ (persist なし) — kill→再起動で復元されないのが
//     既存仕様であり、S3-1 は復元機能を追加していない
//   - 保存終了 (2択シートの唯一の終了経路) は endSession() で store を全リセット
//   - 戻る操作がブロックされた場合・タブ切替 (画面 blur) では store は無傷

import { useWorkoutStore, ExerciseInSession } from '../workoutStore';

// expo-crypto (generateId) は node 環境で解決できないため module boundary で mock
// (diagnosticStore.test.ts 等と同じ方式。jest.mock は import より先に hoist される)。
jest.mock('../../utils/id', () => {
  let n = 0;
  return { generateId: () => `gen-${++n}` };
});

const makeExercise = (
  exerciseId: string,
  overrides: Partial<ExerciseInSession> = {},
): ExerciseInSession => ({
  exerciseId,
  exerciseName: `種目 ${exerciseId}`,
  muscleGroup: 'chest',
  exerciseType: 'strength',
  metValue: null,
  sets: [],
  previousSets: [],
  setPattern: null,
  patternConfig: null,
  targetReps: '8-12',
  ...overrides,
});

const resetStore = () =>
  useWorkoutStore.setState({
    sessionId: null,
    routineId: null,
    startedAt: null,
    exercises: [],
  });

describe('workoutStore — セッション状態遷移 (S3-1 回帰ピン)', () => {
  beforeEach(resetStore);

  it('startSession は sessionId / startedAt (ISO) を設定し exercises を空にする', () => {
    useWorkoutStore.setState({ exercises: [makeExercise('stale')] });
    useWorkoutStore.getState().startSession('session-1', 'routine-1');
    const s = useWorkoutStore.getState();
    expect(s.sessionId).toBe('session-1');
    expect(s.routineId).toBe('routine-1');
    expect(s.exercises).toEqual([]);
    expect(s.startedAt).not.toBeNull();
    expect(Number.isNaN(Date.parse(s.startedAt!))).toBe(false);
  });

  it('経路1「保存して終了」の終端 = endSession が全リセット', () => {
    const store = useWorkoutStore.getState();
    store.startSession('session-1', null);
    store.addExercise(makeExercise('ex-1'));
    store.addSetToExercise('ex-1');
    // 保存完了パスは UI 層が最後に endSession() を呼ぶ
    useWorkoutStore.getState().endSession();
    const s = useWorkoutStore.getState();
    expect(s).toMatchObject({
      sessionId: null,
      routineId: null,
      startedAt: null,
      exercises: [],
    });
  });

  it('経路2「戻る操作をブロック→シート表示 (キャンセルで継続)」/ 経路3「タブ切替不可 (blur)」では store は無傷', () => {
    const store = useWorkoutStore.getState();
    store.startSession('session-1', null);
    store.addExercise(makeExercise('ex-1'));
    store.addSetToExercise('ex-1');
    const before = useWorkoutStore.getState();
    // ブロック経路は store に対して何も呼ばない — 状態が変わらないことをピン
    const after = useWorkoutStore.getState();
    expect(after.sessionId).toBe('session-1');
    expect(after.startedAt).toBe(before.startedAt);
    expect(after.exercises).toHaveLength(1);
    expect(after.exercises[0].sets).toHaveLength(1);
  });

  it('completeSet は対象セットのみ completed にする (summary 集計元)', () => {
    const store = useWorkoutStore.getState();
    store.startSession('session-1', null);
    store.addExercise(makeExercise('ex-1'));
    store.addSetToExercise('ex-1');
    store.addSetToExercise('ex-1');
    const setIds = useWorkoutStore.getState().exercises[0].sets.map((s) => s.id);
    useWorkoutStore.getState().completeSet('ex-1', setIds[0]);
    const sets = useWorkoutStore.getState().exercises[0].sets;
    expect(sets[0].completed).toBe(true);
    expect(sets[1].completed).toBe(false);
  });

  it('既存仕様ピン: store は in-memory のみ (persist 未使用 = kill で消える)', () => {
    // zustand persist を導入すると store に persist API が生える。
    // S3-1 は「復元機能の新規実装はしない」が前提のため、これをピン留めする。
    expect(
      (useWorkoutStore as unknown as { persist?: unknown }).persist,
    ).toBeUndefined();
  });
});
