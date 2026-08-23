import type { Settings } from './types.ts';

/**
 * Apply brightness / contrast / gamma / invert in place, before quantization.
 * Runs on the raw RGBA buffer; alpha is left untouched.
 */
export function preprocess(data: Uint8ClampedArray, settings: Settings): void {
  const { brightness, contrast, gamma, invert } = settings;

  // Standard contrast factor: maps -255..255 onto a multiplier around the midpoint.
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const invGamma = 1 / gamma;

  // Precompute the whole transform as a 256-entry lookup — this runs per channel
  // per pixel, so keeping it out of the inner loop matters on large images.
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    let out = factor * (v + brightness - 128) + 128;
    out = 255 * Math.pow(Math.max(0, Math.min(255, out)) / 255, invGamma);
    lut[v] = invert ? 255 - out : out;
  }

  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
}
