import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationTime {
  hour: number; // 0-23
  minute: number; // 0-59
}

export interface NotificationSettings {
  weightReminder: {
    enabled: boolean;
    time: NotificationTime;
  };
  mealReminder: {
    enabled: boolean;
    breakfastTime: NotificationTime;
    lunchTime: NotificationTime;
    dinnerTime: NotificationTime;
  };
  trainingReminder: {
    enabled: boolean;
    time: NotificationTime;
    days: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  };
  weeklyReport: {
    enabled: boolean;
    dayOfWeek: number; // 0=Sun, ..., 6=Sat
    time: NotificationTime;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'notification_settings_v1';

const OLD_KEYS = {
  weight: 'setting_weight_remind',
  meal: 'setting_meal_remind',
  training: 'setting_training_remind',
};

export const DEFAULT_SETTINGS: NotificationSettings = {
  weightReminder: {
    enabled: true,
    time: { hour: 7, minute: 0 },
  },
  mealReminder: {
    enabled: true,
    breakfastTime: { hour: 8, minute: 0 },
    lunchTime: { hour: 12, minute: 0 },
    dinnerTime: { hour: 19, minute: 0 },
  },
  trainingReminder: {
    enabled: true,
    time: { hour: 18, minute: 0 },
    days: [1, 3, 5], // Mon, Wed, Fri
  },
  weeklyReport: {
    enabled: false,
    dayOfWeek: 0, // Sunday
    time: { hour: 20, minute: 0 },
  },
};

export const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatTime(time: NotificationTime): string {
  return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

/** Convert internal weekday (0=Sun) to expo-notifications weekday (1=Sun) */
function toExpoWeekday(day: number): number {
  return day + 1;
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

export async function initializeNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'リマインダー',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}

// ---------------------------------------------------------------------------
// Settings persistence
// ---------------------------------------------------------------------------

export async function loadNotificationSettings(): Promise<NotificationSettings> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<NotificationSettings>;
      return {
        weightReminder: { ...DEFAULT_SETTINGS.weightReminder, ...parsed.weightReminder },
        mealReminder: { ...DEFAULT_SETTINGS.mealReminder, ...parsed.mealReminder },
        trainingReminder: { ...DEFAULT_SETTINGS.trainingReminder, ...parsed.trainingReminder },
        weeklyReport: { ...DEFAULT_SETTINGS.weeklyReport, ...parsed.weeklyReport },
      };
    }

    // Migrate from old individual toggle keys
    const [wr, mr, tr] = await Promise.all([
      AsyncStorage.getItem(OLD_KEYS.weight),
      AsyncStorage.getItem(OLD_KEYS.meal),
      AsyncStorage.getItem(OLD_KEYS.training),
    ]);

    const settings: NotificationSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (wr !== null) settings.weightReminder.enabled = wr === 'true';
    if (mr !== null) settings.mealReminder.enabled = mr === 'true';
    if (tr !== null) settings.trainingReminder.enabled = tr === 'true';

    // Persist migrated settings and clean up old keys
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    await Promise.all([
      AsyncStorage.removeItem(OLD_KEYS.weight),
      AsyncStorage.removeItem(OLD_KEYS.meal),
      AsyncStorage.removeItem(OLD_KEYS.training),
    ]);

    return settings;
  } catch (error) {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
}

export async function saveNotificationSettings(
  settings: NotificationSettings,
): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    await scheduleAllNotifications(settings);
  } catch (error) {
  }
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

async function scheduleDaily(
  identifier: string,
  title: string,
  body: string,
  time: NotificationTime,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      hour: time.hour,
      minute: time.minute,
      repeats: true,
    },
    identifier,
  });
}

async function scheduleWeekly(
  identifier: string,
  title: string,
  body: string,
  expoWeekday: number,
  time: NotificationTime,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      weekday: expoWeekday,
      hour: time.hour,
      minute: time.minute,
      repeats: true,
    },
    identifier,
  });
}

export async function scheduleAllNotifications(
  settings: NotificationSettings,
): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  try {
    // Weight reminder (daily)
    if (settings.weightReminder.enabled) {
      await scheduleDaily(
        'bf-weight',
        '体重を記録しましょう',
        '今日の体重を記録して、目標への進捗を確認しましょう',
        settings.weightReminder.time,
      );
    }

    // Meal reminders (3x daily)
    if (settings.mealReminder.enabled) {
      await scheduleDaily(
        'bf-meal-breakfast',
        '朝食を記録しましょう',
        '朝食の内容を記録して、栄養バランスを管理しましょう',
        settings.mealReminder.breakfastTime,
      );
      await scheduleDaily(
        'bf-meal-lunch',
        '昼食を記録しましょう',
        '昼食の内容を記録しましょう',
        settings.mealReminder.lunchTime,
      );
      await scheduleDaily(
        'bf-meal-dinner',
        '夕食を記録しましょう',
        '夕食の内容を記録して、1日の栄養摂取量を確認しましょう',
        settings.mealReminder.dinnerTime,
      );
    }

    // Training reminders (weekly per selected day)
    if (settings.trainingReminder.enabled) {
      for (const day of settings.trainingReminder.days) {
        await scheduleWeekly(
          `bf-training-${day}`,
          'トレーニングの日です',
          '今日はトレーニング日です。頑張りましょう',
          toExpoWeekday(day),
          settings.trainingReminder.time,
        );
      }
    }

    // Weekly report
    if (settings.weeklyReport.enabled) {
      await scheduleWeekly(
        'bf-weekly-report',
        '週次レポート',
        '今週の記録をまとめました。確認してみましょう',
        toExpoWeekday(settings.weeklyReport.dayOfWeek),
        settings.weeklyReport.time,
      );
    }
  } catch (error) {
  }
}

/** Re-load saved settings and reschedule all notifications */
export async function rescheduleNotifications(): Promise<void> {
  const settings = await loadNotificationSettings();
  await scheduleAllNotifications(settings);
}
