import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getDatabase } from '../infra/database/connection';
import { countSubmissionsByStatus } from '../infra/repositories/userSubmittedFoodRepository';

// usePendingSubmissionCount — drives the My Submissions badge on the
// nutrition home screen (Build 15 / Feature 4). Refreshes on focus
// rather than every render so a user submitting from food-submit-public
// → returning to the nutrition tab sees the badge update.
//
// Returns 0 on any error so the badge is hidden cleanly when the DB
// can't be opened (rare; mostly during bootstrap).

export function usePendingSubmissionCount(): number {
  const [count, setCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const db = await getDatabase();
          const n = await countSubmissionsByStatus(db, 'pending_review');
          if (!cancelled) setCount(n);
        } catch {
          if (!cancelled) setCount(0);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return count;
}
