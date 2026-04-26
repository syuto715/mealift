import {
  pfcAtwaterDeviation,
  PFC_ATWATER_TOLERANCES,
} from './submissionValidator';

// approvalScore — pure scoring for a UserSubmittedFoodInput. The
// caller assembles every input (the submission, prior submitter
// history, an OFF lookup result, etc.) and passes them in. This
// module never touches the DB or the network. That separation keeps
// the score reproducible from a snapshot — useful for moderator
// review tooling and for replaying historical scores when thresholds
// move.
//
// The score is normalized to 0–100. Each component contributes a
// fraction of its weight (see APPROVAL_SCORE_WEIGHTS). The barcode
// component is *skippable*: if `barcodeMatch === 'skipped'` (e.g. OFF
// lookup failed because the device is offline) it is dropped from
// both the numerator AND the denominator — submissions are not
// penalized for our network conditions. Every other component is
// always counted, even when it scores zero.
//
// Thresholds (AUTO_APPROVAL / MANUAL_REVIEW) are exported as
// constants — this module does NOT decide what to do with the score.
// Caller layers (sync, moderator UI) compare `total` against the
// thresholds and route accordingly.

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

// Result of an Open Food Facts barcode probe. 'skipped' means the
// caller could not perform the check at all (no barcode, OFF
// unreachable, etc.) — score that as null and don't ding the user.
export type BarcodeMatchResult = 'match' | 'no_match' | 'skipped';

export interface SubmitterHistorySnapshot {
  approvedCount: number;
  rejectedCount: number;
  // pendingCount is captured so future scoring tweaks can demote
  // users with a long backlog of pending submissions, but the
  // current scorer doesn't read it. Keeping it in the input shape
  // means the call sites don't need to change when we wire it in.
  pendingCount: number;
}

export interface AuthSnapshot {
  registered: boolean;
  emailVerified: boolean;
}

export interface ApprovalScoreInput {
  // The four macros + declared calories drive the PFC × Atwater check.
  proteinG: number;
  fatG: number;
  carbG: number;
  caloriesPerServing: number;
  // Was a source photo attached?
  hasImage: boolean;
  // Result of the Open Food Facts barcode probe (or 'skipped').
  barcodeMatch: BarcodeMatchResult;
  // Submitter's historical approve/reject counts on prior submissions.
  submitterHistory: SubmitterHistorySnapshot;
  // True when a similar item exists in the canonical foods table
  // (8th edition or prior approved submission). A loose match
  // (e.g. trigram similarity) is enough — this is a "values are
  // probably realistic" signal, not a duplicate detector.
  hasGenericSimilarity: boolean;
  // Submitter's auth status at submission time.
  auth: AuthSnapshot;
}

export interface ScoreComponent {
  // Earned points (≤ weight).
  points: number;
  // Maximum the component could have scored.
  weight: number;
}

export interface ApprovalScoreBreakdown {
  pfcIntegrity: ScoreComponent;
  submitterHistory: ScoreComponent;
  image: ScoreComponent;
  // null when the component was skipped (e.g. OFF unreachable).
  // Skipped components are excluded from both rawPoints and
  // maxPossible, so the normalized total is unaffected.
  barcodeMatch: ScoreComponent | null;
  genericSimilarity: ScoreComponent;
  auth: ScoreComponent;
  // Sum of `points` over non-skipped components.
  rawPoints: number;
  // Sum of `weight` over non-skipped components.
  maxPossible: number;
  // rawPoints / maxPossible × 100, rounded to integer in [0, 100].
  total: number;
}

// ---------------------------------------------------------------------------
// Weights and thresholds — exported so moderator tooling and the
// auto-approval router (commit 3) can reuse them.
// ---------------------------------------------------------------------------

export const APPROVAL_SCORE_WEIGHTS = {
  pfcIntegrity: 30,
  submitterHistory: 20,
  image: 15,
  barcodeMatch: 15,
  genericSimilarity: 10,
  auth: 10,
} as const;

// Routing thresholds against the normalized 0–100 total:
//   total >= AUTO_APPROVAL_SCORE_THRESHOLD → eligible for auto-approval
//   total >= MANUAL_REVIEW_THRESHOLD       → goes to the human queue
//   total <  MANUAL_REVIEW_THRESHOLD       → eligible for fast rejection
// The numbers here are the routing dials; tune in production.
export const AUTO_APPROVAL_SCORE_THRESHOLD = 70;
export const MANUAL_REVIEW_THRESHOLD = 50;

// PFC integrity grading. Tight = full points; loose = partial; over
// the validator's error bound = zero. Tight is a stricter line than
// the validator warns at, because scoring rewards quality whereas
// the validator only flags clear-wrong entries.
const PFC_TIGHT_DEVIATION = 0.05;

