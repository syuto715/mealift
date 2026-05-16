import type { ExpoConfig } from '@expo/config-types';

// Expo loads this file at build time. `extra` is forwarded to the app via
// expo-constants (read via Constants.expoConfig?.extra) — useful for native
// SDKs that need a key injected at compile time (e.g. RevenueCat).
const config: ExpoConfig = {
  name: 'ミーリフト',
  slug: 'mealift',
  version: '1.3.0',
  orientation: 'portrait',
  scheme: 'mealift',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  // OTA updates via EAS Update — a JS/asset bundle published to the
  // `production` (or `preview`) channel ships to users on launch without an
  // App Store re-review. Required for emergency hotfixes; native changes
  // still need a new binary. `runtimeVersion: appVersion` ties the bundle
  // to `version` above, so a 1.0.0 build only accepts 1.0.0 OTA payloads
  // — bump `version` whenever native code or this config changes.
  updates: {
    url: 'https://u.expo.dev/22e7739f-d13b-4080-b8ec-d2943e71767d',
    enabled: true,
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#1164C0',
  },
  ios: {
    icon: './assets/icon.png',
    supportsTablet: true,
    bundleIdentifier: 'com.mealift.app',
    // buildNumber is managed by EAS: eas.json sets
    // `cli.appVersionSource: "remote"` and `build.production.autoIncrement: true`,
    // so the App Store build number is sourced from the EAS server,
    // not from this file. Leaving a literal here was misleading —
    // it never made it onto a real binary post-Build-9.
    // Sign In with Apple capability — Expo prebuild adds the entitlement
    // when this flag is true. Apple Provider is enabled in Supabase Auth
    // (Bundle ID com.mealift.app, Team 9WCKU8U5XV, Key 7PP32JU7F4).
    usesAppleSignIn: true,
    // NOTE: NSHealthShareUsageDescription / NSHealthUpdateUsageDescription and
    // the `com.apple.developer.healthkit` entitlement are injected by the
    // @kingstinct/react-native-healthkit config plugin (see `plugins` below).
    // Keeping them here as well would cause the plugin to silently overwrite
    // the values at prebuild time.
    infoPlist: {
      NSCameraUsageDescription: '進捗写真を撮影するためにカメラへのアクセスが必要です。',
      NSPhotoLibraryUsageDescription: '体の変化を記録するために写真ライブラリへのアクセスが必要です。',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1164C0',
    },
    edgeToEdgeEnabled: true,
    package: 'com.mealift.app',
    versionCode: 1,
    permissions: [
      'android.permission.CAMERA',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.VIBRATE',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.SCHEDULE_EXACT_ALARM',
      'android.permission.RECORD_AUDIO',
    ],
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-font',
    'expo-notifications',
    [
      'expo-image-picker',
      {
        photosPermission: '体の変化を記録するために写真ライブラリへのアクセスが必要です。',
        cameraPermission: '進捗写真を撮影するためにカメラへのアクセスが必要です。',
      },
    ],
    [
      '@kingstinct/react-native-healthkit',
      {
        // Injected into Info.plist; shown on the HealthKit permission dialog.
        NSHealthShareUsageDescription:
          '消費カロリーを正確に計算するため、Appleヘルスケアから運動データを読み取ります。',
        // Required string even though the app never writes — HealthKit
        // entitlement validation insists both keys be present.
        NSHealthUpdateUsageDescription:
          'このアプリはAppleヘルスケアへデータを書き込みません。',
        // Skip background delivery entitlement — the spec reads on-demand.
        background: false,
      },
    ],
  ],
  extra: {
    router: {},
    eas: {
      projectId: '22e7739f-d13b-4080-b8ec-d2943e71767d',
    },
    // RevenueCat API keys (public SDK keys — safe to bundle).
    revenueCatIosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '',
    revenueCatAndroidApiKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '',
  },
};

export default config;
