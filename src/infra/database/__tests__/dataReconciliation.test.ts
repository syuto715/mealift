import type { SQLiteDatabase, SQLiteRunResult } from 'expo-sqlite';
import { claimLocalDataForUser } from '../dataReconciliation';

// In-memory fake DB tailored to the SQL claimLocalDataForUser emits.
// Pattern follows userSubmittedFoodRepository.test.ts: pattern-match SQL
// strings, mutate an in-memory rows array per table.
//
// Transactions are simulated with a snapshot taken at BEGIN and restored
// on ROLLBACK, so tests can verify failure paths leave the DB unchanged.

interface FakeRow {
  [column: string]: unknown;
}

interface FakeTable {
  rows: FakeRow[];
}

interface FakeDbState {
  tables: Record<string, FakeTable>;
  inTransaction: boolean;
  snapshot: Record<string, FakeRow[]> | null;
}

function makeFakeDb(initialState: Record<string, FakeRow[]>): {
  db: SQLiteDatabase;
  state: FakeDbState;
} {
  const state: FakeDbState = {
    tables: {},
    inTransaction: false,
    snapshot: null,
  };
  for (const [name, rows] of Object.entries(initialState)) {
    state.tables[name] = { rows: rows.map((r) => ({ ...r })) };
  }

  const db = {
    execAsync: async (sql: string): Promise<void> => {
      const trimmed = sql.trim();
      if (/^BEGIN\b/i.test(trimmed)) {
        state.inTransaction = true;
        state.snapshot = {};
        for (const [name, t] of Object.entries(state.tables)) {
          state.snapshot[name] = t.rows.map((r) => ({ ...r }));
        }
        return;
      }
      if (/^COMMIT\b/i.test(trimmed)) {
        state.inTransaction = false;
        state.snapshot = null;
        return;
      }
      if (/^ROLLBACK\b/i.test(trimmed)) {
        if (state.snapshot) {
          for (const [name, snap] of Object.entries(state.snapshot)) {
            if (state.tables[name]) {
              state.tables[name].rows = snap.map((r) => ({ ...r }));
            }
          }
        }
        state.inTransaction = false;
        state.snapshot = null;
        return;
      }
      if (/^PRAGMA\b/i.test(trimmed)) {
        // No-op in the fake — defer_foreign_keys etc.
        return;
      }
      throw new Error(`fake DB: unhandled execAsync SQL: ${sql}`);
    },

    getFirstAsync: async <T,>(
      sql: string,
      _params?: unknown[],
    ): Promise<T | null> => {
      if (
        /SELECT id, supabase_uid FROM profiles LIMIT 1/i.test(sql.trim())
      ) {
        const profile = state.tables.profiles?.rows[0];
        if (!profile) return null;
        return {
          id: profile.id,
          supabase_uid: profile.supabase_uid,
        } as unknown as T;
      }
      throw new Error(`fake DB: unhandled getFirstAsync SQL: ${sql}`);
    },

    runAsync: async (
      sql: string,
      params?: unknown[],
    ): Promise<SQLiteRunResult> => {
      // UPDATE profiles SET id = ?, supabase_uid = ?, updated_at = datetime('now') WHERE id = ?
      const profileMatch = sql.match(
        /^\s*UPDATE profiles\s+SET id = \?, supabase_uid = \?, updated_at = datetime\('now'\)\s+WHERE id = \?/i,
      );
      if (profileMatch) {
        const [newId, newUid, oldId] = params as [string, string, string];
        const profile = state.tables.profiles?.rows.find(
          (r) => r.id === oldId,
        );
        if (!profile) return { changes: 0, lastInsertRowId: 0 };
        profile.id = newId;
        profile.supabase_uid = newUid;
        profile.updated_at = 'now-fake';
        return { changes: 1, lastInsertRowId: 0 };
      }

      // UPDATE <table> SET profile_id = ?, updated_at = datetime('now') WHERE profile_id = ?
      const childProfileMatch = sql.match(
        /^\s*UPDATE (\w+)\s+SET profile_id = \?, updated_at = datetime\('now'\)\s+WHERE profile_id = \?/i,
      );
      if (childProfileMatch) {
        const tableName = childProfileMatch[1];
        const [newId, oldId] = params as [string, string];
        const t = state.tables[tableName];
        if (!t) return { changes: 0, lastInsertRowId: 0 };
        let changes = 0;
        for (const row of t.rows) {
          if (row.profile_id === oldId) {
            row.profile_id = newId;
            row.updated_at = 'now-fake';
            changes++;
          }
        }
        return { changes, lastInsertRowId: 0 };
      }

      // UPDATE <table> SET user_id = ?, updated_at = datetime('now') WHERE user_id = ?
      const childUserMatch = sql.match(
        /^\s*UPDATE (\w+)\s+SET user_id = \?, updated_at = datetime\('now'\)\s+WHERE user_id = \?/i,
      );
      if (childUserMatch) {
        const tableName = childUserMatch[1];
        const [newId, oldId] = params as [string, string];
        const t = state.tables[tableName];
        if (!t) return { changes: 0, lastInsertRowId: 0 };
        let changes = 0;
        for (const row of t.rows) {
          if (row.user_id === oldId) {
            row.user_id = newId;
            row.updated_at = 'now-fake';
            changes++;
          }
        }
        return { changes, lastInsertRowId: 0 };
      }

      throw new Error(`fake DB: unhandled runAsync SQL: ${sql}`);
    },

    getAllAsync: async (): Promise<unknown[]> => {
      throw new Error('fake DB: getAllAsync not used by claimLocalDataForUser');
    },
  };

  return { db: db as unknown as SQLiteDatabase, state };
}

