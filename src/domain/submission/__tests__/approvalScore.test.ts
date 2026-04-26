import {
  computeApprovalScore,
  APPROVAL_SCORE_WEIGHTS,
  AUTO_APPROVAL_SCORE_THRESHOLD,
  MANUAL_REVIEW_THRESHOLD,
  ApprovalScoreInput,
} from '../approvalScore';

// Baseline input that maxes every component (perfect score). Tests
// shave components off this to assert each axis individually.
function maxedInput(overrides: Partial<ApprovalScoreInput> = {}): ApprovalScoreInput {
  return {
    // 4*10 + 9*5 + 4*30 = 205. dev = 0 → tight bucket.
    proteinG: 10,
    fatG: 5,
    carbG: 30,
    caloriesPerServing: 205,
    hasImage: true,
    barcodeMatch: 'match',
    submitterHistory: { approvedCount: 100, rejectedCount: 0, pendingCount: 0 },
    hasGenericSimilarity: true,
    auth: { registered: true, emailVerified: true },
    ...overrides,
  };
}

describe('computeApprovalScore — thresholds and weights', () => {
  it('exports the documented thresholds', () => {
    expect(AUTO_APPROVAL_SCORE_THRESHOLD).toBe(70);
    expect(MANUAL_REVIEW_THRESHOLD).toBe(50);
    expect(MANUAL_REVIEW_THRESHOLD).toBeLessThan(AUTO_APPROVAL_SCORE_THRESHOLD);
  });

  it('weights sum to 100 so the un-skipped denominator equals 100', () => {
    const sum =
      APPROVAL_SCORE_WEIGHTS.pfcIntegrity +
      APPROVAL_SCORE_WEIGHTS.submitterHistory +
      APPROVAL_SCORE_WEIGHTS.image +
      APPROVAL_SCORE_WEIGHTS.barcodeMatch +
      APPROVAL_SCORE_WEIGHTS.genericSimilarity +
      APPROVAL_SCORE_WEIGHTS.auth;
    expect(sum).toBe(100);
  });
});

describe('computeApprovalScore — overall behaviour', () => {
  it('returns total close to 100 when every component is maxed', () => {
    const r = computeApprovalScore(maxedInput());
    // submitterHistory uses Laplace smoothing, so 100 approvals →
    // (100+1)/(100+0+2) ≈ 0.9902 → ~19.8/20. Round-trip → 99 or 100.
    expect(r.total).toBeGreaterThanOrEqual(99);
    expect(r.maxPossible).toBe(100);
  });

  it('returns total of 0 when every component is at its floor', () => {
    const r = computeApprovalScore({
      proteinG: 100, // 4*100 = 400 vs declared 0 → 100% deviation → 0 pts
      fatG: 0,
      carbG: 0,
      caloriesPerServing: 0,
      hasImage: false,
      barcodeMatch: 'no_match',
      submitterHistory: { approvedCount: 0, rejectedCount: 1000, pendingCount: 0 },
      hasGenericSimilarity: false,
      auth: { registered: false, emailVerified: false },
    });
    // submitterHistory gets ~0 with overwhelming rejections, but Laplace
    // smoothing keeps it slightly above zero. Verify the total is small.
    expect(r.total).toBeLessThan(5);
  });

  it('does not penalize when barcode is skipped — denominator drops', () => {
    const r = computeApprovalScore(maxedInput({ barcodeMatch: 'skipped' }));
    expect(r.barcodeMatch).toBeNull();
    // maxPossible drops by 15 to 85 — still 100 normalized.
    expect(r.maxPossible).toBe(85);
    expect(r.total).toBeGreaterThanOrEqual(99);
  });
});

describe('computeApprovalScore — PFC integrity grading', () => {
  it('grants full points when PFC × Atwater is within 5%', () => {
    const r = computeApprovalScore(maxedInput({ caloriesPerServing: 205 }));
    expect(r.pfcIntegrity.points).toBe(APPROVAL_SCORE_WEIGHTS.pfcIntegrity);
  });

  it('grants 80% when deviation is between 5% and 10%', () => {
    // atwater 205, declared 220 → dev = 15/220 ≈ 6.8%, in [5%, 10%) bucket.
    const r = computeApprovalScore(maxedInput({ caloriesPerServing: 220 }));
    expect(r.pfcIntegrity.points).toBeCloseTo(
      APPROVAL_SCORE_WEIGHTS.pfcIntegrity * 0.8,
      4,
    );
  });

  it('grants 40% when deviation is between 10% and 20%', () => {
    // atwater 205, declared 233 → dev = 28/233 ≈ 12%, in [10%, 20%) bucket.
    const r = computeApprovalScore(maxedInput({ caloriesPerServing: 233 }));
    expect(r.pfcIntegrity.points).toBeCloseTo(
      APPROVAL_SCORE_WEIGHTS.pfcIntegrity * 0.4,
      4,
    );
  });

  it('grants zero when deviation is ≥ 20%', () => {
    // atwater 205, declared 300 → dev ≈ 31.7%.
    const r = computeApprovalScore(maxedInput({ caloriesPerServing: 300 }));
    expect(r.pfcIntegrity.points).toBe(0);
  });

  it('grants zero when deviation cannot be computed (negative declared)', () => {
    const r = computeApprovalScore(maxedInput({ caloriesPerServing: -1 }));
    expect(r.pfcIntegrity.points).toBe(0);
  });
});

