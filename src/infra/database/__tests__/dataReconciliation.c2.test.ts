// v1.6.1 — claimLocalDataForUser C-2 remap, exercised against REAL SQLite
// (node:sqlite) via a thin expo-sqlite-shaped shim. Pins the fix: the three
// previously-missed profile_id tables (estimated_1rm, user_equipment,
// deload_recommendations) are remapped to authUid on first claim, so
// local-mode-first data is not stranded after Apple Sign In.

import { DatabaseSync } from 'node:sqlite';
import { claimLocalDataForUser } from '../dataReconciliation';

function shim(db: DatabaseSync) {
  return {
    getFirstAsync: async (sql: string, params: unknown[] = []) =>
      (db.prepare(sql).get(...(params as never[])) as unknown) ?? null,
    getAllAsync: async (sql: string, params: unknown[] = []) =>
      db.prepare(sql).all(...(params as never[])) as unknown[],
    runAsync: async (sql: string, params: unknown[] = []) => {
      const r = db.prepare(sql).run(...(params as never[]));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    execAsync: async (sql: string) => {
      db.exec(sql);
    },
  } as never;
}

function freshDb(supabaseUid: string | null): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE profiles (id TEXT PRIMARY KEY, supabase_uid TEXT, updated_at TEXT);
    CREATE TABLE body_logs (id TEXT PRIMARY KEY, profile_id TEXT, updated_at TEXT);
    CREATE TABLE estimated_1rm (id TEXT PRIMARY KEY, profile_id TEXT, updated_at TEXT);
    CREATE TABLE user_equipment (id TEXT PRIMARY KEY, profile_id TEXT, updated_at TEXT);
    CREATE TABLE deload_recommendations (id TEXT PRIMARY KEY, profile_id TEXT, updated_at TEXT);
    CREATE TABLE workout_routines (id TEXT PRIMARY KEY, profile_id TEXT, updated_at TEXT);
    CREATE TABLE workout_sessions (id TEXT PRIMARY KEY, profile_id TEXT, updated_at TEXT);
    CREATE TABLE meal_logs (id TEXT PRIMARY KEY, profile_id TEXT, updated_at TEXT);
    CREATE TABLE notes (id TEXT PRIMARY KEY, profile_id TEXT, updated_at TEXT);
    CREATE TABLE meal_templates (id TEXT PRIMARY KEY, profile_id TEXT, updated_at TEXT);
    CREATE TABLE weekly_reports (id TEXT PRIMARY KEY, profile_id TEXT, updated_at TEXT);
    CREATE TABLE progress_photos (id TEXT PRIMARY KEY, profile_id TEXT, updated_at TEXT);
    CREATE TABLE personal_records (id TEXT PRIMARY KEY, user_id TEXT, updated_at TEXT);
    CREATE TABLE water_logs (id TEXT PRIMARY KEY, user_id TEXT, updated_at TEXT);
    CREATE TABLE adaptive_goal_suggestions (id TEXT PRIMARY KEY, user_id TEXT, updated_at TEXT);
  `);
  db.prepare(`INSERT INTO profiles (id, supabase_uid) VALUES ('local-uuid', ?)`).run(supabaseUid);
  for (const t of ['body_logs', 'estimated_1rm', 'user_equipment', 'deload_recommendations', 'workout_routines', 'workout_sessions', 'meal_logs', 'notes', 'meal_templates', 'weekly_reports', 'progress_photos']) {
    db.prepare(`INSERT INTO ${t} (id, profile_id) VALUES ('r-${t}', 'local-uuid')`).run();
  }
  for (const t of ['personal_records', 'water_logs', 'adaptive_goal_suggestions']) {
    db.prepare(`INSERT INTO ${t} (id, user_id) VALUES ('r-${t}', 'local-uuid')`).run();
  }
  return db;
}

describe('claimLocalDataForUser — C-2 remap (v1.6.1)', () => {
  it('remaps the 3 previously-missed profile_id tables to authUid', async () => {
    const db = freshDb(null);
    const res = await claimLocalDataForUser(shim(db), 'auth-uid');
    expect(res.kind).toBe('remapped');
    expect((db.prepare(`SELECT id FROM profiles`).get() as { id: string }).id).toBe('auth-uid');
    for (const t of ['estimated_1rm', 'user_equipment', 'deload_recommendations']) {
      expect((db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE profile_id='local-uuid'`).get() as { c: number }).c).toBe(0);
      expect((db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE profile_id='auth-uid'`).get() as { c: number }).c).toBe(1);
    }
    db.close();
  });

  it('still remaps original profile_id + user_id tables (no regression)', async () => {
    const db = freshDb(null);
    await claimLocalDataForUser(shim(db), 'auth-uid');
    for (const t of ['body_logs', 'weekly_reports', 'progress_photos']) {
      expect((db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE profile_id='auth-uid'`).get() as { c: number }).c).toBe(1);
    }
    for (const t of ['personal_records', 'water_logs', 'adaptive_goal_suggestions']) {
      expect((db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE user_id='auth-uid'`).get() as { c: number }).c).toBe(1);
    }
    db.close();
  });

  it('is idempotent when already claimed to the same uid', async () => {
    const db = freshDb('auth-uid');
    expect((await claimLocalDataForUser(shim(db), 'auth-uid')).kind).toBe('already_claimed_same_uid');
    db.close();
  });

  it('refuses to remap when claimed to a different uid (data untouched)', async () => {
    const db = freshDb('other-uid');
    expect((await claimLocalDataForUser(shim(db), 'auth-uid')).kind).toBe('conflict_different_uid');
    expect((db.prepare(`SELECT COUNT(*) c FROM estimated_1rm WHERE profile_id='local-uuid'`).get() as { c: number }).c).toBe(1);
    db.close();
  });
});
