import { File, Paths, Directory } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { getDatabase } from '../database/connection';
import { generateId } from '../../utils/id';
import { ProgressPhoto, ProgressPhotoInput, PoseType } from '../../types/progressPhoto';

// ---------------------------------------------------------------------------
// Photo storage helpers
// ---------------------------------------------------------------------------

const PHOTO_DIR_NAME = 'progress_photos';

function getPhotoDirectory(): Directory {
  return new Directory(Paths.document, PHOTO_DIR_NAME);
}

/** Copy picked image into app's persistent storage and return the new URI */
export async function persistPhoto(sourceUri: string): Promise<string> {
  const dir = getPhotoDirectory();
  if (!dir.exists) {
    dir.create();
  }

  const ext = sourceUri.split('.').pop() ?? 'jpg';
  const fileName = `${generateId()}.${ext}`;
  const dest = new File(dir, fileName);
  const source = new File(sourceUri);
  source.copy(dest);
  return dest.uri;
}

/** Delete a persisted photo from storage */
export function deletePhotoFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Non-critical — orphaned file is acceptable
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
): Promise<ProgressPhoto> {
  const db = await getDatabase();
  const id = generateId();

  await db.runAsync(
    `INSERT INTO progress_photos (id, profile_id, date, photo_uri, pose_type, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, input.profileId, input.date, input.photoUri, input.poseType, input.note ?? null],
  );

  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM progress_photos WHERE id = ?',
    [id],
  );
  return rowToPhoto(row!);
}

export async function getPhotosByDate(
  profileId: string,
  date: string,
): Promise<ProgressPhoto[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM progress_photos WHERE profile_id = ? AND date = ? ORDER BY created_at',
    [profileId, date],
  );
  return rows.map(rowToPhoto);
}

export async function getPhotoDates(
  profileId: string,
  limit: number = 100,
): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ date: string }>(
    'SELECT DISTINCT date FROM progress_photos WHERE profile_id = ? ORDER BY date DESC LIMIT ?',
    [profileId, limit],
  );
  return rows.map((r) => r.date);
}

export async function getAllPhotos(
  profileId: string,
  limit: number = 200,
): Promise<ProgressPhoto[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM progress_photos WHERE profile_id = ? ORDER BY date DESC, created_at DESC LIMIT ?',
    [profileId, limit],
  );
  return rows.map(rowToPhoto);
}

export async function deleteProgressPhoto(id: string): Promise<void> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<{ photo_uri: string }>(
    'SELECT photo_uri FROM progress_photos WHERE id = ?',
    [id],
  );
  if (row) {
    deletePhotoFile(row.photo_uri);
  }

  await db.runAsync('DELETE FROM progress_photos WHERE id = ?', [id]);
}

export async function getPhotoCount(profileId: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM progress_photos WHERE profile_id = ?',
    [profileId],
  );
  return row?.count ?? 0;
}
