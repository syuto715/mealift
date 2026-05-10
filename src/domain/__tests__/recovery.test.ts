// Build 16 / Phase 6.1 — domain layer tests for muscle recovery
// state. Two layers:
//   1. computeRecoveryState — pure logic, edge cases, boundary pinning
//      at the 50%/100% state transitions + the unstimulated /
//      clock-skew / recoveryHours<=0 special paths.
//   2. summarizeRecovery — 9-group aggregation + missing-key
//      defensiveness.

// VolumeGroup re-imports volumeLandmark which pulls in the SQLite
// connection module. Mock it out — same workaround as Phase 6.0
// muscleRecoveryHours.test.ts (Build 16+ TODO 26 tracks the structural
// fix to split VolumeGroup into a DB-free module).
jest.mock('../../infra/database/connection', () => ({
  getDatabase: jest.fn(),
}));

import {
  computeRecoveryState,
  summarizeRecovery,
  type RecoveryStateLabel,
} from '../recovery';
import { type VolumeGroup } from '../volumeLandmark';
import { MUSCLE_RECOVERY_HOURS } from '../../constants/muscleRecoveryHours';

const NOW = new Date('2026-05-10T12:00:00.000Z');

function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * 3_600_000);
}

// ---------------------------------------------------------------------------
// 1. computeRecoveryState — boundaries + special paths
// ---------------------------------------------------------------------------

describe('computeRecoveryState — special paths', () => {
  it('null lastTrained → unstimulated, 100%, null hours', () => {
    const r = computeRecoveryState(null, NOW, 48);
    expect(r.state).toBe('unstimulated');
    expect(r.recoveryPct).toBe(100);
    expect(r.hoursSinceLastTrained).toBeNull();
  });

  it('recoveryHours = 0 → recovered, 100% with real elapsed hours preserved (defensive divide-by-zero)', () => {
    // Codex review pass 1 / Important #1 — hoursSinceLastTrained
    // must reflect actual elapsed time even when recoveryHours
    // is degenerate. UI surfaces the elapsed value as "Nh前" copy;
    // hardcoding 0 would render "0時間前" for a muscle the user
    // actually trained 10h ago.
    const r = computeRecoveryState(hoursAgo(10), NOW, 0);
    expect(r.state).toBe('recovered');
    expect(r.recoveryPct).toBe(100);
    expect(r.hoursSinceLastTrained).toBeCloseTo(10, 5);
  });

  it('recoveryHours < 0 → recovered, 100% with elapsed hours preserved', () => {
    const r = computeRecoveryState(hoursAgo(5), NOW, -5);
    expect(r.state).toBe('recovered');
    expect(r.recoveryPct).toBe(100);
    expect(r.hoursSinceLastTrained).toBeCloseTo(5, 5);
  });

  it('clock skew (lastTrained > now) → recovering, 0%, 0 hours', () => {
    const future = new Date(NOW.getTime() + 3 * 3_600_000);
    const r = computeRecoveryState(future, NOW, 48);
    expect(r.state).toBe('recovering');
    expect(r.recoveryPct).toBe(0);
    expect(r.hoursSinceLastTrained).toBe(0);
  });

  it('lastTrained === now → recovering, 0%, 0 hours', () => {
    const r = computeRecoveryState(NOW, NOW, 48);
    expect(r.state).toBe('recovering');
    expect(r.recoveryPct).toBe(0);
    expect(r.hoursSinceLastTrained).toBe(0);
  });
});