// ---------------------------------------------------------------------------
// Component scoring — small named helpers for readability + testability.
// All return points (0..weight), never null. Skip semantics live in
// the assembler below.
// ---------------------------------------------------------------------------

function scorePfcIntegrity(
  proteinG: number,
  fatG: number,
  carbG: number,
  declaredCalories: number,
): number {
  const dev = pfcAtwaterDeviation(proteinG, fatG, carbG, declaredCalories);
  if (dev === null) return 0;
  const w = APPROVAL_SCORE_WEIGHTS.pfcIntegrity;
  if (dev < PFC_TIGHT_DEVIATION) return w;
  if (dev < PFC_ATWATER_TOLERANCES.warnFraction) return w * 0.8;
  if (dev < PFC_ATWATER_TOLERANCES.errorFraction) return w * 0.4;
  return 0;
}

// Submitter approval rate with Laplace smoothing — adds a virtual
// approval and a virtual rejection so a brand-new user isn't ranked
// 0% (no rejections AND no approvals) and a user with a single
// approval isn't ranked 100%. (0/0) → 0.5; (1/0) → 0.667; (0/1) → 0.333.
function scoreSubmitterHistory(history: SubmitterHistorySnapshot): number {
  const a = Math.max(0, history.approvedCount);
  const r = Math.max(0, history.rejectedCount);
  const smoothedRate = (a + 1) / (a + r + 2);
  return APPROVAL_SCORE_WEIGHTS.submitterHistory * smoothedRate;
}

function scoreAuth(auth: AuthSnapshot): number {
  // Half-credit for registered, full credit when email is verified
  // on top. emailVerified without registered shouldn't happen, but
  // we don't reward it — auth credit requires `registered`.
  const w = APPROVAL_SCORE_WEIGHTS.auth;
  if (!auth.registered) return 0;
  if (auth.emailVerified) return w;
  return w * 0.5;
}

// ---------------------------------------------------------------------------
// computeApprovalScore — the entry point. Pure.
// ---------------------------------------------------------------------------

export function computeApprovalScore(
  input: ApprovalScoreInput,
): ApprovalScoreBreakdown {
  const pfcPoints = scorePfcIntegrity(
    input.proteinG,
    input.fatG,
    input.carbG,
    input.caloriesPerServing,
  );
  const historyPoints = scoreSubmitterHistory(input.submitterHistory);
  const imagePoints = input.hasImage ? APPROVAL_SCORE_WEIGHTS.image : 0;
  const similarityPoints = input.hasGenericSimilarity
    ? APPROVAL_SCORE_WEIGHTS.genericSimilarity
    : 0;
  const authPoints = scoreAuth(input.auth);

  // Barcode is the only component with skip semantics.
  let barcodeComponent: ScoreComponent | null;
  if (input.barcodeMatch === 'skipped') {
    barcodeComponent = null;
  } else {
    barcodeComponent = {
      points:
        input.barcodeMatch === 'match'
          ? APPROVAL_SCORE_WEIGHTS.barcodeMatch
          : 0,
      weight: APPROVAL_SCORE_WEIGHTS.barcodeMatch,
    };
  }

  const components: ApprovalScoreBreakdown = {
    pfcIntegrity: {
      points: pfcPoints,
      weight: APPROVAL_SCORE_WEIGHTS.pfcIntegrity,
    },
    submitterHistory: {
      points: historyPoints,
      weight: APPROVAL_SCORE_WEIGHTS.submitterHistory,
    },
    image: {
      points: imagePoints,
      weight: APPROVAL_SCORE_WEIGHTS.image,
    },
    barcodeMatch: barcodeComponent,
    genericSimilarity: {
      points: similarityPoints,
      weight: APPROVAL_SCORE_WEIGHTS.genericSimilarity,
    },
    auth: {
      points: authPoints,
      weight: APPROVAL_SCORE_WEIGHTS.auth,
    },
    rawPoints: 0,
    maxPossible: 0,
    total: 0,
  };

  const earned: ScoreComponent[] = [
    components.pfcIntegrity,
    components.submitterHistory,
    components.image,
    components.genericSimilarity,
    components.auth,
  ];
  if (barcodeComponent) earned.push(barcodeComponent);

  const rawPoints = earned.reduce((sum, c) => sum + c.points, 0);
  const maxPossible = earned.reduce((sum, c) => sum + c.weight, 0);
  const total =
    maxPossible > 0 ? Math.round((rawPoints / maxPossible) * 100) : 0;

  components.rawPoints = rawPoints;
  components.maxPossible = maxPossible;
  components.total = total;
  return components;
}
