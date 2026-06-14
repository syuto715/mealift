// v1.6.0 Sprint 2 — I-3 clobber guard tests.
//
// Two layers:
//  1. Behavioral (real SQLite via node:sqlite): proves the pull-apply upsert
//     guard `WHERE datetime(excluded.updated_at) > datetime(<tbl>.updated_at)`
//     does NOT overwrite a newer local row with an older server row, DOES
//     apply a newer server row, and inserts brand-new rows — across the
//     mixed datetime formats the codebase actually stores (local
//     `datetime('now')` = 'YYYY-MM-DD HH:MM:SS' vs server ISO 'â€¦T â€¦Z').
//  2. Coverage (static): every *Sync.ts module that does ON CONFLICT DO UPDATE
//     carries the guard, so a future module / refactor can't silently
//     reintroduce the blind upsert.

import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('I-3 pull-apply clobber guard (behavioral, real SQLite)', () => {
  // Mirror of bodyLogSync.applyServerRow's upsert (same guard clause).
  const UPSERT = `INSERT INTO body_logs (id, weight_kg, updated_at, synced_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       weight_kg = excluded.weight_kg,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at
       WHERE datetime(excluded.updated_at) > datetime(body_logs.updated_at)`;

  function freshDb(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec(
      `CREATE TABLE body_logs (id TEXT PRIMARY KEY, weight_kg REAL, updated_at TEXT, synced_at TEXT)`,
    );
    return db;
  }

  it('older server row does NOT overwrite a newer local edit (mixed formats)', () => {
    const db = freshDb();
    // Local edit: newer, stored in datetime('now') format.
    db.prepare(
      `INSERT INTO body_logs (id, weight_kg, updated_at) VALUES ('w1', 74.5, '2026-06-10 08:00:00')`,
    ).run();
    // Server pull: OLDER, ISO format.
    db.prepare(UPSERT).run('w1', 80.0, '2026-06-05T00:00:00Z');
    const row = db.prepare(`SELECT weight_kg FROM body_logs WHERE id='w1'`).get() as {
      weight_kg: number;
    };
    expect(row.weight_kg).toBe(74.5); // local newer value preserved
    db.close();
  });

  it('newer server row DOES overwrite the local row (mixed formats)', () => {
    const db = freshDb();
    db.prepare(
      `INSERT INTO body_logs (id, weight_kg, updated_at) VALUES ('w1', 74.5, '2026-06-10 08:00:00')`,
    ).run();
    db.prepare(UPSERT).run('w1', 73.0, '2026-06-20T00:00:00Z');
    const row = db.prepare(`SELECT weight_kg FROM body_logs WHERE id='w1'`).get() as {
      weight_kg: number;
    };
    expect(row.weight_kg).toBe(73.0); // server newer value applied
    db.close();
  });

  it('brand-new server row is inserted (no conflict → guard does not block)', () => {
    const db = freshDb();
    db.prepare(UPSERT).run('w2', 60.0, '2026-06-01T00:00:00Z');
    const row = db.prepare(`SELECT weight_kg FROM body_logs WHERE id='w2'`).get() as
      | { weight_kg: number }
      | undefined;
    expect(row?.weight_kg).toBe(60.0);
    db.close();
  });

  it('equal-timestamp re-delivery is a no-op (idempotent, not a clobber)', () => {
    const db = freshDb();
    db.prepare(
      `INSERT INTO body_logs (id, weight_kg, updated_at) VALUES ('w1', 70.0, '2026-06-10T00:00:00Z')`,
    ).run();
    db.prepare(UPSERT).run('w1', 999.0, '2026-06-10T00:00:00Z');
    const row = db.prepare(`SELECT weight_kg FROM body_logs WHERE id='w1'`).get() as {
      weight_kg: number;
    };
    expect(row.weight_kg).toBe(70.0); // equal ts → not '>' → skipped
    db.close();
  });
});

