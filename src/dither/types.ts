import type { MapId } from './thresholdMaps.ts';

/** An RGB triple, 0-255. */
export type Rgb = [number, number, number];

export type Palette = {
  name: string;
  colors: Rgb[];
};

export type Settings = {
  seed: number;
  /** Which threshold map drives the dither. */
  map: MapId;
  palette: Palette;
  /** Dither at 1/N resolution, then upscale nearest-neighbour for chunky pixels. */
  pixelScale: number;
  brightness: number;
  contrast: number;
  gamma: number;
  /** Shifts the whole threshold map lighter or darker. */
  threshold: number;
  /** How hard the map perturbs the image before quantizing. 1 = one palette step. */
  spread: number;
  invert: boolean;
};

/** Palettes are capped so the GPU path can hold them in a fixed uniform array. */
export const MAX_PALETTE_COLORS = 8;
