// Build 15 / Feature 5-C — parse a routine_item.target_reps string
// into the numeric target the recommendation engine consumes.
//
// Accepted shapes (all matched after .trim()):
//   - integer literal: '5' → 5
//   - integer range:   '8-12' → 10 (median, floor)
//
// Anything else returns null:
//   - empty / null / undefined
//   - non-integer ('5.5', '8a', 'a8', 'foo')
//   - non-positive ('0', '0-3')
//   - inverted range ('12-8')
//   - special tokens ('AMRAP', 'failure', 'TBD')
//
// Median uses Math.floor((low + high) / 2). Examples:
//   '1-3' → 2   '7-9' → 8   '8-12' → 10   '5-10' → 7
export function parseTargetReps(input: string | null | undefined): number | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;

  const rangeMatch = /^(\d+)-(\d+)$/.exec(trimmed);
  if (rangeMatch) {
    const low = Number(rangeMatch[1]);
    const high = Number(rangeMatch[2]);
    if (low <= 0 || high <= 0 || high < low) return null;
    return Math.floor((low + high) / 2);
  }

  const num = Number(trimmed);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num <= 0) return null;
  return num;
}
