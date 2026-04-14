import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getDatabase } from '../database/connection';
import { format } from 'date-fns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WidgetData {
  date: string;
  caloriesConsumed: number;
  caloriesTarget: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  weightKg: number | null;
  workoutsDone: number;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WIDGET_DATA_KEY = 'widget_data';

// ---------------------------------------------------------------------------
// Data preparation
// ---------------------------------------------------------------------------

/** Generate widget data snapshot from current DB state */
export async function generateWidgetData(
  profileId: string,
): Promise<WidgetData> {
  const db = await getDatabase();
  const today = format(new Date(), 'yyyy-MM-dd');

  // Calories and macros for today
  const nutritionRow = await db.getFirstAsync<{
    total_cal: number;
    total_p: number;
    total_f: number;
    total_c: number;
  }>(
    `SELECT
       COALESCE(SUM(mli.calories), 0) as total_cal,
       COALESCE(SUM(mli.protein_g), 0) as total_p,
       COALESCE(SUM(mli.fat_g), 0) as total_f,
       COALESCE(SUM(mli.carb_g), 0) as total_c
     FROM meal_logs ml
     JOIN meal_log_items mli ON mli.meal_log_id = ml.id
     WHERE ml.profile_id = ? AND ml.date = ?`,
    [profileId, today],
  );

  // Target calories from profile
  const profileRow = await db.getFirstAsync<{ target_calories: number | null }>(
    'SELECT target_calories FROM profiles WHERE id = ?',
    [profileId],
  );

  // Latest weight
  const weightRow = await db.getFirstAsync<{ weight_kg: number }>(
    'SELECT weight_kg FROM body_logs WHERE profile_id = ? ORDER BY date DESC LIMIT 1',
    [profileId],
  );

  // Workout count today
  const workoutRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM workout_sessions WHERE profile_id = ? AND date = ?',
    [profileId, today],
  );

  return {
    date: today,
    caloriesConsumed: nutritionRow?.total_cal ?? 0,
    caloriesTarget: profileRow?.target_calories ?? 2000,
    proteinG: Math.round((nutritionRow?.total_p ?? 0) * 10) / 10,
    fatG: Math.round((nutritionRow?.total_f ?? 0) * 10) / 10,
    carbG: Math.round((nutritionRow?.total_c ?? 0) * 10) / 10,
    weightKg: weightRow?.weight_kg ?? null,
    workoutsDone: workoutRow?.count ?? 0,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Widget data sharing
// ---------------------------------------------------------------------------

/** Save widget data to shared storage (accessible by widget extension) */
export async function updateWidgetData(
  profileId: string,
): Promise<WidgetData> {
  const data = await generateWidgetData(profileId);
  await AsyncStorage.setItem(WIDGET_DATA_KEY, JSON.stringify(data));

  // On iOS, if using App Groups, data would be written to shared UserDefaults
  // For now, store in AsyncStorage as a data bridge

  return data;
}

/** Read the last widget data snapshot */
export async function getWidgetData(): Promise<WidgetData | null> {
  try {
    const stored = await AsyncStorage.getItem(WIDGET_DATA_KEY);
    if (stored) return JSON.parse(stored) as WidgetData;
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Notification fallback
// ---------------------------------------------------------------------------

/**
 * Send a daily summary notification as a widget fallback.
 * Scheduled at 21:00 each day to show today's progress.
 */
export async function scheduleDailySummaryNotification(
  profileId: string,
): Promise<void> {
  // Cancel existing daily summary notification
  await Notifications.cancelScheduledNotificationAsync('bf-daily-summary');

  const data = await generateWidgetData(profileId);

  const remaining = Math.max(0, data.caloriesTarget - data.caloriesConsumed);
  const body =
    `摂取: ${data.caloriesConsumed} / ${data.caloriesTarget} kcal` +
    ` (残り ${remaining})` +
    `\nP${data.proteinG}g F${data.fatG}g C${data.carbG}g` +
    (data.workoutsDone > 0 ? `\nワークアウト: ${data.workoutsDone}回` : '');

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '今日のまとめ',
      body,
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      hour: 21,
      minute: 0,
      repeats: true,
    },
    identifier: 'bf-daily-summary',
  });
}
