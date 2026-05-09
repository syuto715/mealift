import type { VolumeGroup } from '../domain/volumeLandmark';

// Build 16 / Phase 6 (Muscle Recovery Heatmap) / Phase 6.0 — per-muscle
// recovery time table.
//
// Per-muscle hours from the last working set until the muscle is
// considered fully recovered (recoveryPct = 100% under the Phase 6
// recon §B2 (α) Linear formula). Phase 6.1 will compute:
//
//   recoveryPct = min(100, (hours_since_last / MUSCLE_RECOVERY_HOURS[g]) * 100)
//
// Values follow Helms / Renaissance Periodization / Schoenfeld 2017
// general guidance for trained populations: large multi-joint groups
// (quads / hamstrings / glutes) take longer to recover from working
// volume than smaller assist groups. Phase 6 recon §B1 sign-off pinned
// these values; deeper per-user customization is a Build 16+ candidate.
//
// Sources (informal — no single canonical table in the literature for
// muscle-by-muscle recovery hours; the values below match standard
// hypertrophy programming guidance):
//   - Schoenfeld 2017 J Sports Sci — protein synthesis returns to
//     baseline within 48-72h for trained populations.
//   - Helms / RTS general training guidance — large legs need ≥72h
//     between hard sessions; smaller assist muscles can be hit every
//     48h without compounding fatigue.
//   - Pelland 2024 sportRxiv — primary 1.0 / secondary 0.5 set
//     weighting, used by Phase 2 volumeLandmark (NOT directly used
//     here, but informs the "small muscle = 48h" choice).
//
// Type-level guarantee: Record<VolumeGroup, number> ensures every
// Phase 2.1 muscle group has a value, and adding a new VolumeGroup
// (Build 16+ TODO 18 fine-granularity expansion) forces a deliberate
// recovery value at compile time rather than silently defaulting.

export const MUSCLE_RECOVERY_HOURS: Record<VolumeGroup, number> = {
  // Smaller / mid-size groups: 48h. High-frequency-trainable.
  chest: 48,
  back: 48,
  shoulder_mid: 48,
  biceps: 48,
  triceps: 48,
  calves: 48,
  // Large multi-joint groups: 72h. The eccentric stress + total
  // volume justifies the longer recovery window.
  quads: 72,
  hamstrings: 72,
  glutes: 72,
};
