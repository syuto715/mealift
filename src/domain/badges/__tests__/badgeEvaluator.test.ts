import {
  evaluateBadges,
  computeMaxConsecutiveDays,
  countByCategory,
} from '../badgeEvaluator';
import type {
  UserSubmittedFood,
  FoodCategory,
  SubmissionStatus,
} from '../../../types/userSubmittedFood';

function makeSubmission(
  overrides: Partial<UserSubmittedFood> = {},
): UserSubmittedFood {
  return {
    id: `sub-${Math.random()}`,
    nameJa: 'テスト',
    nameEn: null,
    brand: null,
    barcode: null,
    servingSizeG: 100,
    servingUnit: 'g',
    servingDescription: null,
    caloriesPerServing: 100,
    proteinG: 5,
    fatG: 5,
    carbG: 5,
    fiberG: null,
    sugarG: null,
    saltG: null,
    sodiumMg: null,
    saturatedFatG: null,
    cholesterolMg: null,
    calciumMg: null,
    ironMg: null,
    vitaminAUg: null,
    vitaminB1Mg: null,
    vitaminB2Mg: null,
    vitaminCMg: null,
    vitaminDUg: null,
    vitaminEMg: null,
    potassiumMg: null,
    magnesiumMg: null,
    zincMg: null,
    sourceType: 'package_label',
    sourcePhotoUri: null,
    notes: null,
    foodCategory: 'other',
    submissionStatus: 'pending_review' as SubmissionStatus,
    rejectionReason: null,
    remoteId: null,
    syncedAt: null,
    createdAt: '2026-04-01T10:00:00Z',
    updatedAt: '2026-04-01T10:00:00Z',
    ...overrides,
  };
}

describe('countByCategory', () => {
  it('counts submissions matching the given category', () => {
    const subs: UserSubmittedFood[] = [
      makeSubmission({ foodCategory: 'convenience_store' }),
      makeSubmission({ foodCategory: 'convenience_store' }),
      makeSubmission({ foodCategory: 'home_cooking' }),
    ];
    expect(countByCategory(subs, 'convenience_store')).toBe(2);
    expect(countByCategory(subs, 'home_cooking')).toBe(1);
    expect(countByCategory(subs, 'restaurant' as FoodCategory)).toBe(0);
  });
});

describe('computeMaxConsecutiveDays', () => {
  it('returns 0 for empty list', () => {
    expect(computeMaxConsecutiveDays([])).toBe(0);
  });

  it('returns 1 for a single submission', () => {
    const subs = [makeSubmission({ createdAt: '2026-04-01T10:00:00Z' })];
    expect(computeMaxConsecutiveDays(subs)).toBe(1);
  });

  it('counts a 3-day streak', () => {
    const subs = [
      makeSubmission({ createdAt: '2026-04-01T10:00:00Z' }),
      makeSubmission({ createdAt: '2026-04-02T11:00:00Z' }),
      makeSubmission({ createdAt: '2026-04-03T12:00:00Z' }),
    ];
    expect(computeMaxConsecutiveDays(subs)).toBe(3);
  });

  it('multiple submissions on the same day count once', () => {
    const subs = [
      makeSubmission({ createdAt: '2026-04-01T10:00:00Z' }),
      makeSubmission({ createdAt: '2026-04-01T15:00:00Z' }),
      makeSubmission({ createdAt: '2026-04-02T10:00:00Z' }),
    ];
    expect(computeMaxConsecutiveDays(subs)).toBe(2);
  });

  it('returns the longest streak in a list with gaps', () => {
    const subs = [
      makeSubmission({ createdAt: '2026-04-01T10:00:00Z' }),
      makeSubmission({ createdAt: '2026-04-02T10:00:00Z' }),
      // Gap
      makeSubmission({ createdAt: '2026-04-10T10:00:00Z' }),
      makeSubmission({ createdAt: '2026-04-11T10:00:00Z' }),
      makeSubmission({ createdAt: '2026-04-12T10:00:00Z' }),
      makeSubmission({ createdAt: '2026-04-13T10:00:00Z' }),
    ];
    expect(computeMaxConsecutiveDays(subs)).toBe(4);
  });

  it('skips invalid dates', () => {
    const subs = [
      makeSubmission({ createdAt: 'not-a-date' }),
      makeSubmission({ createdAt: '2026-04-01T10:00:00Z' }),
    ];
    expect(computeMaxConsecutiveDays(subs)).toBe(1);
  });
});

