// Audit E-08 / E-13 — pin the WCAG contrast of the neutral + semantic
// text tokens so a future palette edit can't silently reintroduce the
// sub-3:1 text that this sprint fixed (textTertiary was 2.07:1 on white).

import { getColors } from '../tokens';

function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const ch = (i: number) => parseInt(c.substr(i, 2), 16) / 255;
  const lin = (x: number) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(ch(0)) + 0.7152 * lin(ch(2)) + 0.0722 * lin(ch(4));
}

function contrast(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

const AA_LARGE = 3; // ≥18pt or ≥14pt bold
const AA_NORMAL = 4.5;

describe('token contrast (WCAG AA) — audit E-08', () => {
  const light = getColors('light');
  const dark = getColors('dark');

  it('light textTertiary passes AA-large on both surfaces', () => {
    expect(contrast(light.textTertiary, light.surface)).toBeGreaterThanOrEqual(AA_LARGE);
    expect(contrast(light.textTertiary, light.background)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('dark textTertiary passes AA-normal on both surfaces', () => {
    expect(contrast(dark.textTertiary, dark.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(dark.textTertiary, dark.background)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('textSecondary passes AA-normal (unchanged baseline)', () => {
    expect(contrast(light.textSecondary, light.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(dark.textSecondary, dark.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('successText / warningText pass AA-normal as small text on their surfaces', () => {
    // Light: darker shades; dark: bright fills already pass.
    expect(contrast(light.successText, light.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(light.warningText, light.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(dark.successText, dark.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(dark.warningText, dark.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('textTertiary stays a step lighter than textSecondary (hierarchy preserved)', () => {
    // Lower contrast against the surface = lighter/more muted.
    expect(contrast(light.textTertiary, light.surface)).toBeLessThan(
      contrast(light.textSecondary, light.surface),
    );
    expect(contrast(dark.textTertiary, dark.surface)).toBeLessThan(
      contrast(dark.textSecondary, dark.surface),
    );
  });

  it('onPrimary is defined for on-fill foreground (E-13)', () => {
    expect(light.onPrimary).toBe('#FFFFFF');
    expect(dark.onPrimary).toBe('#FFFFFF');
  });

  it('proText passes AA-normal on both schemes (S2-E — dark was 2.4:1)', () => {
    // Plus 誘導 CTA のテキスト。locked card (surfaceSecondary) 上に載る。
    expect(contrast(light.proText, light.surfaceSecondary)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(dark.proText, dark.surfaceSecondary)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('macro bar fills pass 3:1 non-text contrast vs the ProgressBar track (S2-A)', () => {
    // PFC bars render on the surfaceSecondary track (ProgressBar default).
    // fat was 1.36:1 on light — invisible; pin all three per scheme.
    for (const scheme of [light, dark]) {
      for (const macro of [scheme.protein, scheme.fat, scheme.carb]) {
        expect(contrast(macro, scheme.surfaceSecondary)).toBeGreaterThanOrEqual(AA_LARGE);
      }
    }
  });
});
