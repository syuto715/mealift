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

export interface NotificationState {
  settings: NotificationSettings;
  profile: Profile | null;
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
// Every reminder the orchestrator owns is scheduled with a fixed identifier so
// cancelAllOwnedNotifications() can target only our schedules — it must not
// wipe rest-timer pings (restTimerService, transient IDs) or the widget daily
// summary (widgetService, bf-daily-summary).

const ID_WEIGHT = 'bf-weight';
const ID_MEAL_BREAKFAST = 'bf-meal-breakfast';
const ID_MEAL_LUNCH = 'bf-meal-lunch';
const ID_MEAL_DINNER = 'bf-meal-dinner';
const ID_WEEKLY_REPORT = 'bf-weekly-report';
const ID_TRAINING_PREFIX = 'bf-training-';
const ID_TRIAL_ENDING = 'bf-trial-ending';
const ID_TRIAL_ENDED = 'bf-trial-ended';

const TRAINING_IDS = [0, 1, 2, 3, 4, 5, 6].map((d) => `${ID_TRAINING_PREFIX}${d}`);

/**
 * Every identifier owned by syncNotifications. cancelAllOwnedNotifications()
 * cancels exactly this set — nothing more, nothing less. RestTimer and widget
 * daily summary IDs are intentionally absent; those services manage their own
 * lifecycles.
 */
const SYNC_NOTIFICATION_IDS: readonly string[] = [
  ID_WEIGHT,
  ID_MEAL_BREAKFAST,
  ID_MEAL_LUNCH,
  ID_MEAL_DINNER,
  ID_WEEKLY_REPORT,
  ...TRAINING_IDS,
  ID_TRIAL_ENDING,
  ID_TRIAL_ENDED,
] as const;

export const KNOWN_NOTIFICATION_IDS = SYNC_NOTIFICATION_IDS;

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

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    await Promise.all([
      AsyncStorage.removeItem(OLD_KEYS.weight),
      AsyncStorage.removeItem(OLD_KEYS.meal),
      AsyncStorage.removeItem(OLD_KEYS.training),
    ]);

    return settings;
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
}

