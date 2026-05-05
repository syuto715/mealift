import { getDatabase } from '../database/connection';
import { WaterLog } from '../../types/water';
import { generateId } from '../../utils/id';
import { getISODate } from '../../utils/format';
import { enqueueRowFromTable } from './syncRepository';

function rowToWaterLog(row: Record<string, unknown>): WaterLog {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    amountMl: row.amount_ml as number,
    loggedAt: row.logged_at as string,
    createdAt: row.created_at as string,
  };
}

export async function addWaterLog(
  profileId: string,
  amountMl: number,
  loggedAt?: string
): Promise<WaterLog> {
  const db = await getDatabase();
  const id = generateId();
  const logged = loggedAt ?? new Date().toISOString();
  await db.runAsync(
    `INSERT INTO water_logs (id, user_id, amount_ml, logged_at) VALUES (?, ?, ?, ?)`,
    [id, profileId, amountMl, logged]
  );
  await enqueueRowFromTable('water_logs', id, 'INSERT');
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM water_logs WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  return rowToWaterLog(row!);
}

export async function getTodayTotal(profileId: string, date?: string): Promise<number> {
  const db = await getDatabase();
  const target = date ?? getISODate();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount_ml), 0) AS total
     FROM water_logs
     WHERE user_id = ? AND substr(logged_at, 1, 10) = ? AND deleted_at IS NULL`,
    [profileId, target]
  );
  return row?.total ?? 0;
}

export async function getTodayLogs(profileId: string, date?: string): Promise<WaterLog[]> {
  const db = await getDatabase();
  const target = date ?? getISODate();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM water_logs
     WHERE user_id = ? AND substr(logged_at, 1, 10) = ? AND deleted_at IS NULL
     ORDER BY logged_at DESC`,
    [profileId, target]
  );
  return rows.map(rowToWaterLog);
}

export async function getHistory(
  profileId: string,
  days: number = 30
): Promise<{ date: string; totalMl: number }[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ date: string; total: number }>(
    `SELECT substr(logged_at, 1, 10) AS date, SUM(amount_ml) AS total
     FROM water_logs
     WHERE user_id = ? AND logged_at >= datetime('now', '-' || ? || ' days') AND deleted_at IS NULL
     GROUP BY substr(logged_at, 1, 10)
     ORDER BY date DESC`,
    [profileId, days]
  );
  return rows.map((r) => ({ date: r.date, totalMl: r.total }));
}

export async function deleteLog(id: string): Promise<void> {
  const db = await getDatabase();
  // Soft delete: preserves the row + tombstone for sync to propagate.
  await db.runAsync(
    "UPDATE water_logs SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    [id],
  );
  await enqueueRowFromTable('water_logs', id, 'UPDATE');
}
