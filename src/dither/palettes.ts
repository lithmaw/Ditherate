import type { Palette, Rgb } from './types.ts';

export const BW: Palette = {
  name: '1-bit',
  colors: [
    [0, 0, 0],
    [255, 255, 255],
  ],
};

/** Colour palettes a roll can land on. Kept small and high-contrast so they dither well. */
export const COLOR_PALETTES: Palette[] = [
  { name: 'game boy', colors: [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]] },
  { name: 'amber crt', colors: [[16, 8, 0], [94, 44, 0], [204, 102, 0], [255, 183, 76]] },
  { name: 'cga', colors: [[0, 0, 0], [85, 255, 255], [255, 85, 255], [255, 255, 255]] },
  { name: 'phosphor', colors: [[0, 10, 4], [0, 92, 46], [0, 190, 96], [140, 255, 190]] },
  { name: 'blueprint', colors: [[7, 15, 43], [26, 56, 122], [66, 122, 214], [198, 224, 255]] },
  { name: 'ember', colors: [[10, 4, 12], [96, 20, 42], [214, 68, 44], [255, 206, 128]] },
];

/**
 * Build a palette from the image's own colours: median-cut over a subsampled
 * histogram. Gives a look that stays recognisably "this photo" while still
 * being a hard quantization.
 */
export function sampleFromImage(data: Uint8ClampedArray, count: number): Palette {
  const pixels: Rgb[] = [];
  // Subsample: we only need the colour distribution, not every pixel.
  const stride = Math.max(4, Math.floor(data.length / 4 / 4000) * 4);
  for (let i = 0; i < data.length; i += stride) {
    if (data[i + 3] < 8) continue;
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (pixels.length === 0) return BW;

  let buckets: Rgb[][] = [pixels];
  while (buckets.length < count) {
    // Split the bucket with the widest channel spread.
    let target = -1;
    let bestRange = -1;
    let bestChannel = 0;
    for (let b = 0; b < buckets.length; b++) {
      if (buckets[b].length < 2) continue;
      for (let c = 0; c < 3; c++) {
        let lo = 255;
        let hi = 0;
        for (const p of buckets[b]) {
          if (p[c] < lo) lo = p[c];
          if (p[c] > hi) hi = p[c];
        }
        if (hi - lo > bestRange) {
          bestRange = hi - lo;
          target = b;
          bestChannel = c;
        }
      }
    }
    if (target < 0 || bestRange <= 0) break;
    const bucket = buckets[target];
    bucket.sort((a, b) => a[bestChannel] - b[bestChannel]);
    const mid = bucket.length >> 1;
    buckets = [
      ...buckets.slice(0, target),
      bucket.slice(0, mid),
      bucket.slice(mid),
      ...buckets.slice(target + 1),
    ];
  }

  const colors: Rgb[] = buckets.map((bucket) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const p of bucket) {
      r += p[0];
      g += p[1];
      b += p[2];
    }
    const n = bucket.length;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });

  return { name: 'from image', colors };
}
