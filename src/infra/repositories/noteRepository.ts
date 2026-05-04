import { getDatabase } from '../database/connection';
import { generateId } from '../../utils/id';
import { NoteCategory } from '../../types/common';

export interface Note {
  id: string;
  profileId: string;
  date: string;
  category: NoteCategory;
  content: string;
  createdAt: string;
  updatedAt: string;
}

function rowToNote(row: Record<string, unknown>): Note {
  return {
    id: row.id as string,
    profileId: row.profile_id as string,
    date: row.date as string,
    category: row.category as NoteCategory,
    content: row.content as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getNotes(
  profileId: string,
  limit?: number
): Promise<Note[]> {
  const db = await getDatabase();
  const query = limit
    ? 'SELECT * FROM notes WHERE profile_id = ? AND deleted_at IS NULL ORDER BY date DESC, created_at DESC LIMIT ?'
    : 'SELECT * FROM notes WHERE profile_id = ? AND deleted_at IS NULL ORDER BY date DESC, created_at DESC';
  const params = limit ? [profileId, limit] : [profileId];
  const rows = await db.getAllAsync<Record<string, unknown>>(query, params);
  return rows.map(rowToNote);
}

export async function getNotesByCategory(
  profileId: string,
  category: NoteCategory
): Promise<Note[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM notes WHERE profile_id = ? AND category = ? AND deleted_at IS NULL ORDER BY date DESC, created_at DESC',
    [profileId, category]
  );
  return rows.map(rowToNote);
}

export async function createNote(
  profileId: string,
  date: string,
  category: NoteCategory,
  content: string
): Promise<Note> {
  const db = await getDatabase();
  const id = generateId();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO notes (id, profile_id, date, category, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, profileId, date, category, content, now, now]
  );

  return {
    id,
    profileId,
    date,
    category,
    content,
    createdAt: now,
    updatedAt: now,
  };
}

export async function deleteNote(noteId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM notes WHERE id = ?', [noteId]);
}