describe('computeApprovalScore — barcode match', () => {
  it('grants full points on match', () => {
    const r = computeApprovalScore(maxedInput({ barcodeMatch: 'match' }));
    expect(r.barcodeMatch).not.toBeNull();
    expect(r.barcodeMatch!.points).toBe(APPROVAL_SCORE_WEIGHTS.barcodeMatch);
  });

  it('grants zero on no_match (component still counted)', () => {
    const r = computeApprovalScore(maxedInput({ barcodeMatch: 'no_match' }));
    expect(r.barcodeMatch).not.toBeNull();
    expect(r.barcodeMatch!.points).toBe(0);
    expect(r.maxPossible).toBe(100); // still in denominator
  });

  it('drops the component entirely on skipped', () => {
    const r = computeApprovalScore(maxedInput({ barcodeMatch: 'skipped' }));
    expect(r.barcodeMatch).toBeNull();
    expect(r.maxPossible).toBe(100 - APPROVAL_SCORE_WEIGHTS.barcodeMatch);
  });
});

describe('computeApprovalScore — submitter history (Laplace-smoothed)', () => {
  it('treats a brand-new submitter as neutral (rate = 0.5)', () => {
    const r = computeApprovalScore(
      maxedInput({
        submitterHistory: { approvedCount: 0, rejectedCount: 0, pendingCount: 0 },
      }),
    );
    expect(r.submitterHistory.points).toBeCloseTo(
      APPROVAL_SCORE_WEIGHTS.submitterHistory * 0.5,
      4,
    );
  });

  it('rewards but does not max out a single approval', () => {
    const r = computeApprovalScore(
      maxedInput({
        submitterHistory: { approvedCount: 1, rejectedCount: 0, pendingCount: 0 },
      }),
    );
    // (1+1)/(1+0+2) = 2/3 ≈ 0.667
    expect(r.submitterHistory.points).toBeCloseTo(
      APPROVAL_SCORE_WEIGHTS.submitterHistory * (2 / 3),
      4,
    );
  });

  it('penalizes but does not zero a single rejection', () => {
    const r = computeApprovalScore(
      maxedInput({
        submitterHistory: { approvedCount: 0, rejectedCount: 1, pendingCount: 0 },
      }),
    );
    // (0+1)/(0+1+2) = 1/3 ≈ 0.333
    expect(r.submitterHistory.points).toBeCloseTo(
      APPROVAL_SCORE_WEIGHTS.submitterHistory * (1 / 3),
      4,
    );
  });

  it('treats negative counts as zero (defensive)', () => {
    const r = computeApprovalScore(
      maxedInput({
        submitterHistory: {
          approvedCount: -5,
          rejectedCount: -3,
          pendingCount: 0,
        },
      }),
    );
    expect(r.submitterHistory.points).toBeCloseTo(
      APPROVAL_SCORE_WEIGHTS.submitterHistory * 0.5,
      4,
    );
  });
});

describe('computeApprovalScore — image and similarity', () => {
  it('grants full image points when hasImage is true', () => {
    const r = computeApprovalScore(maxedInput({ hasImage: true }));
    expect(r.image.points).toBe(APPROVAL_SCORE_WEIGHTS.image);
  });

  it('grants zero image points when hasImage is false', () => {
    const r = computeApprovalScore(maxedInput({ hasImage: false }));
    expect(r.image.points).toBe(0);
  });

  it('grants similarity points only when hasGenericSimilarity is true', () => {
    expect(
      computeApprovalScore(maxedInput({ hasGenericSimilarity: true }))
        .genericSimilarity.points,
    ).toBe(APPROVAL_SCORE_WEIGHTS.genericSimilarity);
    expect(
      computeApprovalScore(maxedInput({ hasGenericSimilarity: false }))
        .genericSimilarity.points,
    ).toBe(0);
  });
});

describe('computeApprovalScore — auth', () => {
  it('grants full points when registered AND emailVerified', () => {
    const r = computeApprovalScore(
      maxedInput({ auth: { registered: true, emailVerified: true } }),
    );
    expect(r.auth.points).toBe(APPROVAL_SCORE_WEIGHTS.auth);
  });

  it('grants half points when registered but email unverified', () => {
    const r = computeApprovalScore(
      maxedInput({ auth: { registered: true, emailVerified: false } }),
    );
    expect(r.auth.points).toBeCloseTo(APPROVAL_SCORE_WEIGHTS.auth * 0.5, 4);
  });

  it('grants zero points when not registered', () => {
    const r = computeApprovalScore(
      maxedInput({ auth: { registered: false, emailVerified: false } }),
    );
    expect(r.auth.points).toBe(0);
  });

  it('grants zero when emailVerified is set without registered', () => {
    // Defensive: caller shouldn't produce this state, but guard anyway.
    const r = computeApprovalScore(
      maxedInput({ auth: { registered: false, emailVerified: true } }),
    );
    expect(r.auth.points).toBe(0);
  });
});

describe('computeApprovalScore — total normalization', () => {
  it('rounds total to an integer in [0, 100]', () => {
    const r = computeApprovalScore(maxedInput());
    expect(Number.isInteger(r.total)).toBe(true);
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.total).toBeLessThanOrEqual(100);
  });

  it('rawPoints equals the sum of component points', () => {
    const r = computeApprovalScore(maxedInput());
    const componentSum =
      r.pfcIntegrity.points +
      r.submitterHistory.points +
      r.image.points +
      (r.barcodeMatch?.points ?? 0) +
      r.genericSimilarity.points +
      r.auth.points;
    expect(r.rawPoints).toBeCloseTo(componentSum, 6);
  });

  it('total reflects the rawPoints / maxPossible ratio (×100, rounded)', () => {
    const r = computeApprovalScore(
      maxedInput({
        hasImage: false,
        hasGenericSimilarity: false,
        auth: { registered: false, emailVerified: false },
      }),
    );
    // Manual recompute against the contract.
    expect(r.total).toBe(Math.round((r.rawPoints / r.maxPossible) * 100));
  });
});
