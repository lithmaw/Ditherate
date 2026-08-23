import type { Palette, Rgb } from './types.ts';

export const LUMA_R = 0.2126;
export const LUMA_G = 0.7152;
export const LUMA_B = 0.0722;

export const luminance = (r: number, g: number, b: number): number =>
  LUMA_R * r + LUMA_G * g + LUMA_B * b;

/**
 * Nearest palette entry by squared RGB distance. Squared distance is enough —
 * we only ever compare, never need the actual magnitude.
 */
export function nearestColor(palette: Palette, r: number, g: number, b: number): Rgb {
  const { colors } = palette;
  let best = colors[0];
  let bestDist = Infinity;
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    const dr = r - c[0];
    const dg = g - c[1];
    const db = b - c[2];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

/** Palette entries sorted dark -> light, for the algorithms that work on a luminance ramp. */
export function luminanceRamp(palette: Palette): Rgb[] {
  return [...palette.colors].sort(
    (a, b) => luminance(a[0], a[1], a[2]) - luminance(b[0], b[1], b[2]),
  );
}