describe('computeRecoveryState — Linear progression (48h recovery)', () => {
  // Pin the linear ramp at canonical points relative to a 48h window.
  it('0h → recovering, 0%', () => {
    const r = computeRecoveryState(hoursAgo(0), NOW, 48);
    expect(r.recoveryPct).toBe(0);
    expect(r.state).toBe('recovering');
  });

  it('12h → recovering, 25%', () => {
    const r = computeRecoveryState(hoursAgo(12), NOW, 48);
    expect(r.recoveryPct).toBeCloseTo(25, 5);
    expect(r.state).toBe('recovering');
  });

  it('24h → partial, 50% (transition boundary)', () => {
    const r = computeRecoveryState(hoursAgo(24), NOW, 48);
    expect(r.recoveryPct).toBeCloseTo(50, 5);
    expect(r.state).toBe('partial');
  });

  it('36h → partial, 75%', () => {
    const r = computeRecoveryState(hoursAgo(36), NOW, 48);
    expect(r.recoveryPct).toBeCloseTo(75, 5);
    expect(r.state).toBe('partial');
  });

  it('48h → recovered, 100% (full-recovery boundary)', () => {
    const r = computeRecoveryState(hoursAgo(48), NOW, 48);
    expect(r.recoveryPct).toBe(100);
    expect(r.state).toBe('recovered');
  });

  it('120h → recovered, 100% (clamped)', () => {
    const r = computeRecoveryState(hoursAgo(120), NOW, 48);
    expect(r.recoveryPct).toBe(100);
    expect(r.state).toBe('recovered');
  });

  it('hoursSinceLastTrained value is preserved (not clamped)', () => {
    // The recoveryPct clamps at 100, but hoursSinceLastTrained should
    // reflect actual elapsed time so the UI can render "120時間前".
    const r = computeRecoveryState(hoursAgo(120), NOW, 48);
    expect(r.hoursSinceLastTrained).toBeCloseTo(120, 5);
  });
});

describe('computeRecoveryState — Linear progression (72h recovery)', () => {
  it('24h / 72h → recovering, 33.33%', () => {
    const r = computeRecoveryState(hoursAgo(24), NOW, 72);
    expect(r.recoveryPct).toBeCloseTo(100 / 3, 4);
    expect(r.state).toBe('recovering');
  });

  it('36h / 72h → partial, 50%', () => {
    const r = computeRecoveryState(hoursAgo(36), NOW, 72);
    expect(r.recoveryPct).toBeCloseTo(50, 5);
    expect(r.state).toBe('partial');
  });

  it('72h / 72h → recovered, 100%', () => {
    const r = computeRecoveryState(hoursAgo(72), NOW, 72);
    expect(r.recoveryPct).toBe(100);
    expect(r.state).toBe('recovered');
  });
});

describe('computeRecoveryState — state-transition boundaries (49.99 / 50 / 99.99 / 100)', () => {
  // Pin the < 50 vs >= 50 boundary, and < 100 vs >= 100 boundary,
  // because both are "off-by-one" magnets and a future tweak to
  // Math.floor/Math.ceil/Math.round would silently shift them.
  it('just below 50% → recovering', () => {
    // 24h × (49.99 / 50) = 23.9952h since
    const hours = 24 * (49.99 / 50);
    const r = computeRecoveryState(hoursAgo(hours), NOW, 48);
    expect(r.recoveryPct).toBeLessThan(50);
    expect(r.state).toBe('recovering');
  });

  it('exactly 50% → partial (>= boundary)', () => {
    const r = computeRecoveryState(hoursAgo(24), NOW, 48);
    expect(r.recoveryPct).toBeCloseTo(50, 5);
    expect(r.state).toBe('partial');
  });

  it('just below 100% → partial', () => {
    // 47.99h / 48h = 99.979%
    const r = computeRecoveryState(hoursAgo(47.99), NOW, 48);
    expect(r.recoveryPct).toBeLessThan(100);
    expect(r.state).toBe('partial');
  });

  it('exactly 100% → recovered (>= boundary)', () => {
    const r = computeRecoveryState(hoursAgo(48), NOW, 48);
    expect(r.recoveryPct).toBe(100);
    expect(r.state).toBe('recovered');
  });
});

// ---------------------------------------------------------------------------
// 2. summarizeRecovery — 9-group aggregation
// ---------------------------------------------------------------------------

