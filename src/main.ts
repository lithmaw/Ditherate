import './styles.css';
import { randomSeed, rollSettings } from './dither/random.ts';
import { MAP_IDS, MAP_LABELS, warmThresholdMaps, type MapId } from './dither/thresholdMaps.ts';
import { renderDither, warmRenderer } from './render/index.ts';
import type { Settings } from './dither/types.ts';
import { downloadImageData } from './ui/download.ts';
import { setupDropzone } from './ui/dropzone.ts';
import { History } from './ui/history.ts';
import { setupLogoShuffle } from './ui/logoShuffle.ts';
import { setupPixelReveal } from './ui/pixelReveal.ts';

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

const dropbox = el<HTMLButtonElement>('dropbox');
const dropboxPrompt = el('dropboxPrompt');
const canvas = el<HTMLCanvasElement>('canvas');
const ditheratePixels = el('ditheratePixels');
const algorithmSelect = el<HTMLSelectElement>('algorithm');
const wordmark = el('wordmark');
const wordmarkShuffle = el('wordmarkShuffle');
const caption = el('caption');
const tools = el('tools');
const downloadBtn = el<HTMLButtonElement>('downloadBtn');
const historyEl = el('history');
const ditherateBtn = el<HTMLButtonElement>('ditherateBtn');
const fileInput = el<HTMLInputElement>('fileInput');

const ctx = canvas.getContext('2d')!;

/** Single source of truth for the box size lives in CSS. */
const BOX_SIZE =
  parseInt(getComputedStyle(document.documentElement).getPropertyValue('--box-size'), 10) || 358;

/** Exports beyond this are pointless: the result is an upscale of the dithered pass either way. */
const MAX_EXPORT_EDGE = 4096;

type Loaded = {
  bitmap: ImageBitmap;
  name: string;
  /** The image at preview resolution, un-dithered — re-dithered on every roll. */
  source: ImageData;
};

let loaded: Loaded | null = null;
let current: { settings: Settings; result: ImageData } | null = null;
let busy = false;

const history = new History(historyEl, (seed, map) => {
  // Restore the roll exactly as it was, whatever the picker says now.
  void render(seed, map);
});

/** The algorithm the picker is pinned to, or null for "random". */
const selectedMap = (): MapId | null => (algorithmSelect.value || null) as MapId | null;

/** Fit `w x h` inside a square of `max`, never scaling up. */
function fit(w: number, h: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/** The caption is an error slot only — it stays hidden when nothing is wrong. */
function setCaption(text: string): void {
  caption.textContent = text;
  caption.hidden = false;
}

function clearCaption(): void {
  caption.textContent = '';
  caption.hidden = true;
}

/** Draw a bitmap into an offscreen canvas at a given size and read the pixels back. */
function rasterise(bitmap: ImageBitmap, width: number, height: number): ImageData {
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  const surfaceCtx = surface.getContext('2d', { willReadFrequently: true })!;
  surfaceCtx.drawImage(bitmap, 0, 0, width, height);
  return surfaceCtx.getImageData(0, 0, width, height);
}

function loadImage(bitmap: ImageBitmap, name: string): void {
  // The canvas backing store matches the on-screen size in device pixels, so one
  // dithered pixel lands on exactly one device pixel — no browser resampling to
  // smear the pattern.
  const display = fit(bitmap.width, bitmap.height, BOX_SIZE);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.round(display.width * dpr);
  const height = Math.round(display.height * dpr);

  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${display.width}px`;
  canvas.style.height = `${display.height}px`;
  canvas.hidden = false;

  dropbox.classList.add('has-image');
  dropboxPrompt.hidden = true;
  clearCaption();
  ditherateBtn.disabled = false;
  tools.hidden = false;
  history.clear();

  loaded = { bitmap, name, source: rasterise(bitmap, width, height) };
  current = null;

  // Roll straight away — an upload that just sits there waiting for a second
  // click is a worse first impression than seeing the effect immediately.
  const shared = takeShared();
  void render(shared?.seed ?? randomSeed(), shared?.map);
}

/**
 * A seed in the URL applies to the first image of the session only — that's the
 * shared-link case. Consuming it means a later upload gets a fresh roll instead
 * of being pinned to whatever seed the link carried.
 */
let shared: { seed: number; map?: MapId } | null = (() => {
  const seedMatch = /(?:^|[#&])s=(\d+)/.exec(window.location.hash);
  if (!seedMatch) return null;
  const seed = Number(seedMatch[1]);
  if (!Number.isFinite(seed)) return null;

  const mapMatch = /(?:^|[#&])m=([\w-]+)/.exec(window.location.hash);
  const map = MAP_IDS.find((id) => id === mapMatch?.[1]);
  return { seed: seed >>> 0, map };
})();

function takeShared(): { seed: number; map?: MapId } | null {
  const value = shared;
  shared = null;
  return value;
}

async function render(seed: number, forcedMap?: MapId): Promise<void> {
  if (!loaded || busy) return;
  busy = true;
  ditherateBtn.classList.add('is-busy');

  try {
    const settings = rollSettings(seed, loaded.source.data, forcedMap ?? selectedMap() ?? undefined);
    const result = await renderDither(loaded.source, settings);
    current = { settings, result };

    ctx.putImageData(result, 0, 0);
    history.add(seed, settings.map, result);
    // The map goes in the URL too, or a shared link reproduces the roll's
    // palette and grain but not its algorithm.
    window.history.replaceState(null, '', `#s=${seed}&m=${settings.map}`);
    clearCaption();
  } catch (error) {
    console.error(error);
    setCaption('something went wrong dithering that image');
  } finally {
    busy = false;
    ditherateBtn.classList.remove('is-busy');
  }
}

