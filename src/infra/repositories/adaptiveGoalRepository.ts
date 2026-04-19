import { getDatabase } from '../database/connection';
import { AdaptiveGoalSuggestion, AdaptiveGoalStatus } from '../../types/adaptiveGoal';

interface Row {
  id: string;
  user_id: string;
  suggestion_json: string;
  status: string;
  created_at: string;
}

export async function saveSuggestion(
  profileId: string,
  suggestion: AdaptiveGoalSuggestion
): Promise<void> {
  const db = await getDatabase();
  // Upsert by id so approved/dismissed flips don't create duplicates.
  await db.runAsync(
    `INSERT INTO adaptive_goal_suggestions (id, user_id, suggestion_json, status, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       suggestion_json = excluded.suggestion_json,
       status = excluded.status`,
    [
      suggestion.id,
      profileId,
      JSON.stringify(suggestion),
      suggestion.status,
      suggestion.calculatedAt,
    ]
  );
}

export async function markSuggestionStatus(
  suggestionId: string,
  status: AdaptiveGoalStatus
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE adaptive_goal_suggestions SET status = ? WHERE id = ?`,
    [status, suggestionId]
  );
}

export async function getSuggestionHistory(profileId: string): Promise<AdaptiveGoalSuggestion[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM adaptive_goal_suggestions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    [profileId]
  );
  const out: AdaptiveGoalSuggestion[] = [];
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.suggestion_json) as AdaptiveGoalSuggestion;
      out.push({ ...parsed, status: r.status as AdaptiveGoalStatus });
    } catch {
      // skip malformed
    }
  }
  return out;
}

export async function getLatestPendingSuggestion(
  profileId: string
): Promise<AdaptiveGoalSuggestion | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Row>(
    `SELECT * FROM adaptive_goal_suggestions WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
    [profileId]
  );
  if (!row) return null;
  try {
    return JSON.parse(row.suggestion_json) as AdaptiveGoalSuggestion;
  } catch {
    return null;
  }
}
