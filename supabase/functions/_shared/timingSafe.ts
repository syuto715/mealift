// v1.6.1 — shared constant-time string comparison for shared-secret / cron
// auth headers. Extracted from revenuecat-webhook so cleanup-idempotency-keys
// and send-push-notifications stop using `!==` (timing-observable), closing the
// character-by-character brute-force side channel on CRON_SECRET.
//
// Pure TS (no Deno globals) so it is unit-testable under Node jest as well.

// Length-independent constant-time compare of the content bytes. (The length
// of a shared secret is not itself sensitive.)
export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) {
    let r = 1;
    for (let i = 0; i < ab.length; i++) r |= ab[i] ^ (bb[i % (bb.length || 1)] ?? 0);
    return false;
  }
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}
