// v1.6.0 Sprint 6 — drift guard for the local wipe classification.
//
// Account deletion / local reset wipe USER_DATA_TABLES and preserve
// REFERENCE_TABLES. If a future migration adds a new local table, it MUST be
// classified into exactly one of the two lists; otherwise this test fails,
// preventing the pre-v1.6 bug class (meal_logs / water_logs / chat /
// coach_advice silently left behind by an incomplete wipe list).

import * as fs from 'node:fs';
import * as path from 'node:path';
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