describe('evaluateBadges', () => {
  it('returns no badges when there are no submissions', () => {
    const earned = evaluateBadges({ submissions: [], totalUseCount: 0 });
    expect(earned).toHaveLength(0);
  });

  it('grants first_submission on a single shared submission', () => {
    const earned = evaluateBadges({
      submissions: [makeSubmission()],
      totalUseCount: 0,
    });
    expect(earned.find((e) => e.definition.id === 'first_submission')).toBeTruthy();
  });

  it('local-only submissions do not count toward volume badges', () => {
    const earned = evaluateBadges({
      submissions: [makeSubmission({ submissionStatus: 'local' })],
      totalUseCount: 0,
    });
    expect(earned).toHaveLength(0);
  });

  it('rejected submissions still count (good-faith contributors)', () => {
    const earned = evaluateBadges({
      submissions: [makeSubmission({ submissionStatus: 'rejected' })],
      totalUseCount: 0,
    });
    expect(earned.find((e) => e.definition.id === 'first_submission')).toBeTruthy();
  });

  it('grants the 10-submission badge AND first_submission at 10 submissions', () => {
    const subs = Array.from({ length: 10 }, (_, i) =>
      makeSubmission({ id: `s-${i}` }),
    );
    const earned = evaluateBadges({ submissions: subs, totalUseCount: 0 });
    expect(earned.find((e) => e.definition.id === 'first_submission')).toBeTruthy();
    expect(earned.find((e) => e.definition.id === 'submissions_10')).toBeTruthy();
    expect(earned.find((e) => e.definition.id === 'submissions_50')).toBeFalsy();
  });

  it('grants category mastery when threshold met', () => {
    const subs = Array.from({ length: 20 }, (_, i) =>
      makeSubmission({ id: `s-${i}`, foodCategory: 'convenience_store' }),
    );
    const earned = evaluateBadges({ submissions: subs, totalUseCount: 0 });
    expect(
      earned.find((e) => e.definition.id === 'category_conveni_20'),
    ).toBeTruthy();
  });

  it('grants streak_7 with a 7-day run', () => {
    const subs = Array.from({ length: 7 }, (_, i) =>
      makeSubmission({
        id: `s-${i}`,
        createdAt: `2026-04-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      }),
    );
    const earned = evaluateBadges({ submissions: subs, totalUseCount: 0 });
    expect(earned.find((e) => e.definition.id === 'streak_7')).toBeTruthy();
    expect(earned.find((e) => e.definition.id === 'streak_30')).toBeFalsy();
  });

  it('grants used_by_10 when totalUseCount >= 10', () => {
    const earned = evaluateBadges({
      submissions: [makeSubmission()],
      totalUseCount: 10,
    });
    expect(earned.find((e) => e.definition.id === 'used_by_10')).toBeTruthy();
  });

  it('does NOT grant social-proof badges when totalUseCount is null', () => {
    const earned = evaluateBadges({
      submissions: [makeSubmission()],
      totalUseCount: null,
    });
    expect(earned.find((e) => e.definition.id === 'used_by_10')).toBeFalsy();
  });

  it('relatedCount carries the number that drove the award', () => {
    const subs = Array.from({ length: 50 }, (_, i) =>
      makeSubmission({ id: `s-${i}` }),
    );
    const earned = evaluateBadges({ submissions: subs, totalUseCount: 100 });
    const fifty = earned.find((e) => e.definition.id === 'submissions_50');
    expect(fifty?.relatedCount).toBe(50);
    const usedBy = earned.find((e) => e.definition.id === 'used_by_100');
    expect(usedBy?.relatedCount).toBe(100);
  });
});
