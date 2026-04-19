import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '../../types/profile';
import { TRIAL_DURATION_DAYS } from '../../constants/pricing';

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
// Known notification IDs
// ---------------------------------------------------------------------------
//
// All reminders this service owns are scheduled with fixed identifiers so we
// can cancel them precisely instead of blasting every schedule on the device
// (which used to wipe widgetService.bf-daily-summary and rest-timer pings).

const ID_WEIGHT = 'bf-weight';
const ID_MEAL_BREAKFAST = 'bf-meal-breakfast';
const ID_MEAL_LUNCH = 'bf-meal-lunch';
const ID_MEAL_DINNER = 'bf-meal-dinner';
const ID_WEEKLY_REPORT = 'bf-weekly-report';
const ID_TRAINING_PREFIX = 'bf-training-';
const ID_TRIAL_ENDING = 'bf-trial-ending';
const ID_TRIAL_ENDED = 'bf-trial-ended';

/** Every static ID owned by scheduleAllNotifications. Rebuilt on each schedule. */
const STATIC_IDS = [
  ID_WEIGHT,
  ID_MEAL_BREAKFAST,
  ID_MEAL_LUNCH,
  ID_MEAL_DINNER,
  ID_WEEKLY_REPORT,
] as const;

/** Training IDs are weekday-indexed, so we cancel all 7 slots every time. */
const TRAINING_IDS = [0, 1, 2, 3, 4, 5, 6].map((d) => `${ID_TRAINING_PREFIX}${d}`);

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
// Initialize (idempotent across re-mounts / Fast Refresh)
// ---------------------------------------------------------------------------

let initialized = false;

export async function initializeNotifications(): Promise<void> {
  if (initialized) return;
  initialized = true;

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
    try {
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'リマインダー',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      });
    } catch {
      // Non-fatal — channel creation is idempotent at the OS level.
    }
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

/**
 * Persist settings only. Does NOT reschedule notifications — the caller is
 * responsible for calling `scheduleAllNotifications` when the user has
 * finished editing (typically on screen blur). This separation prevents a
 * rapid sequence of toggles from firing cancel+schedule on every change.
 */
export async function persistNotificationSettings(
  settings: NotificationSettings,
): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Non-fatal
  }
}

/**
 * Persist settings AND immediately reschedule. Prefer `persistNotificationSettings`
 * for per-keystroke writes and schedule once at blur.
 */
export async function saveNotificationSettings(
  settings: NotificationSettings,
): Promise<void> {
  await persistNotificationSettings(settings);
  await scheduleAllNotifications(settings);
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

async function scheduleOneShot(
  identifier: string,
  title: string,
  body: string,
  date: Date,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
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

/**
 * Cancel only the IDs this service owns. Unlike
 * `cancelAllScheduledNotificationsAsync`, this does not wipe unrelated
 * schedules (widget daily summary, rest-timer pings, etc.), so calling it on
 * every settings change stays side-effect free.
 */
async function cancelOwnedNotifications(): Promise<void> {
  const all = [...STATIC_IDS, ...TRAINING_IDS];
  await Promise.all(
    all.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {
        // The ID might not exist yet (first run, or toggle was off) — expo
        // throws in that case. Swallow since the outcome we want is "not
        // scheduled afterwards" and that's already true.
      }),
    ),
  );
}

// Serialize concurrent scheduleAllNotifications() calls. Before this guard, a
// rapid sequence of toggles in the settings screen could interleave two
// cancel+schedule passes and leave duplicates on iOS (the OS side-effects
// between the two awaits aren't atomic across expo's JSI bridge).
let schedulingInFlight: Promise<void> | null = null;
let lastScheduleStartedAt = 0;
const SCHEDULE_DEBOUNCE_MS = 3000;

