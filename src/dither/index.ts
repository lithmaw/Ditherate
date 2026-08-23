import { preprocess } from './preprocess.ts';
import { nearestColor } from './quantize.ts';
import { downscale, upscaleNearest, type ImageLike } from './resize.ts';
import { getThresholdMap } from './thresholdMaps.ts';
import type { Settings } from './types.ts';

/**
 * The CPU pipeline — the fallback path, and the reference the GPU shader is
 * written to match. Pure and DOM-free so it can run in a worker.
 */
export function dither(source: ImageLike, settings: Settings): ImageLike {
  const { width, height } = source;

  // Work on a copy — the caller keeps the original for the compare view.
  let img: ImageLike = { data: new Uint8ClampedArray(source.data), width, height };

  preprocess(img.data, settings);

  const scaled = settings.pixelScale > 1;
  if (scaled) img = downscale(img, settings.pixelScale);

  applyThresholdMap(img, settings);

  return scaled ? upscaleNearest(img, width, height) : img;
}

/**
 * Ordered dithering: nudge each pixel by the threshold map, then snap to the
 * nearest palette colour.
 *
 * Every algorithm in the app reduces to this one loop — only the map differs.
 * That's also why the whole set runs in a single GPU shader pass: there's no
 * pixel-to-pixel dependency anywhere in it.
 */
function applyThresholdMap(img: ImageLike, settings: Settings): void {
  const { data, width, height } = img;
  const { palette, threshold, spread } = settings;
  const map = getThresholdMap(settings.map);

  // One full step of the palette ramp: enough to push a pixel to its neighbour.
  const amount = (255 / Math.max(1, palette.colors.length - 1)) * spread;

  for (let y = 0; y < height; y++) {
    const row = (y % map.size) * map.size;
    for (let x = 0; x < width; x++) {
      const nudge = (map.data[row + (x % map.size)] - 0.5 + threshold) * amount;
      const p = (y * width + x) * 4;
      const [r, g, b] = nearestColor(
        palette,
        data[p] + nudge,
        data[p + 1] + nudge,
        data[p + 2] + nudge,
      );
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
    }
  }
}

export type { ImageLike };
