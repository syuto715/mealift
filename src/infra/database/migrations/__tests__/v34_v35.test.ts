import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateV34 } from '../v34';
import { migrateV35 } from '../v35';

// v1.5 Stage 2 Phase 2.1 — SQL contract pin for v34 + v35
// migrations. Mirrors the v30 test convention (assert on emitted
// SQL strings rather than running a real SQLite engine).
//
// v34 adds:
//   - restaurants_local (chain mirror)
//   - restaurant_chain_categories_local
//   - restaurant_aliases_local (side-table; Codex Important #3 —
//     SQLite has no native text[] type, so the Supabase aliases
//     array maps to one-row-per-alias here)
//
// v35 adds:
//   - restaurant_menu_items_local (menu mirror)
//   - restaurant_menu_item_aliases_local (same side-table pattern)

function makeMockDb() {
  const executedSql: string[] = [];
  return {
    executedSql,
    execAsync: async (sql: string) => {
      executedSql.push(sql);
    },
    getAllAsync: async () => [],
  };
}

describe('migrateV34 — chain mirror tables', () => {
  it('creates the 3 v34 tables', async () => {
    const db = makeMockDb();
    await migrateV34(db as unknown as SQLiteDatabase);
    const joined = db.executedSql.join('\n');
    expect(joined).toMatch(/CREATE TABLE IF NOT EXISTS restaurant_chain_categories_local\b/);
    expect(joined).toMatch(/CREATE TABLE IF NOT EXISTS restaurants_local\b/);
    expect(joined).toMatch(/CREATE TABLE IF NOT EXISTS restaurant_aliases_local\b/);
  });

  it('restaurants_local declares the restaurant_type column (DEC-7 enum)', async () => {
    const db = makeMockDb();
    await migrateV34(db as unknown as SQLiteDatabase);
    expect(db.executedSql.join('\n')).toMatch(/restaurant_type\s+TEXT\s+NOT\s+NULL/);
  });

  it('does NOT emit CHECK constraints (matches v26-v33 convention)', async () => {
    const db = makeMockDb();
    await migrateV34(db as unknown as SQLiteDatabase);
    for (const sql of db.executedSql) {
      expect(sql).not.toMatch(/\bCHECK\s*\(/i);
    }
  });

  it('does NOT emit takedown_flag (server filters on pull; §5.2)', async () => {
    // The Stage 2 epic doc explicitly states the SQLite mirror
    // OMITS the takedown_flag column — server pre-filters at the
    // sync EF, so the client never sees a takedown=true row.
    const db = makeMockDb();
    await migrateV34(db as unknown as SQLiteDatabase);
    for (const sql of db.executedSql) {
      expect(sql).not.toMatch(/takedown_flag/);
    }
  });

  it('restaurant_aliases_local indexes alias_lower (search lookup target)', async () => {
    const db = makeMockDb();
    await migrateV34(db as unknown as SQLiteDatabase);
    expect(db.executedSql.join('\n')).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_restaurant_aliases_local_lower[\s\S]*alias_lower/,
    );
  });

  it('restaurant_aliases_local FK cascades on parent delete', async () => {
    const db = makeMockDb();
    await migrateV34(db as unknown as SQLiteDatabase);
    expect(db.executedSql.join('\n')).toMatch(
      /REFERENCES restaurants_local\(id\) ON DELETE CASCADE/,
    );
  });
});

describe('migrateV35 — menu mirror tables', () => {
  it('creates the 2 v35 tables', async () => {
    const db = makeMockDb();
    await migrateV35(db as unknown as SQLiteDatabase);
    const joined = db.executedSql.join('\n');
    expect(joined).toMatch(/CREATE TABLE IF NOT EXISTS restaurant_menu_items_local\b/);
    expect(joined).toMatch(/CREATE TABLE IF NOT EXISTS restaurant_menu_item_aliases_local\b/);
  });

  it('declares the PFC + micronutrient column set (mirror parity with foods)', async () => {
    const db = makeMockDb();
    await migrateV35(db as unknown as SQLiteDatabase);
    const sql = db.executedSql.join('\n');
    expect(sql).toMatch(/calories_per_serving\s+REAL\s+NOT\s+NULL/);
    expect(sql).toMatch(/protein_g\s+REAL\s+NOT\s+NULL/);
    expect(sql).toMatch(/fat_g\s+REAL\s+NOT\s+NULL/);
    expect(sql).toMatch(/carb_g\s+REAL\s+NOT\s+NULL/);
    expect(sql).toMatch(/fiber_g\s+REAL\b/);
    expect(sql).toMatch(/sodium_mg\s+REAL\b/);
    expect(sql).toMatch(/saturated_fat_g\s+REAL\b/);
    expect(sql).toMatch(/cholesterol_mg\s+REAL\b/);
  });

  it('barcode column is indexed (コンビニ PB lookup target)', async () => {
    const db = makeMockDb();
    await migrateV35(db as unknown as SQLiteDatabase);
    expect(db.executedSql.join('\n')).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_restaurant_menu_items_local_barcode[\s\S]*barcode/,
    );
  });

  it('ingredient_decomposition_json stored as TEXT (jsonb parsed app-side)', async () => {
    const db = makeMockDb();
    await migrateV35(db as unknown as SQLiteDatabase);
    expect(db.executedSql.join('\n')).toMatch(
      /ingredient_decomposition_json\s+TEXT\b/,
    );
  });

  it('does NOT emit CHECK constraints (server-only convention)', async () => {
    const db = makeMockDb();
    await migrateV35(db as unknown as SQLiteDatabase);
    for (const sql of db.executedSql) {
      expect(sql).not.toMatch(/\bCHECK\s*\(/i);
    }
  });

  it('FK to restaurants_local cascades on parent delete', async () => {
    const db = makeMockDb();
    await migrateV35(db as unknown as SQLiteDatabase);
    expect(db.executedSql.join('\n')).toMatch(
      /REFERENCES restaurants_local\(id\) ON DELETE CASCADE/,
    );
  });
});
