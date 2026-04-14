import { useState, useEffect, useCallback } from 'react';
import { BodyLog } from '../types/bodyLog';
import { useProfileStore } from '../stores/profileStore';
import {
  getBodyLogs,
  getBodyLogByDate,
  upsertBodyLog,
} from '../infra/repositories/bodyLogRepository';
import { getISODate } from '../utils/format';
import { subDays, parseISO, differenceInDays } from 'date-fns';

export function useBodyLogs() {
  const profile = useProfileStore((s) => s.profile);
  const profileId = profile?.id ?? '';

  const [logs, setLogs] = useState<BodyLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    if (!profileId) {
      setLogs([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const result = await getBodyLogs(profileId, 90);
      setLogs(result);
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const todayStr = getISODate();
  const todayLog = logs.find((log) => log.date === todayStr) ?? null;

  // Calculate 7-day average weight
  const avg7d = (() => {
    const cutoffDate = getISODate(subDays(new Date(), 7));
    const recentWithWeight = logs.filter(
      (log) => log.weightKg !== null && log.date > cutoffDate
    );
    if (recentWithWeight.length === 0) return null;
    const sum = recentWithWeight.reduce((acc, log) => acc + (log.weightKg ?? 0), 0);
    return Number((sum / recentWithWeight.length).toFixed(1));
  })();

  // Calculate weight change over 14 days
  const weightChange14d = (() => {
    const logsWithWeight = logs
      .filter((log) => log.weightKg !== null)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (logsWithWeight.length < 2) return null;

    const newest = logsWithWeight[logsWithWeight.length - 1];
    const newestDate = parseISO(newest.date);

    // Find the oldest log within roughly 14 days ago
    const cutoffDate = subDays(newestDate, 14);
    const cutoffStr = getISODate(cutoffDate);

    // Get logs from around 14 days ago (find the closest one to the cutoff)
    const olderLogs = logsWithWeight.filter((log) => log.date <= cutoffStr);

    if (olderLogs.length === 0) {
      // Use the oldest log we have if we don't have 14 days
      const oldest = logsWithWeight[0];
      const daySpan = differenceInDays(newestDate, parseISO(oldest.date));
      if (daySpan < 3) return null; // Not enough data span
      return Number(((newest.weightKg ?? 0) - (oldest.weightKg ?? 0)).toFixed(1));
    }

    const closest = olderLogs[olderLogs.length - 1];
    return Number(((newest.weightKg ?? 0) - (closest.weightKg ?? 0)).toFixed(1));
  })();

  const recordWeight = useCallback(
    async (weight: number, bodyFatPct?: number | null, note?: string | null, date?: string) => {
      if (!profileId) return;
      try {
        await upsertBodyLog(profileId, {
          date: date ?? getISODate(),
          weightKg: weight,
          bodyFatPct: bodyFatPct ?? null,
          note: note ?? null,
        });
        await loadLogs();
      } catch (error) {
      }
    },
    [profileId, loadLogs]
  );

  const refreshLogs = useCallback(() => {
    return loadLogs();
  }, [loadLogs]);

  return {
    logs,
    todayLog,
    avg7d,
    weightChange14d,
    isLoading,
    recordWeight,
    refreshLogs,
  };
}
