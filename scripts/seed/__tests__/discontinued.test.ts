// S5b — carryDiscontinued unit tests.

import { carryDiscontinued } from '../discontinued';
import type { MenuItemRecord, RestaurantScrapeOutput } from '../types';

function item(name: string, extra: Partial<MenuItemRecord> = {}): MenuItemRecord {
  return {
    name,
    servingSizeG: 100,
    servingUnit: 'g',
    caloriesPerServing: 500,
    proteinG: 20,
    fatG: 15,
    carbG: 60,
    source: 'official_disclosure',
    sourceUrl: 'https://example.test/nutrition.pdf',
    sourceCapturedAt: '2026-05-18',
    ...extra,
  };
}

function output(menuItems: MenuItemRecord[]): RestaurantScrapeOutput {
  return {
    chainSlug: 'test_chain',
    chainName: 'テストチェーン',
    restaurantType: 'dining',
    category: '牛丼',
    aliases: [],
    attribution: 'test',
    attributionUrl: 'https://example.test/',
    sourceCapturedAt: '2026-08-30',
    menuItems,
  };
}

describe('carryDiscontinued', () => {
  it('appends items missing from the new parse with discontinued: true', () => {
    const prev = output([item('牛丼 並盛'), item('旧メニュー 並盛')]);
    const next = output([item('牛丼 並盛', { sourceCapturedAt: '2026-08-30' })]);
    const { output: merged, discontinuedNames } = carryDiscontinued(prev, next);
    expect(discontinuedNames).toEqual(['旧メニュー 並盛']);
    expect(merged.menuItems.map((m) => m.name)).toEqual(['牛丼 並盛', '旧メニュー 並盛']);
    const carried = merged.menuItems[1];
    expect(carried.discontinued).toBe(true);
    // sourceCapturedAt は「最後に確認できた日」のまま温存
    expect(carried.sourceCapturedAt).toBe('2026-05-18');
    // 現役 item はフラグ無し
    expect(merged.menuItems[0].discontinued).toBeUndefined();
  });

  it('keeps previously discontinued items discontinued across re-parses', () => {
    const prev = output([
      item('牛丼 並盛'),
      item('二世代前メニュー', { discontinued: true, sourceCapturedAt: '2026-02-01' }),
    ]);
    const next = output([item('牛丼 並盛')]);
    const { output: merged } = carryDiscontinued(prev, next);
    const old = merged.menuItems.find((m) => m.name === '二世代前メニュー');
    expect(old?.discontinued).toBe(true);
    expect(old?.sourceCapturedAt).toBe('2026-02-01');
  });

  it('revives an item that reappears in the official list (flag dropped)', () => {
    const prev = output([item('復活メニュー', { discontinued: true })]);
    const next = output([item('復活メニュー', { sourceCapturedAt: '2026-08-30' })]);
    const { output: merged, discontinuedNames } = carryDiscontinued(prev, next);
    expect(discontinuedNames).toEqual([]);
    expect(merged.menuItems).toHaveLength(1);
    expect(merged.menuItems[0].discontinued).toBeUndefined();
    expect(merged.menuItems[0].sourceCapturedAt).toBe('2026-08-30');
  });

  it('passes through unchanged when prev is null (new chain)', () => {
    const next = output([item('新規メニュー')]);
    const { output: merged, discontinuedNames } = carryDiscontinued(null, next);
    expect(merged).toBe(next);
    expect(discontinuedNames).toEqual([]);
  });
});
