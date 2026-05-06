import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { SupabaseClient } from '@supabase/supabase-js';

// pushTokenService — Build 15 / Feature 3 client side.
//
// Single entry point: registerExpoPushToken(userId, supabase). Caller
// (loginSyncBootstrap.runLoginSync) fires this best-effort post-claim
// so a permission-denied / no-project-id / network failure never
// blocks login or sync. The outcome union exists for tests + future
// telemetry; runtime callers ignore it.
//
// Token lifecycle:
//   - Permission status checked first; request fired only if not yet
//     granted. iOS shows the OS prompt at most once unless the user
//     explicitly toggles in Settings.
//   - Expo project ID resolved from Constants.expoConfig.extra.eas.projectId
//     (set in app.config.ts at line 107). Required for production push
//     token issuance — Expo's API needs to know which app the device
//     is registering against.
//   - Token persisted via UPSERT on (user_id, expo_push_token). Repeat
//     registers from the same device do not create duplicate rows;
//     last_seen_at refreshes so a future cleanup job can prune stale.
//
// Test seam:
//   `options.notifications`, `options.platform`, `options.projectId`
//   take precedence over the runtime defaults so jest can drive each
//   outcome branch without mocking globals.

export type RegisterPushTokenOutcome =
  | { kind: 'registered'; token: string }
  | { kind: 'permission_denied' }
  | { kind: 'unsupported_platform' }
  | { kind: 'no_project_id' }
  | { kind: 'error'; message: string };

export interface NotificationsBindings {
  getPermissionsAsync: () => Promise<{ status: string }>;
  requestPermissionsAsync: () => Promise<{ status: string }>;
  getExpoPushTokenAsync: (opts: {
    projectId: string;
  }) => Promise<{ data: string }>;
}

export interface RegisterPushTokenOptions {
  notifications?: NotificationsBindings;
  platform?: typeof Platform.OS;
  projectId?: string;
}

const SUPPORTED_PLATFORMS = new Set<typeof Platform.OS>(['ios', 'android']);

export async function registerExpoPushToken(
  userId: string,
  client: SupabaseClient,
  options: RegisterPushTokenOptions = {},
): Promise<RegisterPushTokenOutcome> {
  const platform = options.platform ?? Platform.OS;
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    // Web / macos / windows — no Expo push channel.
    return { kind: 'unsupported_platform' };
  }

  const notifications: NotificationsBindings =
    options.notifications ?? {
      getPermissionsAsync: Notifications.getPermissionsAsync,
      requestPermissionsAsync: Notifications.requestPermissionsAsync,
      getExpoPushTokenAsync: Notifications.getExpoPushTokenAsync,
    };

  // Permission flow. Existing 'granted' short-circuits the OS prompt
  // (important: iOS only allows the request prompt once per install).
  const existing = await notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (finalStatus !== 'granted') {
    const requested = await notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== 'granted') {
    return { kind: 'permission_denied' };
  }

  // EAS project ID — required by Expo Push API to scope the token to
  // this app. Set in app.config.ts:107 (`extra.eas.projectId`).
  const projectId =
    options.projectId ??
    (Constants.expoConfig?.extra?.eas as
      | { projectId?: string }
      | undefined)?.projectId;
  if (!projectId) {
    return { kind: 'no_project_id' };
  }

  let token: string;
  try {
    const tokenData = await notifications.getExpoPushTokenAsync({ projectId });
    token = tokenData.data;
  } catch (e) {
    return {
      kind: 'error',
      message: e instanceof Error ? e.message : 'token request failed',
    };
  }

  const { error } = await client.from('push_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: token,
      platform,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,expo_push_token' },
  );

  if (error) {
    return {
      kind: 'error',
      message: error.message ?? 'upsert failed',
    };
  }

  return { kind: 'registered', token };
}