/**
 * Persist settings only. Does NOT reschedule — the caller is responsible for
 * calling `syncNotifications` once editing is done (typically on screen blur).
 * This separation prevents a rapid sequence of toggles from firing cancel+
 * schedule on every change.
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

// ---------------------------------------------------------------------------
// Low-level scheduling primitives (private)
// ---------------------------------------------------------------------------

async function _scheduleDaily(
  identifier: string,
  title: string,
  body: string,
  time: NotificationTime,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier,
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
  });
}

async function _scheduleWeekly(
  identifier: string,
  title: string,
  body: string,
  expoWeekday: number,
  time: NotificationTime,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier,
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
  });
}

async function _scheduleOneShot(
  identifier: string,
  title: string,
  body: string,
  date: Date,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier,
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
  });
}

// ---------------------------------------------------------------------------
// syncNotifications — single source of truth
// ---------------------------------------------------------------------------
//
// Design rule: NO other function in this module schedules notifications.
// Every caller outside this module funnels through syncNotifications({settings,
// profile}). Each call:
//   1. Cancels every SYNC_NOTIFICATION_IDS id (clean slate; does not touch
//      rest-timer / widget schedules).
//   2. Re-schedules the complete set from the snapshot.
// Concurrent invocations are linearised and stale calls skip themselves so the
// last caller wins without redundant OS writes.

let _currentStateVersion = 0;
let _appliedStateVersion = 0;
let _schedulingInFlight: Promise<void> | null = null;

export async function syncNotifications(state: NotificationState): Promise<void> {
  const myVersion = ++_currentStateVersion;

  // Wait for any in-flight run to finish so we see a stable OS state.
  while (_schedulingInFlight) {
    try {
      await _schedulingInFlight;
    } catch {
      // Previous run threw — we still want to try fresh.
    }
  }

  // If a newer call arrived during the wait, let it handle the final state.
  if (myVersion < _currentStateVersion) return;

  // If we already applied this exact version (no new call since), skip.
  if (myVersion <= _appliedStateVersion) return;

  const run = _doSyncNotifications(state);
  _schedulingInFlight = run;
  try {
    await run;
    _appliedStateVersion = myVersion;
  } finally {
    if (_schedulingInFlight === run) _schedulingInFlight = null;
  }
}

async function _doSyncNotifications(
  state: NotificationState,
): Promise<void> {
  // Step A — clean slate for every ID we own.
  await cancelAllOwnedNotifications();

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  const { settings, profile } = state;

  // Step B — reminder schedules from NotificationSettings.
  try {
    if (settings.weightReminder.enabled) {
      await _scheduleDaily(
        ID_WEIGHT,
        '体重を記録しましょう',
        '今日の体重を記録して、目標への進捗を確認しましょう',
        settings.weightReminder.time,
      );
    }

    if (settings.mealReminder.enabled) {
      await _scheduleDaily(
        ID_MEAL_BREAKFAST,
        '朝食を記録しましょう',
        '朝食の内容を記録して、栄養バランスを管理しましょう',
        settings.mealReminder.breakfastTime,
      );
      await _scheduleDaily(
        ID_MEAL_LUNCH,
        '昼食を記録しましょう',
        '昼食の内容を記録しましょう',
        settings.mealReminder.lunchTime,
      );
      await _scheduleDaily(
        ID_MEAL_DINNER,
        '夕食を記録しましょう',
        '夕食の内容を記録して、1日の栄養摂取量を確認しましょう',
        settings.mealReminder.dinnerTime,
      );
    }

    if (settings.trainingReminder.enabled) {
      for (const day of settings.trainingReminder.days) {
        await _scheduleWeekly(
          `${ID_TRAINING_PREFIX}${day}`,
          'トレーニングの日です',
          '今日はトレーニング日です。頑張りましょう',
          toExpoWeekday(day),
          settings.trainingReminder.time,
        );
      }
    }

    if (settings.weeklyReport.enabled) {
      await _scheduleWeekly(
        ID_WEEKLY_REPORT,
        '週次レポート',
        '今週の記録をまとめました。確認してみましょう',
        toExpoWeekday(settings.weeklyReport.dayOfWeek),
        settings.weeklyReport.time,
      );
    }
  } catch {
    // Per-notification failures are non-fatal — one bad schedule should not
    // poison the rest of the orchestration pass.
  }

  // Step C — trial schedules from Profile.
  await _scheduleTrial(profile);
}

async function _scheduleTrial(profile: Profile | null): Promise<void> {
  if (!profile?.trialStartedAt) return;

  const startedMs = Date.parse(profile.trialStartedAt);
  if (Number.isNaN(startedMs)) return;

  const endMs = startedMs + TRIAL_DURATION_DAYS * DAY_MS;
  const now = Date.now();
  if (endMs <= now) return;

  // Paid plan overrides trial — skip trial-end pings if they've already upgraded.
  if (profile.planExpiresAt && Date.parse(profile.planExpiresAt) > now) return;

  const endingMs = endMs - DAY_MS;
  try {
    if (endingMs > now) {
      await _scheduleOneShot(
        ID_TRIAL_ENDING,
        'トライアル終了まで24時間',
        'Plus の機能は明日まで。継続するにはプランに加入してください。',
        new Date(endingMs),
      );
    }
    await _scheduleOneShot(
      ID_TRIAL_ENDED,
      'トライアルが終了しました',
      '引き続き Plus 機能をご利用になるにはプランに加入してください。',
      new Date(endMs),
    );
  } catch {
    // Per-notification failures are non-fatal.
  }
}

/**
 * Cancel only the IDs this orchestrator owns. Never cancels rest-timer or
 * widget daily summary schedules.
 */
async function cancelAllOwnedNotifications(): Promise<void> {
  await Promise.all(
    SYNC_NOTIFICATION_IDS.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {
        // The ID might not exist yet; swallow because the post-condition we
        // want ("not scheduled afterwards") is already true.
      }),
    ),
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Bootstrap (single-shot across re-mounts)
// ---------------------------------------------------------------------------

let bootstrapped = false;

// Bump this when a previous release scheduled notifications that the current
// ID-based cancel can't reach (e.g. random-UUID schedules or renamed IDs).
// Each device runs the device-wide sweep exactly once per version bump.
const LEGACY_SWEEP_VERSION = '2026-04-v4';
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
 * App-startup entry point. Initialises the Expo handler once, runs the legacy
 * sweep if needed, then performs an initial syncNotifications from persisted
 * settings + supplied profile. Safe to call from multiple useEffect invocations
 * — only the first does real work.
 */
export async function bootstrapNotifications(
  profile: Profile | null,
): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  await initializeNotifications();
  await sweepLegacyNotificationsOnce();
  const settings = await loadNotificationSettings();
  await syncNotifications({ settings, profile });
}
