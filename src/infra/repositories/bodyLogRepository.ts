import { getDatabase } from '../database/connection';
import { BodyLog, BodyLogInput } from '../../types/bodyLog';
import { generateId } from '../../utils/id';

function rowToBodyLog(row: Record<string, unknown>): BodyLog {
  return {
    id: row.id as string,
    profileId: row.profile_id as string,
    date: row.date as string,
    weightKg: row.weight_kg as number | null,
    bodyFatPct: row.body_fat_pct as number | null,
    muscleMassKg: row.muscle_mass_kg as number | null,
    note: row.note as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getBodyLogs(
  profileId: string,
  limit: number = 90,
  historyWindowDays?: number | null,
): Promise<BodyLog[]> {
  const db = await getDatabase();
  const clamp =
    historyWindowDays != null
      ? ` AND date >= date('now', '-${historyWindowDays} days')`
      : '';
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM body_logs WHERE profile_id = ? AND deleted_at IS NULL${clamp} ORDER BY date DESC LIMIT ?`,
    [profileId, limit]
  );
  return rows.map(rowToBodyLog);
}

export async function getBodyLogByDate(profileId: string, date: string): Promise<BodyLog | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM body_logs WHERE profile_id = ? AND date = ? AND deleted_at IS NULL',
    [profileId, date]
  );
  return row ? rowToBodyLog(row) : null;
}

export async function getRecordedBodyLogDates(
  profileId: string,
  monthPrefix: string,
  historyWindowDays?: number | null
): Promise<string[]> {
  const db = await getDatabase();
  const clamp =
    historyWindowDays != null
      ? ` AND date >= date('now', '-${historyWindowDays} days')`
      : '';
  const rows = await db.getAllAsync<{ date: string }>(
    `SELECT DISTINCT date FROM body_logs
     WHERE profile_id = ? AND date LIKE ? || '%' AND deleted_at IS NULL${clamp}
     ORDER BY date`,
    [profileId, monthPrefix]
  );
  return rows.map((r) => r.date);
}

export async function upsertBodyLog(profileId: string, input: BodyLogInput): Promise<BodyLog> {
  const db = await getDatabase();
  const existing = await getBodyLogByDate(profileId, input.date);

  if (existing) {
    await db.runAsync(
      `UPDATE body_logs SET weight_kg = ?, body_fat_pct = ?, muscle_mass_kg = ?, note = ?, updated_at = datetime('now') WHERE id = ?`,
      [input.weightKg ?? null, input.bodyFatPct ?? null, input.muscleMassKg ?? null, input.note ?? null, existing.id]
    );
    return (await getBodyLogByDate(profileId, input.date))!;
  }

  const id = generateId();
  await db.runAsync(
    `INSERT INTO body_logs (id, profile_id, date, weight_kg, body_fat_pct, muscle_mass_kg, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, profileId, input.date, input.weightKg ?? null, input.bodyFatPct ?? null, input.muscleMassKg ?? null, input.note ?? null]
  );
  return (await getBodyLogByDate(profileId, input.date))!;
}
