import { searchIndexToMealLogItem } from '../searchIndexToMealLogItem';
import type {
  SearchIndexDetail,
  SearchIndexNutrition,
} from '../../infra/repositories/searchIndexRepository';

function buildDetail(
  overrides: Partial<SearchIndexDetail> = {},
  nutrition: Partial<SearchIndexNutrition> = {},
): SearchIndexDetail {
  return {
    rowid: 1,
    sourceType: 'food',
    sourceId: 'mext_01001',
    nameJa: 'アマランサス',
    nameEn: null,
    brand: null,
    sourceLabel: 'official_disclosure',
    useCount: 0,
    isCommon: false,
    rank: 0,
    nutrition: {
      caloriesPerServing: 343,
      proteinG: 11.3,
      fatG: 5,
      carbG: 63.5,
      fiberG: 7.4,
      saltG: 0,
      ...nutrition,
    },
    ...overrides,
  };
}

describe('searchIndexToMealLogItem (Sprint 2.4.1, Drafting 166)', () => {
  it('produces a snapshot row with foodId=null (point-in-time pattern)', () => {
    const out = searchIndexToMealLogItem(buildDetail());
    expect(out.foodId).toBeNull();
    expect(out.foodName).toBe('アマランサス');
  });

  it('copies macros and embedded micronutrients into the snapshot', () => {
    const out = searchIndexToMealLogItem(
      buildDetail({}, { caloriesPerServing: 343, proteinG: 11.3, fiberG: 7.4, calciumMg: 160 }),
    );
    expect(out.calories).toBe(343);
    expect(out.proteinG).toBe(11.3);
    expect(out.fiberG).toBe(7.4);
    expect(out.calciumMg).toBe(160);
  });

  it('omits micronutrients that the index left null/undefined', () => {
    const out = searchIndexToMealLogItem(
      buildDetail({}, { calciumMg: null, vitaminB12Ug: undefined }),
    );
    expect(out.calciumMg).toBeUndefined();
    expect(out.vitaminB12Ug).toBeUndefined();
  });

  it('prefixes restaurant items with the chain brand for the meal log timeline', () => {
    const out = searchIndexToMealLogItem(
      buildDetail({
        sourceType: 'restaurant_menu',
        sourceId: 'seven_eleven_0042',
        nameJa: '海老天むす',
        brand: 'セブン-イレブン',
      }),
    );
    expect(out.foodName).toBe('セブン-イレブン / 海老天むす');
  });

  it('uses the explicit servingAmount / note overrides when provided', () => {
    const out = searchIndexToMealLogItem(buildDetail(), {
      servingAmount: 2,
      note: '半分残した',
    });
    expect(out.servingAmount).toBe(2);
    expect(out.note).toBe('半分残した');
  });

  it("defaults serving unit to '個' for restaurant items when index omits it", () => {
    const out = searchIndexToMealLogItem(
      buildDetail({ sourceType: 'restaurant_menu', brand: 'スタバ' }, { servingUnit: undefined }),
    );
    expect(out.servingUnit).toBe('個');
  });

  it("defaults serving unit to 'g' for 八訂 food rows when index omits it", () => {
    const out = searchIndexToMealLogItem(buildDetail({}, { servingUnit: undefined }));
    expect(out.servingUnit).toBe('g');
  });

  it('honours the servingUnit the index already published', () => {
    const out = searchIndexToMealLogItem(buildDetail({}, { servingUnit: '杯' }));
    expect(out.servingUnit).toBe('杯');
  });
});
