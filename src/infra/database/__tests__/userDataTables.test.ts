// v1.6.0 Sprint 6 — drift guard for the local wipe classification.
//
// Account deletion / local reset wipe USER_DATA_TABLES and preserve
// REFERENCE_TABLES. If a future migration adds a new local table, it MUST be
// classified into exactly one of the two lists; otherwise this test fails,
// preventing the pre-v1.6 bug class (meal_logs / water_logs / chat /
// coach_advice silently left behind by an incomplete wipe list).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { USER_DATA_TABLES, REFERENCE_TABLES } from '../userDataTables';

function migrationTables(): string[] {
  const dir = path.resolve(__dirname, '..', 'migrations');
  const names = new Set<string>();
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const re = /create\s+table\s+if\s+not\s+exists\s+([a-z_0-9]+)\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) names.add(m[1].toLowerCase());
  }
  return [...names];
}

describe('local wipe table classification (drift guard)', () => {
  const tables = migrationTables();
  const userSet = new Set(USER_DATA_TABLES);
  const refSet = new Set(REFERENCE_TABLES);

  it('extracts a sane number of tables from migrations', () => {
    expect(tables.length).toBeGreaterThan(30);
  });

  it('every migration table is classified as USER or REFERENCE (no drift)', () => {
    const unclassified = tables.filter((t) => !userSet.has(t) && !refSet.has(t));
    expect(unclassified).toEqual([]);
  });

  it('USER and REFERENCE lists are disjoint', () => {
    const overlap = USER_DATA_TABLES.filter((t) => refSet.has(t));
    expect(overlap).toEqual([]);
  });

  it('no list entry is a phantom (every listed table actually exists in migrations)', () => {
    const known = new Set(tables);
    const phantomUser = USER_DATA_TABLES.filter((t) => !known.has(t));
    const phantomRef = REFERENCE_TABLES.filter((t) => !known.has(t));
    expect({ phantomUser, phantomRef }).toEqual({
      phantomUser: [],
      phantomRef: [],
    });
  });

  it('profiles is wiped last (parent ordering) and is in the USER list', () => {
    expect(userSet.has('profiles')).toBe(true);
    expect(USER_DATA_TABLES[USER_DATA_TABLES.length - 1]).toBe('profiles');
  });

  it('regression: tables missed by the pre-v1.6 wipe are now covered', () => {
    for (const t of [
      'meal_logs',
      'water_logs',
      'personal_records',
      'weekly_reports',
      'chat_messages_local',
      'chat_conversations_local',
      'coach_advice_local',
    ]) {
      expect(userSet.has(t)).toBe(true);
    }
  });

  it('reference seed tables are preserved (not wiped)', () => {
    for (const t of ['foods', 'exercises', 'search_index']) {
      expect(refSet.has(t)).toBe(true);
      expect(userSet.has(t)).toBe(false);
    }
  });
});

// Mirrors wipeUserData's foods/exercises partial-wipe (real SQLite). The full
// wipeUserData needs expo-sqlite; here we pin the mixed-table semantics that
// the Codex Sprint 6 Critical was about: custom rows go, seed rows stay (with
// per-user state reset).
describe('foods/exercises partial wipe (behavioral)', () => {
  function db(): DatabaseSync {
    const d = new DatabaseSync(':memory:');
    d.exec(
      `CREATE TABLE foods (id TEXT PRIMARY KEY, is_custom INTEGER DEFAULT 0,
         is_favorite INTEGER DEFAULT 0, use_count INTEGER DEFAULT 0,
         is_user_added INTEGER DEFAULT 0);
       CREATE TABLE exercises (id TEXT PRIMARY KEY, is_custom INTEGER DEFAULT 0);`,
    );
    return d;
  }
  const wipeFoodsExercises = (d: DatabaseSync) => {
    d.exec(`DELETE FROM foods WHERE is_custom = 1`);
    d.exec(`UPDATE foods SET is_favorite = 0, use_count = 0, is_user_added = 0`);
    d.exec(`DELETE FROM exercises WHERE is_custom = 1`);
  };

  it('deletes custom foods/exercises, keeps seed rows, resets per-user state', () => {
    const d = db();
    d.exec(`INSERT INTO foods VALUES ('seed', 0, 1, 9, 1)`); // seed + favorited/used
    d.exec(`INSERT INTO foods VALUES ('mine', 1, 0, 0, 0)`); // user custom
    d.exec(`INSERT INTO exercises VALUES ('seed-ex', 0)`);
    d.exec(`INSERT INTO exercises VALUES ('mine-ex', 1)`);

    wipeFoodsExercises(d);

    const foods = d.prepare(`SELECT id, is_favorite, use_count, is_user_added FROM foods`).all() as Array<{ id: string; is_favorite: number; use_count: number; is_user_added: number }>;
    expect(foods.map((f) => f.id)).toEqual(['seed']); // custom gone, seed kept
    expect(foods[0]).toMatchObject({ is_favorite: 0, use_count: 0, is_user_added: 0 }); // state reset
    const ex = (d.prepare(`SELECT id FROM exercises`).all() as Array<{ id: string }>).map((e) => e.id);
    expect(ex).toEqual(['seed-ex']);
    d.close();
  });
});

// Audit B-16 — barcode_foods is the same MIXED-table shape as foods/exercises:
// only source='preset' rows are seeded; scanned/manual rows must be wiped so a
// prior account's products don't linger after account deletion / local reset.
describe('barcode_foods partial wipe (behavioral, audit B-16)', () => {
  function db(): DatabaseSync {
    const d = new DatabaseSync(':memory:');
    d.exec(
      `CREATE TABLE barcode_foods (id TEXT PRIMARY KEY, source TEXT);`,
    );
    return d;
  }
  const wipeBarcodeFoods = (d: DatabaseSync) => {
    d.exec(`DELETE FROM barcode_foods WHERE source != 'preset'`);
  };

  it("deletes user-scanned/manual rows, keeps source='preset' seed rows", () => {
    const d = db();
    d.exec(`INSERT INTO barcode_foods VALUES ('p1', 'preset')`);
    d.exec(`INSERT INTO barcode_foods VALUES ('u1', 'manual')`);
    d.exec(`INSERT INTO barcode_foods VALUES ('u2', 'openfoodfacts')`);

    wipeBarcodeFoods(d);

    const rows = (d.prepare(`SELECT id FROM barcode_foods`).all() as Array<{ id: string }>).map((r) => r.id);
    expect(rows).toEqual(['p1']);
    d.close();
  });
});
