import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateV30 } from '../v30';

// v1.3.0 / Onboarding v2 / Phase A-1 — migration shape pinning.
//
// First migration in the codebase to ship a unit test (precedent
// previously was "test through the eventual repo / domain code").
// The Onboarding v2 schema lands ahead of any consumer, so the
// migration shape is the only contract testable at this commit;
// pinning it now catches an off-by-one column rename or type drift
// that would otherwise survive until Phase A-3 / A-4 repo writes
// land.
//
// Mirror Phase 2.1 / 6.1 SQL contract pin convention: assert on the
// emitted SQL strings rather than running a real SQLite engine. The
// fake DB models PRAGMA table_info() for idempotency tests.

interface MockDbState {
  executedSql: string[];
  existingColumns: Set<string>;
}

function makeMockDb(initialColumns: string[] = []) {
  const state: MockDbState = {
    executedSql: [],
    existingColumns: new Set(initialColumns),
  };
  const db = {
    state,
    execAsync: async (sql: string) => {
      state.executedSql.push(sql);
      const m = sql.match(/ALTER TABLE profiles ADD COLUMN (\w+)/);
      if (m) state.existingColumns.add(m[1]);
    },
    getAllAsync: async (sql: string) => {
      if (sql.includes('PRAGMA table_info')) {
        return Array.from(state.existingColumns).map((name) => ({ name }));
      }
      return [];
    },
  };
  return db;
}

const ALL_NEW_COLUMNS = [
  'nickname',
  'weekly_rate_pct',
  'meal_plan',
  'meal_timings',
  'protein_factor',
  'weekly_distribution',
  'cheat_days',
  'onboarding_step',
  'onboarding_started_at',
  'estimated_target_date',
];

describe('migrateV30 — column shape', () => {
  it('adds exactly the 10 documented columns on a fresh profiles table', async () => {
    const db = makeMockDb();
    await migrateV30(db as unknown as SQLiteDatabase);
    for (const col of ALL_NEW_COLUMNS) {
      expect(
        db.state.executedSql.some((s) =>
          new RegExp(`ADD COLUMN ${col}\\b`).test(s),
        ),
      ).toBe(true);
    }
    // 10 ALTERs total — no surprise extras.
    const alterCount = db.state.executedSql.filter((s) =>
      s.startsWith('ALTER TABLE profiles ADD COLUMN'),
    ).length;
    expect(alterCount).toBe(10);
  });

  it('weekly_rate_pct + protein_factor stored as REAL (numeric domain)', async () => {
    const db = makeMockDb();
    await migrateV30(db as unknown as SQLiteDatabase);
    expect(
      db.state.executedSql.some((s) => /weekly_rate_pct\s+REAL/.test(s)),
    ).toBe(true);
    expect(
      db.state.executedSql.some((s) => /protein_factor\s+REAL/.test(s)),
    ).toBe(true);
  });

  it('date columns stored as TEXT (ISO 8601 codebase convention, NOT INTEGER)', async () => {
    // Phase 6.1's UTC-ISO regex defense pattern relies on date columns
    // returning ISO strings, not Unix timestamps. Pin the choice so
    // a future migration drift to INTEGER is caught.
    const db = makeMockDb();
    await migrateV30(db as unknown as SQLiteDatabase);
    expect(
      db.state.executedSql.some((s) =>
        /onboarding_started_at\s+TEXT/.test(s),
      ),
    ).toBe(true);
    expect(
      db.state.executedSql.some((s) =>
        /estimated_target_date\s+TEXT/.test(s),
      ),
    ).toBe(true);
  });

  it('JSON-array columns stored as TEXT (parsed app-side)', async () => {
    const db = makeMockDb();
    await migrateV30(db as unknown as SQLiteDatabase);
    expect(
      db.state.executedSql.some((s) => /meal_timings\s+TEXT/.test(s)),
    ).toBe(true);
    expect(
      db.state.executedSql.some((s) => /cheat_days\s+TEXT/.test(s)),
    ).toBe(true);
  });

  it('onboarding_step is INTEGER with DEFAULT 0', async () => {
    const db = makeMockDb();
    await migrateV30(db as unknown as SQLiteDatabase);
    expect(
      db.state.executedSql.some((s) =>
        /onboarding_step\s+INTEGER\s+DEFAULT\s+0/.test(s),
      ),
    ).toBe(true);
  });

  it('does NOT emit CHECK constraints (server-only convention from v26)', async () => {
    // SQLite ALTER TABLE can't add CHECKs to existing columns; the
    // Postgres mirror migration carries them. Pin that no CHECK leaks
    // into the SQLite path.
    const db = makeMockDb();
    await migrateV30(db as unknown as SQLiteDatabase);
    for (const sql of db.state.executedSql) {
      expect(sql).not.toMatch(/\bCHECK\s*\(/i);
    }
  });
});

describe('migrateV30 — idempotency', () => {
  it('emits zero ALTERs when all columns already exist (re-run safety)', async () => {
    const db = makeMockDb(ALL_NEW_COLUMNS);
    await migrateV30(db as unknown as SQLiteDatabase);
    expect(db.state.executedSql).toHaveLength(0);
  });

  it('adds only the missing columns on a partial-state db', async () => {
    // Simulate a database that already has 3 of the 10 columns —
    // could happen if a prior migration run failed mid-way. Re-run
    // should fill in the remaining 7 without touching what's there.
    const db = makeMockDb(['nickname', 'meal_plan', 'protein_factor']);
    await migrateV30(db as unknown as SQLiteDatabase);
    const altered = db.state.executedSql
      .map((s) => s.match(/ADD COLUMN (\w+)/)?.[1])
      .filter((x): x is string => !!x);
    expect(altered.sort()).toEqual(
      ALL_NEW_COLUMNS.filter(
        (c) => !['nickname', 'meal_plan', 'protein_factor'].includes(c),
      ).sort(),
    );
  });
});