/**
 * Scale `pixelScale` by the resolution ratio so the export is a true upscale of
 * what was previewed rather than a much finer, different-looking dither.
 *
 * Only `pixelScale` is touched: the dither runs on the already-downscaled
 * buffer, so scaling it keeps that buffer identical between preview and export,
 * which in turn keeps the threshold map's cell size correct without adjustment.
 */
function scaleSettings(settings: Settings, factor: number): Settings {
  return {
    ...settings,
    pixelScale: Math.max(1, settings.pixelScale * factor),
  };
}

async function download(): Promise<void> {
  if (!loaded || !current || busy) return;
  downloadBtn.disabled = true;
  const original = downloadBtn.textContent;
  downloadBtn.textContent = 'rendering…';

  try {
    const target = fit(loaded.bitmap.width, loaded.bitmap.height, MAX_EXPORT_EDGE);
    const source = rasterise(loaded.bitmap, target.width, target.height);
    const factor = target.width / loaded.source.width;
    const result = await renderDither(source, scaleSettings(current.settings, factor));
    await downloadImageData(result, `ditherate-${current.settings.seed}.png`);
  } catch (error) {
    console.error(error);
    setCaption("couldn't export that image");
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = original;
  }
}

setupDropzone({
  box: dropbox,
  fileInput,
  onImage: loadImage,
  onError: (message) => setCaption(message),
});

ditherateBtn.addEventListener('click', () => {
  void render(randomSeed());
});

for (const id of MAP_IDS) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = MAP_LABELS[id];
  algorithmSelect.append(option);
}

// Changing the algorithm re-rolls immediately, so the choice is visible at once
// rather than waiting for the next press.
algorithmSelect.addEventListener('change', () => {
  if (loaded) void render(randomSeed());
});

downloadBtn.addEventListener('click', () => {
  void download();
});

// Build the GL context and the threshold maps up front. Blue noise in
// particular takes a moment to generate, and doing it lazily would put that
// cost on whichever roll happens to land on it first.
warmRenderer();
if (typeof requestIdleCallback === 'function') {
  requestIdleCallback(() => warmThresholdMaps());
} else {
  setTimeout(warmThresholdMaps, 0);
}

setupPixelReveal(ditherateBtn, ditheratePixels);
setupLogoShuffle(wordmark, wordmarkShuffle);