export async function scheduleAllNotifications(
  settings: NotificationSettings,
): Promise<void> {
  // Debounce: drop repeated calls within 3s. The settings screen used to
  // invoke this on every toggle/time-picker confirm; a user flipping three
  // switches fast would trigger three independent cancel+schedule passes.
  const now = Date.now();
  if (now - lastScheduleStartedAt < SCHEDULE_DEBOUNCE_MS) {
    return;
  }
  lastScheduleStartedAt = now;

  // Chain behind any in-flight run so we always observe its final state
  // before we start our own cancel+schedule sequence.
  while (schedulingInFlight) {
    try {
      await schedulingInFlight;
    } catch {
      // previous run threw — we still want to try fresh
    }
  }

  const run = (async () => {
    await cancelOwnedNotifications();

    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return;

    try {
      // Weight reminder (daily)
      if (settings.weightReminder.enabled) {
        await scheduleDaily(
          ID_WEIGHT,
          '体重を記録しましょう',
          '今日の体重を記録して、目標への進捗を確認しましょう',
          settings.weightReminder.time,
        );
      }

      // Meal reminders (3x daily)
      if (settings.mealReminder.enabled) {
        await scheduleDaily(
          ID_MEAL_BREAKFAST,
          '朝食を記録しましょう',
          '朝食の内容を記録して、栄養バランスを管理しましょう',
          settings.mealReminder.breakfastTime,
        );
        await scheduleDaily(
          ID_MEAL_LUNCH,
          '昼食を記録しましょう',
          '昼食の内容を記録しましょう',
          settings.mealReminder.lunchTime,
        );
        await scheduleDaily(
          ID_MEAL_DINNER,
          '夕食を記録しましょう',
          '夕食の内容を記録して、1日の栄養摂取量を確認しましょう',
          settings.mealReminder.dinnerTime,
        );
      }

      // Training reminders (weekly per selected day)
      if (settings.trainingReminder.enabled) {
        for (const day of settings.trainingReminder.days) {
          await scheduleWeekly(
            `${ID_TRAINING_PREFIX}${day}`,
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
          ID_WEEKLY_REPORT,
          '週次レポート',
          '今週の記録をまとめました。確認してみましょう',
          toExpoWeekday(settings.weeklyReport.dayOfWeek),
          settings.weeklyReport.time,
        );
      }
    } catch (error) {
      // Scheduling failures per-notification are non-fatal — one bad
      // notification shouldn't block the rest or poison the guard.
      void error;
    }
  })();

  schedulingInFlight = run;
  try {
    await run;
  } finally {
    if (schedulingInFlight === run) schedulingInFlight = null;
  }
}

/** Re-load saved settings and reschedule all notifications */
export async function rescheduleNotifications(): Promise<void> {
  const settings = await loadNotificationSettings();
  await scheduleAllNotifications(settings);
}

// ---------------------------------------------------------------------------
// Trial notifications
// ---------------------------------------------------------------------------
//
// Two one-shot notifications inform the user about the 7-day Plus trial:
//   - bf-trial-ending : fires 24h before trial ends, prompts "upgrade to keep"
//   - bf-trial-ended  : fires at trial end, tells the user they're on Free now
//
// These live outside scheduleAllNotifications because they are driven by the
// Profile (trial_started_at column) rather than NotificationSettings. Callers
// invoke scheduleTrialNotifications() on trial start and on app launch.

const DAY_MS = 24 * 60 * 60 * 1000;

export async function scheduleTrialNotifications(
  profile: Profile | null,
): Promise<void> {
  // Always cancel first — cheap, and guarantees no stale schedules remain
  // after trial end, cancellation, or plan purchase.
  await Promise.all([
    Notifications.cancelScheduledNotificationAsync(ID_TRIAL_ENDING).catch(() => {}),
    Notifications.cancelScheduledNotificationAsync(ID_TRIAL_ENDED).catch(() => {}),
  ]);

  if (!profile?.trialStartedAt) return;
  const startedMs = Date.parse(profile.trialStartedAt);
  if (Number.isNaN(startedMs)) return;

  const endMs = startedMs + TRIAL_DURATION_DAYS * DAY_MS;
  const now = Date.now();
  if (endMs <= now) return;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  // Paid plan overrides trial — skip trial-end pings if they've already upgraded.
  if (profile.planExpiresAt && Date.parse(profile.planExpiresAt) > now) return;

  const endingMs = endMs - DAY_MS;
  try {
    if (endingMs > now) {
      await scheduleOneShot(
        ID_TRIAL_ENDING,
        'トライアル終了まで24時間',
        'Plus の機能は明日まで。継続するにはプランに加入してください。',
        new Date(endingMs),
      );
    }
    await scheduleOneShot(
      ID_TRIAL_ENDED,
      'トライアルが終了しました',
      '引き続き Plus 機能をご利用になるにはプランに加入してください。',
      new Date(endMs),
    );
  } catch {
    // Per-notification failures are non-fatal.
  }
}

// Single-shot boot flag. _layout.tsx's useEffect can fire repeatedly during
// Fast Refresh / deep-link remounts; the guard below makes bootstrapNotifications
// a no-op on the second and subsequent calls within the same JS runtime.
let bootstrapped = false;

// Bump this when a previous release scheduled notifications that the current
// ID-based cancel can't reach (e.g. stale schedules from builds without fixed
// identifiers). Each device runs the device-wide sweep exactly once per
// version bump, then persists the marker so subsequent launches are cheap.
const LEGACY_SWEEP_VERSION = '2026-04-v1';
const LEGACY_SWEEP_KEY = 'notifications_legacy_sweep_version';

async function sweepLegacyNotificationsOnce(): Promise<void> {
  try {
    const marker = await AsyncStorage.getItem(LEGACY_SWEEP_KEY);
    if (marker === LEGACY_SWEEP_VERSION) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.setItem(LEGACY_SWEEP_KEY, LEGACY_SWEEP_VERSION);
  } catch {
    // Non-fatal — if AsyncStorage is unavailable we just skip. A later launch
    // can still run the sweep.
  }
}

/**
 * App-startup entry point. Initialises the Expo notification handler exactly
 * once, then performs the initial reschedule from persisted settings. Safe to
 * call from multiple useEffect invocations — only the first does real work.
 */
export async function bootstrapNotifications(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  await initializeNotifications();
  await sweepLegacyNotificationsOnce();
  await rescheduleNotifications();
}
