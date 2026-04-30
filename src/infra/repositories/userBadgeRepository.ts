import type { SQLiteDatabase } from 'expo-sqlite';

// Repository for the user_badges ledger (v22). Pattern mirrors
// other repositories: free functions, db: SQLiteDatabase as first
// arg, no module-scoped DB handle.

export interface UserBadge {
  id: number;
  badgeId: string;
  earnedAt: number; // ms since epoch
  relatedCount: number | null;
}

function rowToBadge(row: Record<string, unknown>): UserBadge {
  return {
    id: row.id as number,
    badgeId: row.badge_id as string,
    earnedAt: row.earned_at as number,
    relatedCount: (row.related_count as number) ?? null,
  };
}

export async function listEarnedBadges(
  db: SQLiteDatabase,
): Promise<UserBadge[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM user_badges ORDER BY earned_at DESC',
  );
  return rows.map(rowToBadge);
}

export async function listEarnedBadgeIds(
  db: SQLiteDatabase,
): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ badge_id: string }>(
    'SELECT badge_id FROM user_badges',
  );
  return new Set(rows.map((r) => r.badge_id));
}

// awardBadge — inserts a row if not already present. Returns true
// when the badge is newly granted (caller surfaces a toast), false
// when already earned (no-op).
export async function awardBadge(
  db: SQLiteDatabase,
  badgeId: string,
  relatedCount: number | null,
): Promise<boolean> {
  const existing = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM user_badges WHERE badge_id = ?',
    [badgeId],
  );
  if ((existing?.count ?? 0) > 0) return false;
  await db.runAsync(
    'INSERT INTO user_badges (badge_id, earned_at, related_count) VALUES (?, ?, ?)',
    [badgeId, Date.now(), relatedCount],
  );
  return true;
}
