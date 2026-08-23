import { BW, COLOR_PALETTES, sampleFromImage } from './palettes.ts';
import { MAP_IDS, type MapId } from './thresholdMaps.ts';
import type { Settings } from './types.ts';

/** Small, fast, deterministic PRNG. Same seed => same roll, forever. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0;

/** Maps whose own cell structure is already large. */
const CLUSTERED = new Set<MapId>(['dot', 'spiral', 'diagonal']);

const pick = <T,>(rng: () => number, items: T[]): T => items[Math.floor(rng() * items.length)];
const range = (rng: () => number, lo: number, hi: number): number => lo + rng() * (hi - lo);

/**
 * Turn a seed into a full settings object. Ranges are deliberately tuned to stay
 * inside "interesting" territory — no roll should ever come back all-black or
 * all-white, because a wasted press breaks the slot-machine feel.
 *
 * `sourceData` is optional; without it the "sampled from image" palette is skipped.
 *
 * `forcedMap` pins the algorithm while everything else stays random. The random
 * pick is still drawn even when it's overridden, so a given seed produces the
 * same palette, contrast and grain whichever algorithm it ends up wearing.
 */
export function rollSettings(
  seed: number,
  sourceData?: Uint8ClampedArray,
  forcedMap?: MapId,
): Settings {
  const rng = mulberry32(seed);
  const rolled = pick(rng, MAP_IDS);
  const map = forcedMap ?? rolled;

  // Monochrome-first: ~65% of rolls stay 1-bit black & white, matching the
  // design's intent, with colour showing up often enough to feel like a surprise.
  const paletteRoll = rng();
  let palette = BW;
  if (paletteRoll > 0.65) {
    if (paletteRoll > 0.9 && sourceData) {
      palette = sampleFromImage(sourceData, 2 + Math.floor(rng() * 3) * 2); // 2, 4 or 6 colours
    } else {
      palette = pick(rng, COLOR_PALETTES);
    }
  }

  // How coarse a map can go before it stops reading as an image.
  //
  // The clustered maps (dot, spiral, diagonal) are 8x8 and already carry large
  // visual structure at scale 1; multiplying that by a big pixelScale turns the
  // picture into unreadable blobs. A flat threshold is the opposite case — it
  // has no pattern at all, so chunky pixels are the only texture it gets.
  const pixelScale = CLUSTERED.has(map)
    ? 1 + Math.floor(rng() * 2) // 1-2
    : map === 'threshold'
      ? 2 + Math.floor(rng() * 4) // 2-5
      : 1 + Math.floor(rng() * rng() * 6); // 1-6, biased toward fine detail

  return {
    seed,
    map,
    palette,
    pixelScale,
    brightness: range(rng, -28, 28),
    contrast: range(rng, -15, 55),
    gamma: range(rng, 0.75, 1.45),
    threshold: range(rng, -0.16, 0.16),
    spread: range(rng, 0.7, 1.35),
    invert: rng() > 0.88,
  };
}