describe('I-3 clobber guard coverage (every sync module)', () => {
  const syncDir = path.resolve(__dirname, '..');
  const files = fs
    .readdirSync(syncDir)
    .filter((f) => f.endsWith('Sync.ts'));

  it('finds the sync modules', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  // v1.6.0 Sprint 3 — strengthened: bind each module's declared LOCAL_TABLE and
  // assert the guard references THAT exact table (a wrong-table typo that still
  // matches the generic shape would now fail).
  function localTableOf(src: string): string | null {
    const m = src.match(/LOCAL_TABLE\s*=\s*'([a-z0-9_]+)'/);
    return m ? m[1] : null;
  }

  for (const f of files) {
    const src = fs.readFileSync(path.join(syncDir, f), 'utf8');
    // profileSync is 1:1 with the user (its own bespoke watermark pull, no
    // multi-device row clobber surface) — exempt from the value guard.
    if (!src.includes('ON CONFLICT')) continue;
    if (f === 'profileSync.ts') continue;
    const table = localTableOf(src);
    it(`${f} declares a LOCAL_TABLE`, () => {
      expect(table).toBeTruthy();
    });
    it(`${f} value-clobber guard references its own table (${table})`, () => {
      // Exact table binding — catches wrong-table typos, not just "some guard".
      expect(src).toContain(
        `WHERE datetime(excluded.updated_at) > datetime(${table}.updated_at)`,
      );
    });
  }
});

describe('I-3 tombstone edit-wins guard (behavioral, real SQLite)', () => {
  // Mirror of applyServerDeletion's guarded DELETE.
  const DELETE_GUARDED = `DELETE FROM body_logs
       WHERE id = ?
         AND datetime(updated_at) <= datetime(?)`;

  function dbWithRow(localUpdatedAt: string): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec(
      `CREATE TABLE body_logs (id TEXT PRIMARY KEY, weight_kg REAL, updated_at TEXT)`,
    );
    db.prepare(
      `INSERT INTO body_logs (id, weight_kg, updated_at) VALUES ('w1', 70, ?)`,
    ).run(localUpdatedAt);
    return db;
  }
  const exists = (db: DatabaseSync) =>
    !!db.prepare(`SELECT 1 FROM body_logs WHERE id='w1'`).get();

  it('stale tombstone (older than local edit) does NOT delete — edit wins', () => {
    const db = dbWithRow('2026-06-10 08:00:00'); // local edited newer (mixed fmt)
    db.prepare(DELETE_GUARDED).run('w1', '2026-06-05T00:00:00Z'); // older tombstone
    expect(exists(db)).toBe(true);
    db.close();
  });

  it('newer tombstone DOES delete the local row', () => {
    const db = dbWithRow('2026-06-10 08:00:00');
    db.prepare(DELETE_GUARDED).run('w1', '2026-06-20T00:00:00Z'); // newer tombstone
    expect(exists(db)).toBe(false);
    db.close();
  });

  it('equal-timestamp tombstone deletes (tie → tombstone wins)', () => {
    const db = dbWithRow('2026-06-10T00:00:00Z');
    db.prepare(DELETE_GUARDED).run('w1', '2026-06-10T00:00:00Z');
    expect(exists(db)).toBe(false);
    db.close();
  });
});

describe('I-3 tombstone guard coverage (every sync module)', () => {
  const syncDir = path.resolve(__dirname, '..');
  it('applyServerDeletion is updated_at-guarded', () => {
    const helpers = fs.readFileSync(path.join(syncDir, 'syncHelpers.ts'), 'utf8');
    expect(helpers).toMatch(/DELETE FROM \$\{localTableName\}[\s\S]*datetime\(updated_at\) <= datetime\(\?\)/);
  });
  it('userEquipmentSync composite tombstone is guarded', () => {
    const ue = fs.readFileSync(path.join(syncDir, 'userEquipmentSync.ts'), 'utf8');
    expect(ue).toMatch(/datetime\(updated_at\) <= datetime\(\?\)/);
  });
});
