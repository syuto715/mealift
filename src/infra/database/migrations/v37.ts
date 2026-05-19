import type * as SQLite from 'expo-sqlite';

// v37: v1.5 Phase 2.3 Sprint 2.3.3 — embed nutrition snapshot
// directly in search_index so the detail screen can render the
// full PFC + 17 micronutrient grid from a single FTS5 hit.
//
// Why retrofit on top of v36 instead of widening v36 in place:
//   - Sprint 2.3.1 (v36) optimized for a normalized index whose
//     rows pointed back at foods / restaurant_menu_items_local
//     for nutrition. Sprint 2.3.3 reconnaissance surfaced two
//     problems with that path: (a) restaurant_menu_items_local
//     is still empty on the client (Phase 2.2 sync helpers are
//     pending), (b) the build-time `source_id` for restaurant
//     rows is a deterministic slug+offset that doesn't line up
//     with the runtime UUID a future sync would assign.
//   - Embedding `nutrition_json` here breaks the dependency on
//     restaurant sync entirely. The build-time script materialises
//     the full nutrition payload from the canonical seed JSON
//     (八訂 foods-mext.json + scripts/seed/data/*.json) and the
//     detail screen reads it with a single search_index lookup.
//
// Schema notes:
//   - `nutrition_json` is intentionally NOT indexed by FTS5 — a
//     full nutritional table is meaningless as a search keyword.
//     The v36 FTS5 trigger emits ('name_ja, name_en, brand,
//     aliases_concat') only, so this column is invisible to MATCH.
//   - Restaurant menu rows carry the ~10 fields the chain
//     discloses (kcal/P/F/C + fiber/sugar/salt/sodium/sat_fat/
//     cholesterol). 八訂 rows carry the full 17-field micronutrient
//     grid. Missing fields render as "—" in the UI (Drafting 152
//     per-record source dispatch — completeness is provenance-
//     dependent).
//   - JSON is stored as TEXT and parsed at read time. ~250 bytes/
//     row × 8K rows ≈ 2.5 MB extra on the seed-index snapshot;
//     trivial on the device.

export async function migrateV37(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE search_index ADD COLUMN nutrition_json TEXT;
  `);
}