function emptyLastTrained(): Record<VolumeGroup, Date | null> {
  return {
    chest: null,
    back: null,
    shoulder_mid: null,
    biceps: null,
    triceps: null,
    quads: null,
    hamstrings: null,
    glutes: null,
    calves: null,
  };
}

describe('summarizeRecovery', () => {
  it('all-null lastTrained → all 9 muscles are unstimulated', () => {
    const out = summarizeRecovery(
      emptyLastTrained(),
      NOW,
      MUSCLE_RECOVERY_HOURS,
    );
    const groups: VolumeGroup[] = [
      'chest',
      'back',
      'shoulder_mid',
      'biceps',
      'triceps',
      'quads',
      'hamstrings',
      'glutes',
      'calves',
    ];
    for (const g of groups) {
      expect(out[g].state).toBe('unstimulated' as RecoveryStateLabel);
      expect(out[g].recoveryPct).toBe(100);
      expect(out[g].hoursSinceLastTrained).toBeNull();
    }
  });

  it('mixed states — chest just trained, glutes 24h ago, biceps untrained', () => {
    const lastTrained = emptyLastTrained();
    lastTrained.chest = hoursAgo(0); // 0%, recovering
    lastTrained.glutes = hoursAgo(24); // 33.3% (72h window), recovering
    // biceps stays null → unstimulated
    const out = summarizeRecovery(lastTrained, NOW, MUSCLE_RECOVERY_HOURS);
    expect(out.chest.state).toBe('recovering');
    expect(out.chest.recoveryPct).toBe(0);
    expect(out.glutes.state).toBe('recovering');
    expect(out.glutes.recoveryPct).toBeCloseTo(100 / 3, 4);
    expect(out.biceps.state).toBe('unstimulated');
  });

  it('large vs small muscle uses the correct recovery window from the table', () => {
    // 48h is the recovery window for chest (small) but 67% of the
    // way through quads' 72h window. Same lastTrained timestamp,
    // different state per the table.
    const lastTrained = emptyLastTrained();
    lastTrained.chest = hoursAgo(48);
    lastTrained.quads = hoursAgo(48);
    const out = summarizeRecovery(lastTrained, NOW, MUSCLE_RECOVERY_HOURS);
    expect(out.chest.state).toBe('recovered');
    expect(out.quads.state).toBe('partial');
    expect(out.quads.recoveryPct).toBeCloseTo(48 / 72 * 100, 4);
  });

  it('returns all 9 VolumeGroup keys regardless of input completeness', () => {
    // Empty/partial input — defensive against a (hypothetical)
    // upstream that drops keys. Real fetchLastTrainedByMuscle output
    // always has all 9 keys.
    const partial = {} as Record<VolumeGroup, Date | null>;
    const out = summarizeRecovery(partial, NOW, MUSCLE_RECOVERY_HOURS);
    expect(Object.keys(out).sort()).toEqual([
      'back',
      'biceps',
      'calves',
      'chest',
      'glutes',
      'hamstrings',
      'quads',
      'shoulder_mid',
      'triceps',
    ]);
    for (const g of Object.keys(out) as VolumeGroup[]) {
      // Missing recoveryHours (also degenerate input) falls back to 0
      // which the per-muscle function treats as instantly-recovered;
      // missing lastTrained falls to null → unstimulated. With both
      // partial inputs here, lastTrained=undefined → null path wins.
      expect(out[g].state).toBe('unstimulated');
    }
  });

  it('partial recoveryHoursTable falls back to 0 → recovered for present lastTrained', () => {
    const lastTrained = emptyLastTrained();
    lastTrained.chest = hoursAgo(1);
    const partialTable = {} as Record<VolumeGroup, number>;
    const out = summarizeRecovery(lastTrained, NOW, partialTable);
    // chest has lastTrained but recoveryHours falls to 0 → recovered.
    expect(out.chest.state).toBe('recovered');
    // others: lastTrained=null → unstimulated regardless of table.
    expect(out.biceps.state).toBe('unstimulated');
  });
});
