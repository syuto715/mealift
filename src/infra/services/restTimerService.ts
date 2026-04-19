import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  RestTimerSettings,
  DEFAULT_REST_TIMER_SETTINGS,
  ActiveTimer,
} from '../../types/restTimer';

const SETTINGS_KEY = 'rest_timer_settings_v1';

// --- Settings ---
export async function loadRestTimerSettings(): Promise<RestTimerSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_REST_TIMER_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<RestTimerSettings>;
    return { ...DEFAULT_REST_TIMER_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_REST_TIMER_SETTINGS };
  }
}

export async function saveRestTimerSettings(settings: RestTimerSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// --- Active timer state (in-memory; survives within app session) ---
let active: ActiveTimer | null = null;

class RestTimerService {
  async start(seconds: number, exerciseName?: string): Promise<void> {
    await this.cancel();

    let notificationId: string | null = null;
    try {
      notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '休憩終了',
          body: '次のセットに移りましょう 💪',
          sound: true,
          ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds,
          repeats: false,
        },
      });
    } catch {
      // Expo Go may block scheduled notifications; proceed without.
    }

    active = {
      startedAt: Date.now(),
      totalSeconds: seconds,
      notificationId,
      exerciseName,
    };
  }

  async cancel(): Promise<void> {
    if (active?.notificationId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(active.notificationId);
      } catch {
        // ignore
      }
    }
    active = null;
  }

  async extendBy(seconds: number): Promise<void> {
    if (!active) return;
    const elapsed = Math.floor((Date.now() - active.startedAt) / 1000);
    const remaining = Math.max(0, active.totalSeconds - elapsed);
    const newTotal = remaining + seconds;
    // Restart with new total
    const name = active.exerciseName;
    await this.start(newTotal, name);
  }

  getRemainingSeconds(): number {
    if (!active) return 0;
    const elapsed = Math.floor((Date.now() - active.startedAt) / 1000);
    return Math.max(0, active.totalSeconds - elapsed);
  }

  getTotalSeconds(): number {
    return active?.totalSeconds ?? 0;
  }

  getExerciseName(): string | undefined {
    return active?.exerciseName;
  }

  isActive(): boolean {
    if (!active) return false;
    return this.getRemainingSeconds() > 0;
  }

  async triggerCompletionFeedback(settings: RestTimerSettings): Promise<void> {
    if (settings.vibrationEnabled) {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        }, 300);
      } catch {
        // ignore
      }
    }
  }
}

export const restTimerService = new RestTimerService();
