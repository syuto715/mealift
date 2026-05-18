// v1.5 Stage 2 Phase 2.2a — spot-check-helper tests.

import {
  selectSample,
  chooseSampleSize,
  generateSpotCheckReport,
} from '../spot-check-helper';
import type { MenuItemRecord, RestaurantScrapeOutput } from '../types';

function buildItem(name: string): MenuItemRecord {
  return {
    name,
    servingSizeG: 100,
    servingUnit: 'g',
    caloriesPerServing: 500,
    proteinG: 20,
    fatG: 25,
    carbG: 50,
    source: 'official_disclosure',
    sourceUrl: 'https://example.test/',
    sourceCapturedAt: '2026-05-19',
  };
}

function buildOutput(itemCount: number): RestaurantScrapeOutput {
  return {
    chainSlug: 'mcdonalds',
    chainName: 'マクドナルド',
    restaurantType: 'dining',
    category: 'FF',
    aliases: ['マクド'],
    attribution: '公式サイトより',
    attributionUrl: 'https://example.test/',
    sourceCapturedAt: '2026-05-19',
    menuItems: Array.from({ length: itemCount }, (_, i) =>
      buildItem(`メニュー${i + 1}`),
    ),
  };
}

describe('chooseSampleSize', () => {
  it('clamps to 0 when total is 0', () => {
    expect(chooseSampleSize(0)).toBe(0);
  });

  it('returns at least minSamples (5 default) for small menus', () => {
    expect(chooseSampleSize(10)).toBe(5);
    // 7 items → floor (7*0.15) = 1, but minSamples=5; total=7 caps min
    expect(chooseSampleSize(7)).toBe(5);
  });

  it('caps at maxSamples (20 default) for very large menus', () => {
    expect(chooseSampleSize(200)).toBe(20);
  });

  it('uses the fraction (15% default) for mid-size menus', () => {
    // 47 items × 0.15 = 7.05 → 7
    expect(chooseSampleSize(47)).toBe(7);
  });

  it('honors override options', () => {
    expect(chooseSampleSize(100, { sampleFraction: 0.1 })).toBe(10);
    expect(chooseSampleSize(100, { maxSamples: 50 })).toBe(15);
    expect(chooseSampleSize(3, { minSamples: 5 })).toBe(3); // clampedMin
  });
});

describe('selectSample — deterministic', () => {
  it('produces the same sample for the same (items, count, seed)', () => {
    const items = Array.from({ length: 20 }, (_, i) => `item${i}`);
    const a = selectSample(items, 5, 'mcdonalds');
    const b = selectSample(items, 5, 'mcdonalds');
    expect(a).toEqual(b);
  });

  it('produces a different sample for different seeds', () => {
    const items = Array.from({ length: 20 }, (_, i) => `item${i}`);
    const a = selectSample(items, 5, 'mcdonalds');
    const b = selectSample(items, 5, 'moss_burger');
    expect(a).not.toEqual(b);
  });

  it('returns the entire list when count >= length', () => {
    const items = ['a', 'b', 'c'];
    expect(selectSample(items, 100, 'x').sort()).toEqual(['a', 'b', 'c']);
  });

  it('returns [] when count <= 0 or items is empty', () => {
    expect(selectSample(['a', 'b'], 0, 'x')).toEqual([]);
    expect(selectSample([], 5, 'x')).toEqual([]);
  });
});

describe('generateSpotCheckReport', () => {
  it('renders a markdown table with the chosen sample', () => {
    const output = buildOutput(47);
    const report = generateSpotCheckReport(output);
    expect(report.sample.length).toBeGreaterThan(0);
    expect(report.sample.length).toBeLessThanOrEqual(20);
    expect(report.markdown).toMatch(/^# マクドナルド 抜粋 sample/);
    expect(report.markdown).toMatch(/\| # \| menu_name \| extracted PFC \| kcal \| source URL \| OK\/NG \|/);
    expect(report.markdown).toMatch(/\| 1 \| メニュー/);
    // Includes the checkbox column for Syuto's OK/NG marks.
    expect(report.markdown).toMatch(/\| \[ \] \|/);
  });

  it('embeds the deterministic seed in the markdown header (re-run reproducibility)', () => {
    const output = buildOutput(47);
    const report = generateSpotCheckReport(output);
    expect(report.markdown).toMatch(/Seed: `mcdonalds`/);
  });

  it('includes the 5% mismatch threshold callout (epic §4.1 step 2)', () => {
    const output = buildOutput(47);
    const report = generateSpotCheckReport(output);
    expect(report.markdown).toMatch(/5%/);
  });

  it('re-running on the same chain yields identical sample (Syuto carry-over)', () => {
    const output = buildOutput(47);
    const a = generateSpotCheckReport(output);
    const b = generateSpotCheckReport(output);
    expect(a.sample.map((s) => s.name)).toEqual(b.sample.map((s) => s.name));
  });

  it('sample is stable under input row reordering (Codex round 1 Important fix — canonical sort)', () => {
    // Two outputs with the SAME menu set but in different orders
    // must yield the same sample, because the helper sorts by
    // name before the deterministic shuffle. Earlier draft would
    // produce different samples here.
    const a = buildOutput(47);
    const b: typeof a = {
      ...a,
      menuItems: [...a.menuItems].reverse(),
    };
    const reportA = generateSpotCheckReport(a);
    const reportB = generateSpotCheckReport(b);
    expect(reportA.sample.map((s) => s.name).sort()).toEqual(
      reportB.sample.map((s) => s.name).sort(),
    );
  });

  it('renders Dropped items section when output.partial = true', () => {
    const output = buildOutput(10);
    output.partial = true;
    output.droppedItems = ['不明商品A [PFC inconsistent]', '謎商品B'];
    const report = generateSpotCheckReport(output);
    expect(report.markdown).toMatch(/## Dropped items \(2\)/);
    expect(report.markdown).toMatch(/不明商品A/);
    expect(report.markdown).toMatch(/謎商品B/);
    expect(report.markdown).toMatch(/\*\*Partial scrape\*\*/);
  });
});
