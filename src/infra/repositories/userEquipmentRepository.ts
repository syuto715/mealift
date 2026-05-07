import { getDatabase } from '../database/connection';
import { generateId } from '../../utils/id';
import { enqueueRowFromTable } from './syncRepository';
import type { UserEquipment } from '../../types/userEquipment';
import type { EquipmentKey } from '../../constants/equipment';

// Build 15 / Session 8 / Feature 5-元 — user_equipment CRUD.
//
// Schema reminder (v28):
//   id PK, profile_id, equipment_key TEXT (one of 8 EquipmentKey),
//   available INTEGER 0/1, notes, timestamps + synced_at,
//   UNIQUE(profile_id, equipment_key).
//
// Soft-state semantics (Phase 2 sign-off):
//   - `available` is the user-facing toggle. true = registered + in
//     use; false = registered but temporarily unavailable. Both states
//     keep the row (no deleted_at) so AI menu generation can still see
//     the registration history if a future surface wants it.
//   - `deleted_at` is the sync tombstone — only ever set when the row
//     should disappear cross-device (e.g. account cleanup cascade).
//     The settings UI never sets deleted_at; toggles always go through
//     setAvailable.

function rowToUserEquipment(row: Record<string, unknown>): UserEquipment {
  return {
    id: row.id as string,
    profileId: row.profile_id as string,
    equipmentKey: row.equipment_key as EquipmentKey,
    available: (row.available as number) === 1,
    notes: (row.notes as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listByProfileId(
  profileId: string,
): Promise<UserEquipment[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM user_equipment
      WHERE profile_id = ? AND deleted_at IS NULL
      ORDER BY equipment_key`,
    [profileId],
  );
  return rows.map(rowToUserEquipment);
}

export async function getByKey(
  profileId: string,
  equipmentKey: EquipmentKey,
): Promise<UserEquipment | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM user_equipment
      WHERE profile_id = ? AND equipment_key = ? AND deleted_at IS NULL`,
    [profileId, equipmentKey],
  );
  return row ? rowToUserEquipment(row) : null;
}

// Sets the `available` flag for a (profile, equipment_key) pair.
// Creates the row if it doesn't exist; otherwise updates in place.
//
// Returns the resulting row so the caller (settings UI) can update its
// local state without a follow-up read.
export async function setAvailable(
  profileId: string,
  equipmentKey: EquipmentKey,
  available: boolean,
): Promise<UserEquipment> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const existing = await getByKey(profileId, equipmentKey);

  if (existing) {
    await db.runAsync(
      `UPDATE user_equipment
          SET available = ?, updated_at = ?
        WHERE id = ?`,
      [available ? 1 : 0, now, existing.id],
    );
    await enqueueRowFromTable('user_equipment', existing.id, 'UPDATE');
    return { ...existing, available, updatedAt: now };
  }

  const id = generateId();
  await db.runAsync(
    `INSERT INTO user_equipment
       (id, profile_id, equipment_key, available, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, profileId, equipmentKey, available ? 1 : 0, now, now],
  );
  await enqueueRowFromTable('user_equipment', id, 'INSERT');
  return {
    id,
    profileId,
    equipmentKey,
    available,
    notes: null,
    createdAt: now,
    updatedAt: now,
  };
}

// Bulk upsert helper — used by the settings screen when the user taps
// Save on a multi-toggle commit, and by tests setting up fixtures.
// Each input row goes through setAvailable so sync queue + UNIQUE
// conflict handling stays consistent.
export async function upsertMany(
  profileId: string,
  items: { equipmentKey: EquipmentKey; available: boolean }[],
): Promise<void> {
  for (const item of items) {
    await setAvailable(profileId, item.equipmentKey, item.available);
  }
}
