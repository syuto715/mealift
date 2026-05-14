// v1.4 ステージ 4 Phase 4A — unit categorization tests.

import {
  UNIT_CATEGORIES,
  UNIT_SEGMENTS_FULL,
  getUnitCategory,
  filterUnitsByCategory,
} from '../units';

describe('UNIT_CATEGORIES — 12 unit mapping', () => {
  describe('weight units', () => {
    it.each(['g', 'kg', 'oz', 'lb'])('%s → weight', (unit) => {
      expect(UNIT_CATEGORIES[unit]).toBe('weight');
    });
  });

  describe('volume units', () => {
    it.each(['ml', 'cc', 'l'])('%s → volume', (unit) => {
      expect(UNIT_CATEGORIES[unit]).toBe('volume');
    });
  });

  describe('count units', () => {
    it.each(['個', '本', '枚', 'パック', '杯'])('%s → count', (unit) => {
      expect(UNIT_CATEGORIES[unit]).toBe('count');
    });
  });
});

describe('getUnitCategory — fallback behavior', () => {
  it('returns mapped category for known unit', () => {
    expect(getUnitCategory('g')).toBe('weight');
    expect(getUnitCategory('ml')).toBe('volume');
    expect(getUnitCategory('個')).toBe('count');
  });

  it("returns 'weight' fallback for unknown unit", () => {
    expect(getUnitCategory('purple-unicorn')).toBe('weight');
    expect(getUnitCategory('')).toBe('weight');
    expect(getUnitCategory('TBSP')).toBe('weight');
  });
});

describe('UNIT_SEGMENTS_FULL — 7-option canonical picker', () => {
  it('has 7 unique segments', () => {
    expect(UNIT_SEGMENTS_FULL).toHaveLength(7);
    const values = UNIT_SEGMENTS_FULL.map((s) => s.value);
    const unique = new Set(values);
    expect(unique.size).toBe(7);
  });

  it('superset of legacy 4-option (g / ml / 個 / 杯)', () => {
    const values = UNIT_SEGMENTS_FULL.map((s) => s.value);
    expect(values).toContain('g');
    expect(values).toContain('ml');
    expect(values).toContain('個');
    expect(values).toContain('杯');
  });

  it('adds 本 / 枚 / パック (Phase 4F extension)', () => {
    const values = UNIT_SEGMENTS_FULL.map((s) => s.value);
    expect(values).toContain('本');
    expect(values).toContain('枚');
    expect(values).toContain('パック');
  });

  it('every option has label === value (JP-only ship)', () => {
    UNIT_SEGMENTS_FULL.forEach((seg) => {
      expect(seg.label).toBe(seg.value);
    });
  });
});

describe('filterUnitsByCategory — picker filter by food category', () => {
  it('weight category returns weight units only', () => {
    const out = filterUnitsByCategory('weight');
    // Note: UNIT_SEGMENTS_FULL only includes g (not kg/oz/lb in picker),
    // ml not 'l', etc. — picker is JP-conventional subset.
    const values = out.map((s) => s.value);
    expect(values).toEqual(['g']);
  });

  it('volume category returns volume units only', () => {
    const out = filterUnitsByCategory('volume');
    const values = out.map((s) => s.value);
    expect(values).toEqual(['ml']);
  });

  it('count category returns 5 JP count units', () => {
    const out = filterUnitsByCategory('count');
    const values = out.map((s) => s.value);
    expect(values).toEqual(['個', '本', '枚', 'パック', '杯']);
  });
});
