// Build 16 / Phase 1 (Feature H) / Phase 1.4 Codex pass 1 — pure
// helper that decides whether a notification response should
// trigger an in-app navigation, and to where.
//
// Extracted from app/_layout.tsx so the allowlist + param coercion
// logic can be unit-tested without React Native or expo-router
// runtime, and so the same decision can be reused by both
// addNotificationResponseReceivedListener (warm app) and
// getLastNotificationResponseAsync (cold start).

// Allowlist of routes that may be reached via a notification tap.
// Today only the weekly-report path needs it; new entries get added
// here as more notifications grow data fields.
export const ALLOWED_NOTIFICATION_ROUTES: ReadonlySet<string> = new Set([
  '/(tabs)/progress/weekly-report',
]);

export interface NotificationRouteDecision {
  route: string;
  params: Record<string, string>;
}

// Pulls (route, params) out of a notification's content.data, returns
// null when:
//   - data is missing / not an object
//   - data.route is not a string or not in the allowlist
//   - data.params is missing or not an object — params default to {}
//
// Param coercion is intentionally narrow: only string entries
// survive. Numeric / boolean params would round-trip via the
// notification storage as-is, but expo-router URL params are
// strings, so dropping non-strings keeps the routing layer
// deterministic instead of silently coercing.
export function decideNotificationRoute(
  data: unknown,
): NotificationRouteDecision | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { route?: unknown; params?: unknown };
  if (typeof d.route !== 'string') return null;
  if (!ALLOWED_NOTIFICATION_ROUTES.has(d.route)) return null;

  const rawParams =
    d.params && typeof d.params === 'object'
      ? (d.params as Record<string, unknown>)
      : {};
  const params: Record<string, string> = {};
  for (const k of Object.keys(rawParams)) {
    const v = rawParams[k];
    if (typeof v === 'string') params[k] = v;
  }
  return { route: d.route, params };
}
