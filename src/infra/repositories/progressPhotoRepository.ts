import * as ImagePicker from 'expo-image-picker';
import { getDatabase } from '../database/connection';
import { subDays } from 'date-fns';
import { generateId } from '../../utils/id';
import { getISODate } from '../../utils/format';
import { ProgressPhoto, ProgressPhotoInput, PoseType } from '../../types/progressPhoto';
import { canAddProgressPhoto } from '../../domain/subscription/gates';
import type { PlanStatus } from '../services/subscriptionService';
import { enqueueRowFromTable } from './syncRepository';
import { deletePhotoFile } from './progressPhotoStorage';

export { deletePhotoFile, persistPhoto } from './progressPhotoStorage';

export class PhotoLimitExceededError extends Error {
  constructor() {
    super('PHOTO_LIMIT_EXCEEDED');
    this.name = 'PhotoLimitExceededError';
  }
}

// ---------------------------------------------------------------------------
// Image picker
// ---------------------------------------------------------------------------

export async function pickPhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: true,
    aspect: [3, 4],
  });

  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0].uri;
}

export async function takePhoto(): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchCameraAsync({
    quality: 0.8,
    allowsEditing: true,
    aspect: [3, 4],
  });

  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0].uri;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function rowToPhoto(row: Record<string, unknown>): ProgressPhoto {
  return {
    id: row.id as string,
    profileId: row.profile_id as string,
    date: row.date as string,
    photoUri: row.photo_uri as string,
    poseType: row.pose_type as PoseType,
    note: (row.note as string) ?? null,
    createdAt: row.created_at as string,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function addProgressPhoto(
  input: ProgressPhotoInput,
  planStatus?: PlanStatus,
): Promise<ProgressPhoto> {
  const db = await getDatabase();

  if (planStatus) {
    const count = await getPhotoCount(input.profileId);
    if (!canAddProgressPhoto(planStatus, count)) {
      throw new PhotoLimitExceededError();
    }
  }

  const id = generateId();

  await db.runAsync(
    `INSERT INTO progress_photos (id, profile_id, date, photo_uri, pose_type, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, input.profileId, input.date, input.photoUri, input.poseType, input.note ?? null],
  );
  await enqueueRowFromTable('progress_photos', id, 'INSERT');

  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM progress_photos WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  return rowToPhoto(row!);
}

export async function getPhotosByDate(
  profileId: string,
  date: string,
  historyWindowDays?: number | null,
): Promise<ProgressPhoto[]> {
  if (historyWindowDays != null) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - historyWindowDays);
    // Sprint TZ — local date 列との比較なので cutoff も local 日付化
    if (date < getISODate(cutoff)) return [];
  }
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM progress_photos WHERE profile_id = ? AND date = ? AND deleted_at IS NULL ORDER BY created_at',
    [profileId, date],
  );
  return rows.map(rowToPhoto);
}

export async function getPhotoDates(
  profileId: string,
  limit: number = 100,
  historyWindowDays?: number | null,
): Promise<string[]> {
  const db = await getDatabase();
  // Sprint TZ — local date 列との比較なので cutoff も local 日付 (旧 date('now') は UTC 今日で境界 ±1 日ズレ)
  const clampDate =
    historyWindowDays != null ? getISODate(subDays(new Date(), historyWindowDays)) : null;
  const rows = await db.getAllAsync<{ date: string }>(
    `SELECT DISTINCT date FROM progress_photos WHERE profile_id = ? AND deleted_at IS NULL${clampDate ? ' AND date >= ?' : ''} ORDER BY date DESC LIMIT ?`,
    clampDate ? [profileId, clampDate, limit] : [profileId, limit],
  );
  return rows.map((r) => r.date);
}

export async function getAllPhotos(
  profileId: string,
  limit: number = 200,
  historyWindowDays?: number | null,
): Promise<ProgressPhoto[]> {
  const db = await getDatabase();
  // Sprint TZ — local date 列との比較なので cutoff も local 日付 (旧 date('now') は UTC 今日で境界 ±1 日ズレ)
  const clampDate =
    historyWindowDays != null ? getISODate(subDays(new Date(), historyWindowDays)) : null;
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM progress_photos WHERE profile_id = ? AND deleted_at IS NULL${clampDate ? ' AND date >= ?' : ''} ORDER BY date DESC, created_at DESC LIMIT ?`,
    clampDate ? [profileId, clampDate, limit] : [profileId, limit],
  );
  return rows.map(rowToPhoto);
}

export async function deleteProgressPhoto(id: string): Promise<void> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<{ photo_uri: string }>(
    'SELECT photo_uri FROM progress_photos WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  if (row) {
    deletePhotoFile(row.photo_uri);
  }

  // Soft delete the row; the photo file itself is hard-deleted above.
  // After sync, the tombstone propagates so other devices stop showing
  // the entry. The file URI in the row becomes unresolvable, which is
  // consistent with the file being gone locally.
  await db.runAsync(
    "UPDATE progress_photos SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    [id],
  );
  await enqueueRowFromTable('progress_photos', id, 'UPDATE');
}

export async function getPhotoCount(profileId: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM progress_photos WHERE profile_id = ? AND deleted_at IS NULL',
    [profileId],
  );
  return row?.count ?? 0;
}
