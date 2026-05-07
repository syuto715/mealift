import type { ISODateTimeString, UUID } from './common';
import type { EquipmentKey } from '../constants/equipment';

// Build 15 / Session 8 / Feature 5-元 — per-user gym equipment row.
// Mirrors the v28 user_equipment table; equipmentKey reuses the 8-cat
// EquipmentKey enum from Build 15 5-P (src/constants/equipment.ts).
//
// `available` is a soft on/off — design §6.8 leaves room for "owned but
// broken" / "in storage" cases without requiring deletion. v1 always
// writes 1; v2 may surface a "temporarily unavailable" toggle.
//
// `notes` is reserved for v2 (per-equipment annotations like
// "アジャスタブル 5-25kg"). Always null in v1.
export interface UserEquipment {
  id: UUID;
  profileId: UUID;
  equipmentKey: EquipmentKey;
  available: boolean;
  notes: string | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface UserEquipmentInput {
  profileId: UUID;
  equipmentKey: EquipmentKey;
  available?: boolean;
  notes?: string | null;
}
