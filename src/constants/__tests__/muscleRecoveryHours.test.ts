// Build 16 / Phase 6.0 — constants integrity for the per-muscle
// recovery time table. The Phase 6.1 domain layer will read this
// table; tests pin both the type-level coverage (every VolumeGroup
// has a value) and the value sanity (positive, in-range, large
// muscles ≥ small muscles per Phase 6 recon §B1 sign-off).

// volumeLandmark imports connection.ts which pulls in expo-sqlite —
// jest's CJS runtime can't parse the ESM-only SQLite module without
// transformation, so we mock the connection module exactly like
// volumeLandmark.test.ts does (the mock factory is unused here
// because we only consume the type + the constant array).
jest.mock('../../infra/database/connection', () => ({
  getDatabase: jest.fn(),
}));

import { MUSCLE_RECOVERY_HOURS } from '../muscleRecoveryHours';
import {
  VOLUME_GROUPS_ORDER,
  type VolumeGroup,
} from '../../domain/volumeLandmark';

describe('MUSCLE_RECOVERY_HOURS — constants integrity', () => {
  it('covers exactly the 9 VolumeGroup keys (no missing, no extra)', () => {
    const tableKeys = Object.keys(MUSCLE_RECOVERY_HOURS).sort();
    const expected = [...VOLUME_GROUPS_ORDER].sort();
    expect(tableKeys).toEqual(expected);
  });

  it('every value is a positive number', () => {
    for (const group of VOLUME_GROUPS_ORDER) {
      const v = MUSCLE_RECOVERY_HOURS[group];
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThan(0);
    }
  });

  it('every value is within sane training-recovery bounds (24-120h)', () => {
    // Values outside this range indicate either a typo or a literature
    // disagreement that needs sign-off. 24h floor: even small muscles
    // need recovery between hard sessions. 120h ceiling: anything more
    // than 5 days suggests we're modeling injury, not normal hypertrophy
    // recovery.
    for (const group of VOLUME_GROUPS_ORDER) {
      const v = MUSCLE_RECOVERY_HOURS[group];
      expect(v).toBeGreaterThanOrEqual(24);
      expect(v).toBeLessThanOrEqual(120);
    }
  });

  it('large multi-joint groups recover slower than smaller assist groups', () => {
    // Phase 6 recon §B1 sign-off: quads / hamstrings / glutes have
    // the longest recovery window; chest / back / shoulder_mid /
    // biceps / triceps / calves are smaller and recover faster.
    // Pin the relative ordering so any future tweak preserves the
    // semantics rather than silently flipping a large muscle to a
    // smaller value.
    const largeGroups: VolumeGroup[] = ['quads', 'hamstrings', 'glutes'];
    const smallGroups: VolumeGroup[] = [
      'chest',
      'back',
      'shoulder_mid',
      'biceps',
      'triceps',
      'calves',
    ];
    const minLarge = Math.min(
      ...largeGroups.map((g) => MUSCLE_RECOVERY_HOURS[g]),
    );
    const maxSmall = Math.max(
      ...smallGroups.map((g) => MUSCLE_RECOVERY_HOURS[g]),
    );
    expect(minLarge).toBeGreaterThanOrEqual(maxSmall);
  });

  it('matches the recon §B1 sign-off values exactly', () => {
    // Pin every value so an accidental edit shows up as a test diff.
    // Mirrors Phase 2.1's VOLUME_LANDMARKS pin-on-edit convention.
    expect(MUSCLE_RECOVERY_HOURS).toEqual({
      chest: 48,
      back: 48,
      shoulder_mid: 48,
      biceps: 48,
      triceps: 48,
      calves: 48,
      quads: 72,
      hamstrings: 72,
      glutes: 72,
    });
  });
});