describe('claimLocalDataForUser', () => {
  describe('detection branches', () => {
    it('returns no_profile when profiles table is empty', async () => {
      const { db } = makeFakeDb({ profiles: [] });
      const result = await claimLocalDataForUser(db, 'auth-uid-1');
      expect(result).toEqual({ kind: 'no_profile' });
    });

    it('returns already_claimed_same_uid when supabase_uid matches authUid', async () => {
      const { db } = makeFakeDb({
        profiles: [{ id: 'auth-uid-1', supabase_uid: 'auth-uid-1' }],
      });
      const result = await claimLocalDataForUser(db, 'auth-uid-1');
      expect(result).toEqual({ kind: 'already_claimed_same_uid' });
    });

    it('returns conflict_different_uid when supabase_uid is set to a different uid', async () => {
      const { db } = makeFakeDb({
        profiles: [
          { id: 'profile-1', supabase_uid: 'auth-uid-other' },
        ],
      });
      const result = await claimLocalDataForUser(db, 'auth-uid-1');
      expect(result).toEqual({
        kind: 'conflict_different_uid',
        existingUid: 'auth-uid-other',
      });
    });

    it('does NOT mutate any rows when conflict_different_uid', async () => {
      const { db, state } = makeFakeDb({
        profiles: [{ id: 'profile-1', supabase_uid: 'auth-uid-other' }],
        body_logs: [{ id: 'b1', profile_id: 'profile-1' }],
      });
      await claimLocalDataForUser(db, 'auth-uid-1');
      expect(state.tables.profiles.rows[0].id).toBe('profile-1');
      expect(state.tables.profiles.rows[0].supabase_uid).toBe(
        'auth-uid-other',
      );
      expect(state.tables.body_logs.rows[0].profile_id).toBe('profile-1');
    });
  });

  describe('remap behavior', () => {
    it('remaps a fresh local profile (supabase_uid IS NULL)', async () => {
      const { db, state } = makeFakeDb({
        profiles: [{ id: 'local-uuid-1', supabase_uid: null }],
        body_logs: [
          { id: 'b1', profile_id: 'local-uuid-1' },
          { id: 'b2', profile_id: 'local-uuid-1' },
        ],
      });
      const result = await claimLocalDataForUser(db, 'auth-uid-1');
      expect(result.kind).toBe('remapped');
      if (result.kind === 'remapped') {
        expect(result.oldId).toBe('local-uuid-1');
        // 1 profile + 2 body_logs
        expect(result.rowsAffected).toBe(3);
      }
      expect(state.tables.profiles.rows[0].id).toBe('auth-uid-1');
      expect(state.tables.profiles.rows[0].supabase_uid).toBe('auth-uid-1');
      expect(state.tables.body_logs.rows[0].profile_id).toBe('auth-uid-1');
      expect(state.tables.body_logs.rows[1].profile_id).toBe('auth-uid-1');
    });

    it('only remaps rows whose profile_id matches oldId — unrelated rows untouched', async () => {
      const { db, state } = makeFakeDb({
        profiles: [{ id: 'local-uuid-1', supabase_uid: null }],
        body_logs: [
          { id: 'b1', profile_id: 'local-uuid-1' },
          { id: 'b2', profile_id: 'orphan-id' }, // unrelated
        ],
      });
      await claimLocalDataForUser(db, 'auth-uid-1');
      expect(state.tables.body_logs.rows[0].profile_id).toBe('auth-uid-1');
      expect(state.tables.body_logs.rows[1].profile_id).toBe('orphan-id');
    });

    it('handles all 8 profile_id child tables in one transaction', async () => {
      const childTables = [
        'body_logs',
        'workout_routines',
        'workout_sessions',
        'meal_logs',
        'notes',
        'meal_templates',
        'weekly_reports',
        'progress_photos',
      ];
      const init: Record<string, FakeRow[]> = {
        profiles: [{ id: 'old', supabase_uid: null }],
      };
      for (const t of childTables) {
        init[t] = [{ id: `${t}-1`, profile_id: 'old' }];
      }
      const { db, state } = makeFakeDb(init);
      const result = await claimLocalDataForUser(db, 'new');
      expect(result.kind).toBe('remapped');
      if (result.kind === 'remapped') {
        // 1 profile + 8 child rows
        expect(result.rowsAffected).toBe(9);
      }
      for (const t of childTables) {
        expect(state.tables[t].rows[0].profile_id).toBe('new');
      }
    });

    it('handles all 3 user_id child tables', async () => {
      const userTables = [
        'personal_records',
        'water_logs',
        'adaptive_goal_suggestions',
      ];
      const init: Record<string, FakeRow[]> = {
        profiles: [{ id: 'old', supabase_uid: null }],
      };
      for (const t of userTables) {
        init[t] = [{ id: `${t}-1`, user_id: 'old' }];
      }
      const { db, state } = makeFakeDb(init);
      const result = await claimLocalDataForUser(db, 'new');
      expect(result.kind).toBe('remapped');
      if (result.kind === 'remapped') {
        // 1 profile + 3 user_id rows
        expect(result.rowsAffected).toBe(4);
      }
      for (const t of userTables) {
        expect(state.tables[t].rows[0].user_id).toBe('new');
      }
    });

    it('updates updated_at on every modified row', async () => {
      const { db, state } = makeFakeDb({
        profiles: [{ id: 'old', supabase_uid: null }],
        body_logs: [
          {
            id: 'b1',
            profile_id: 'old',
            updated_at: 'old-timestamp',
          },
        ],
      });
      await claimLocalDataForUser(db, 'new');
      expect(state.tables.profiles.rows[0].updated_at).toBe('now-fake');
      expect(state.tables.body_logs.rows[0].updated_at).toBe('now-fake');
    });
  });

  describe('idempotency', () => {
    it('a second call after a successful remap is a no-op', async () => {
      const { db, state } = makeFakeDb({
        profiles: [{ id: 'local', supabase_uid: null }],
        body_logs: [{ id: 'b1', profile_id: 'local' }],
      });
      const first = await claimLocalDataForUser(db, 'new');
      expect(first.kind).toBe('remapped');

      const second = await claimLocalDataForUser(db, 'new');
      expect(second.kind).toBe('already_claimed_same_uid');

      // State unchanged on second call
      expect(state.tables.profiles.rows[0].id).toBe('new');
      expect(state.tables.body_logs.rows[0].profile_id).toBe('new');
    });
  });
});
