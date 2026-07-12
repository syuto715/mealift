import { useCallback, useEffect, useState } from 'react';
import { useProfileStore } from '../stores/profileStore';
import {
  addWaterLog as addWaterLogRepo,
  getTodayTotal as getTodayTotalRepo,
  getTodayLogs as getTodayLogsRepo,
  deleteLog as deleteLogRepo,
} from '../infra/repositories/waterRepository';
import { WaterLog } from '../types/water';
import { RECORD_EVENTS, addRecordEventListener } from '../utils/recordEvents';

export function useWaterTracker(date?: string) {
  const profile = useProfileStore((s) => s.profile);
  const profileId = profile?.id ?? '';

  const [totalMl, setTotalMl] = useState(0);
  const [logs, setLogs] = useState<WaterLog[]>([]);

  const refresh = useCallback(async () => {
    if (!profileId) {
      setTotalMl(0);
      setLogs([]);
      return;
    }
    const [total, todayLogs] = await Promise.all([
      getTodayTotalRepo(profileId, date),
      getTodayLogsRepo(profileId, date),
    ]);
    setTotalMl(total);
    setLogs(todayLogs);
  }, [profileId, date]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // S3-2b — 記録ハブ (画面外の RN Modal シート) からの追加/取り消しを、
  // mounted 済み消費画面 (ホーム水分カード等) に即時反映する。
  useEffect(() => {
    const sub = addRecordEventListener(RECORD_EVENTS.waterLogChanged, () => {
      void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const addWater = useCallback(
    async (ml: number) => {
      if (!profileId) return;
      await addWaterLogRepo(profileId, ml);
      await refresh();
    },
    [profileId, refresh]
  );

  const removeLog = useCallback(
    async (id: string) => {
      await deleteLogRepo(id);
      await refresh();
    },
    [refresh]
  );

  const targetMl = profile?.dailyWaterTargetMl ?? 2500;
  const progress = targetMl > 0 ? Math.min(1, totalMl / targetMl) : 0;

  return { totalMl, targetMl, progress, logs, addWater, removeLog, refresh };
}
