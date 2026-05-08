import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GeneratedProgram } from './aiWorkoutService';

// Build 15 / Session 8 / Phase 7 / Commit 26 — local cache for AI menu
// generation results.
//
// Why AsyncStorage and not MMKV: react-native-mmkv is in package.json
// but unused anywhere in the app and unverified against this app's CNG
// build. AI menu generation runs at most ~100 times/month per user, so
// the ~30ms async overhead is invisible against the 5-15 sec EF call
// it replaces. Sticking with AsyncStorage matches every other store in
// the project and removes a Hard-stop #6 smoke-test risk. Build 16+
// TODO 11 tracks possible MMKV migration.
//
// Key composition (sign-off Phase 7 §1):
//   namespace = 'ai_menu:cache:<userId>:<hash>'
//   hash      = fnv1a(JSON.stringify(canonicalInput))
//   canonicalInput = { targetMuscles*, durationMinutes, equipmentSet*,
//                      goalType, exerciseSlugs* }
//   * arrays sorted before stringify to make order irrelevant.
//
// Per-user namespace prevents account-switch contamination. cacheVersion
// is stored on the entry side (not in the key) so a bump cleanly
// invalidates old entries via version mismatch on read instead of
// orphaning them under a dead key prefix.

// Bump when the cache entry shape changes or when EF semantics shift
// in a way that should invalidate everything (e.g. prompt template
// rework that changes the response distribution). v1 is the initial
// release.
export const CACHE_VERSION = 1;

// 7 days. Long enough that a user generating the same program weekly
// hits cache; short enough that drift in seed exercises / equipment /
// goal eventually flushes through.
export const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const KEY_PREFIX = 'ai_menu:cache:';
const HITS_KEY = 'ai_menu:telemetry:cache_hits';
const MISSES_KEY = 'ai_menu:telemetry:cache_misses';

// Subset of AsyncStorage's API the cache touches. Keeping the surface
// small lets tests pass an in-memory fake without dragging in the
// native polyfill chain.
export interface CacheStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface CacheableInput {
  targetMuscles: string[];
  durationMinutes: number;
  equipmentSet: string[];
  goalType: string | null;
  exerciseSlugs: string[];
}

interface CacheEntry {
  version: number;
  createdAt: number; // Date.now() millis at write time
  data: GeneratedProgram;
}

// FNV-1a 32-bit. ~10 LOC, zero dependencies, collision rate acceptable
// for a single user's lifetime cache (<100 entries) — birthday-paradox
// math gives <0.001% collision risk. Cryptographic strength isn't
// needed because the cache is local-only and each entry is namespaced
// per-user, so a collision at worst returns a stale program for the
// same user (privacy-safe, just confusing).
export function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // Math.imul + >>> 0 keeps multiplication 32-bit-unsigned in JS.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// Serialize the canonical input. Arrays are sorted in place on a
// shallow copy so callers can pass their original arrays without
// worrying about mutation.
export function buildCacheKey(input: CacheableInput): string {
  const canonical = JSON.stringify({
    targetMuscles: [...input.targetMuscles].sort(),
    durationMinutes: input.durationMinutes,
    equipmentSet: [...input.equipmentSet].sort(),
    goalType: input.goalType ?? null,
    exerciseSlugs: [...input.exerciseSlugs].sort(),
  });
  return fnv1a(canonical);
}

function namespaceKey(userId: string, hash: string): string {
  return `${KEY_PREFIX}${userId}:${hash}`;
}

// Lazy expiry — TTL + cacheVersion are checked on read. Eager cleanup
// of expired entries would need a periodic background job; not worth
// it given storage worst case <1 MB per user.
export async function getCached(
  userId: string,
  hash: string,
  options?: {
    storage?: CacheStorage;
    now?: number;
    ttlMs?: number;
  },
): Promise<GeneratedProgram | null> {
  const storage = options?.storage ?? AsyncStorage;
  const now = options?.now ?? Date.now();
  const ttl = options?.ttlMs ?? TTL_MS;
  const key = namespaceKey(userId, hash);

  const raw = await storage.getItem(key);
  if (raw == null) return null;

  let entry: CacheEntry;
  try {
    entry = JSON.parse(raw) as CacheEntry;
  } catch {
    // Corrupt entry — drop and report miss.
    await storage.removeItem(key);
    return null;
  }

  if (entry.version !== CACHE_VERSION) {
    await storage.removeItem(key);
    return null;
  }
  if (now - entry.createdAt > ttl) {
    await storage.removeItem(key);
    return null;
  }
  return entry.data;
}

export async function setCached(
  userId: string,
  hash: string,
  data: GeneratedProgram,
  options?: {
    storage?: CacheStorage;
    now?: number;
  },
): Promise<void> {
  const storage = options?.storage ?? AsyncStorage;
  const now = options?.now ?? Date.now();
  const entry: CacheEntry = {
    version: CACHE_VERSION,
    createdAt: now,
    data,
  };
  await storage.setItem(namespaceKey(userId, hash), JSON.stringify(entry));
}

// Telemetry counters. Fire-and-forget from the cache integration site
// so a write failure doesn't break generation. Reads are exposed for
// future debug surfaces (Settings UI is Phase 7-out per sign-off).
async function increment(
  storage: CacheStorage,
  key: string,
): Promise<void> {
  try {
    const raw = await storage.getItem(key);
    const n = raw ? Number.parseInt(raw, 10) || 0 : 0;
    await storage.setItem(key, String(n + 1));
  } catch {
    // Telemetry best-effort; never propagate a failure here.
  }
}

export async function recordCacheHit(
  options?: { storage?: CacheStorage },
): Promise<void> {
  return increment(options?.storage ?? AsyncStorage, HITS_KEY);
}

export async function recordCacheMiss(
  options?: { storage?: CacheStorage },
): Promise<void> {
  return increment(options?.storage ?? AsyncStorage, MISSES_KEY);
}

export async function readTelemetry(
  options?: { storage?: CacheStorage },
): Promise<{ hits: number; misses: number }> {
  const storage = options?.storage ?? AsyncStorage;
  const [rawHits, rawMisses] = await Promise.all([
    storage.getItem(HITS_KEY),
    storage.getItem(MISSES_KEY),
  ]);
  return {
    hits: rawHits ? Number.parseInt(rawHits, 10) || 0 : 0,
    misses: rawMisses ? Number.parseInt(rawMisses, 10) || 0 : 0,
  };
}
