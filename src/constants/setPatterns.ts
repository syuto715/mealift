import type { SetPattern, SetType } from '../types/workout';

// Build 15 / Feature 5-O — routine-level set pattern presets.
// Each preset describes how a routine_item with set_pattern set to its
// key should auto-fill target_sets / target_reps and how the session
// pre-render should lay out per-set roles (set_type) plus optional
// pattern_config JSON for per-pattern parameters.
//
// The patternConfig column is TEXT in SQLite; we serialize the JSON
// shapes defined here on write and parse on read. Keeping the shape
// pinned to a TS type means callers don't have to handle arbitrary
// JSON.

export interface PatternPreset {
  // i18n-friendly label for the chip UI.
  ja: string;
  // null = standard routine (no pattern). Mirrors the
  // workout_routine_items.set_pattern column.
  setPattern: SetPattern | null;
  // Default target_sets the routine_item gets on preset selection.
  defaultTargetSets: number;
  // Default target_reps. String to match the existing schema.
  defaultTargetReps: string;
  // Serialized pattern_config (JSON). null when the preset has no
  // tunable parameters.
  patternConfigJson: string | null;
}

// Drop set chain: 1 working set + N drop slots at descending percents.
export interface DropSetConfig {
  drops: number;
  percents: number[]; // length === drops; values in (0, 1)
}

// Top set + backoff: 1 top set + N backoff slots at backoff_pct.
export interface TopSetConfig {
  backoff_pct: number; // (0, 1)
  backoff_sets: number;
}

const DROP_DEFAULT_CONFIG: DropSetConfig = {
  drops: 3,
  percents: [0.8, 0.6, 0.4],
};

const TOP_DEFAULT_CONFIG: TopSetConfig = {
  backoff_pct: 0.8,
  backoff_sets: 3,
};

// Preset table — index by SetPattern key (or 'standard' for the
// no-pattern case). Order here is also the chip-row visual order.
export const PATTERN_PRESETS: PatternPreset[] = [
  {
    ja: '標準',
    setPattern: null,
    defaultTargetSets: 3,
    defaultTargetReps: '8-12',
    patternConfigJson: null,
  },
  {
    ja: '5×5',
    setPattern: '5x5',
    defaultTargetSets: 5,
    defaultTargetReps: '5',
    patternConfigJson: null,
  },
  {
    ja: 'トップ',
    setPattern: 'top_set',
    defaultTargetSets: 1 + TOP_DEFAULT_CONFIG.backoff_sets, // 1 top + 3 backoff
    defaultTargetReps: '5',
    patternConfigJson: JSON.stringify(TOP_DEFAULT_CONFIG),
  },
  {
    ja: 'ドロップ',
    setPattern: 'drop_set',
    defaultTargetSets: 1 + DROP_DEFAULT_CONFIG.drops, // 1 working + 3 drop
    defaultTargetReps: '8',
    patternConfigJson: JSON.stringify(DROP_DEFAULT_CONFIG),
  },
];

// Resolve a pattern key (or null) to its preset. Returns the standard
// preset on null / unknown values so the caller doesn't need to nil-check.
export function getPatternPreset(
  pattern: SetPattern | null,
): PatternPreset {
  if (pattern === null) return PATTERN_PRESETS[0];
  return PATTERN_PRESETS.find((p) => p.setPattern === pattern) ?? PATTERN_PRESETS[0];
}

// Parse pattern_config JSON; returns null on missing/malformed input.
// Strict typing per pattern keeps drop/top consumers from confusing
// shapes.
export function parseDropSetConfig(json: string | null): DropSetConfig | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.drops === 'number' &&
      Array.isArray(parsed.percents) &&
      parsed.percents.length === parsed.drops &&
      parsed.percents.every((p: unknown) => typeof p === 'number' && p > 0 && p < 1)
    ) {
      return parsed as DropSetConfig;
    }
  } catch {
    // fall through
  }
  return null;
}

export function parseTopSetConfig(json: string | null): TopSetConfig | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.backoff_pct === 'number' &&
      parsed.backoff_pct > 0 &&
      parsed.backoff_pct < 1 &&
      typeof parsed.backoff_sets === 'number' &&
      parsed.backoff_sets > 0
    ) {
      return parsed as TopSetConfig;
    }
  } catch {
    // fall through
  }
  return null;
}

// Color tokens used by the session set_type badge stripe. Kept here
// so the routine modal chip and the session set row stay in visual
// sync without duplicating the literals.
export const SET_TYPE_COLORS: Record<SetType, string> = {
  warmup: '#9CA3AF', // gray
  working: '#5B8DEF', // blue (matches primary-leaning chest accent)
  top: '#F2C94C', // gold
  drop: '#EF4444', // red
  failure: '#7F1D1D', // dark red
};

export const SET_TYPE_LABELS_JA: Record<SetType, string> = {
  warmup: 'ウォームアップ',
  working: 'ワーキング',
  top: 'トップ',
  drop: 'ドロップ',
  failure: '失敗',
};
