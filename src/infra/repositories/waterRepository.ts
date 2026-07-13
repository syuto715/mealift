import { getDatabase } from '../database/connection';
import { WaterLog } from '../../types/water';
import { generateId } from '../../utils/id';
import { getISODate, localDateOf, localDayUtcRange, localDaysAgoStartIso } from '../../utils/format';
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

// Sprint TZ — 「その日の水分」は local 日付で定義する。logged_at は UTC ISO
// 保存 (不変) のため、旧 substr(logged_at,1,10) は UTC 日付になり、JST
// 00:00-08:59 の記録が「今日の合計」から漏れていた。local 日の UTC instant
// 半開区間 + datetime() 正規化比較 (sync pull の形式混在耐性 — 規約は
// utils/format.ts 参照)。
export async function getTodayTotal(profileId: string, date?: string): Promise<number> {
  const db = await getDatabase();
  const target = date ?? getISODate();
  const { startIso, endIso } = localDayUtcRange(target);
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount_ml), 0) AS total
     FROM water_logs
     WHERE user_id = ? AND datetime(logged_at) >= datetime(?) AND datetime(logged_at) < datetime(?) AND deleted_at IS NULL`,
    [profileId, startIso, endIso]
  );
  return row?.total ?? 0;
}

export async function getTodayLogs(profileId: string, date?: string): Promise<WaterLog[]> {
  const db = await getDatabase();
  const target = date ?? getISODate();
  const { startIso, endIso } = localDayUtcRange(target);
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM water_logs
     WHERE user_id = ? AND datetime(logged_at) >= datetime(?) AND datetime(logged_at) < datetime(?) AND deleted_at IS NULL
     ORDER BY logged_at DESC`,
    [profileId, startIso, endIso]
  );
  return rows.map(rowToWaterLog);
}

export async function getHistory(
  profileId: string,
  days: number = 30
): Promise<{ date: string; totalMl: number }[]> {
  const db = await getDatabase();
  // Sprint TZ — 日別キーを local 日付に (旧 GROUP BY substr は UTC 日付キー)。
  // rolling 窓も JS 計算の ISO instant に統一し、行を取って JS 側で
  // localDateOf により日別集計する。
  const sinceIso = localDaysAgoStartIso(days);
  const rows = await db.getAllAsync<{ logged_at: string; amount_ml: number }>(
    `SELECT logged_at, amount_ml
     FROM water_logs
     WHERE user_id = ? AND datetime(logged_at) >= datetime(?) AND deleted_at IS NULL
     ORDER BY logged_at DESC`,
    [profileId, sinceIso]
  );
  const byDate = new Map<string, number>();
  for (const row of rows) {
    const d = localDateOf(row.logged_at);
    byDate.set(d, (byDate.get(d) ?? 0) + row.amount_ml);
  }
  return Array.from(byDate, ([date, totalMl]) => ({ date, totalMl })).sort((a, b) =>
    b.date.localeCompare(a.date),
  );
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
