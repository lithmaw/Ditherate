import './styles.css';
import { randomSeed, rollSettings } from './dither/random.ts';
import { warmThresholdMaps } from './dither/thresholdMaps.ts';
import { renderDither, warmRenderer } from './render/index.ts';
import type { Settings } from './dither/types.ts';
import { downloadImageData } from './ui/download.ts';
import { setupDropzone } from './ui/dropzone.ts';
import { History } from './ui/history.ts';
import { Magnifier } from './ui/magnify.ts';
import { setupPixelReveal } from './ui/pixelReveal.ts';

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

const dropbox = el<HTMLButtonElement>('dropbox');
const dropboxPrompt = el('dropboxPrompt');
const previewWrap = el('previewWrap');
const preview = el<HTMLImageElement>('preview');
const zoomPane = el('zoomPane');
const ditheratePixels = el('ditheratePixels');
const caption = el('caption');
const tools = el('tools');
const downloadBtn = el<HTMLButtonElement>('downloadBtn');
const replaceBtn = el<HTMLButtonElement>('replaceBtn');
const historyEl = el('history');
const ditherateBtn = el<HTMLButtonElement>('ditherateBtn');
const fileInput = el<HTMLInputElement>('fileInput');

// The dither result is composited here, then published as an object URL: the
// zoom library works on an <img> with a source, not on a canvas.
const scratch = document.createElement('canvas');
const scratchCtx = scratch.getContext('2d')!;
let previewUrl: string | null = null;

const magnifier = new Magnifier(previewWrap, preview, zoomPane);

/** Single source of truth for the box size lives in CSS. */
const BOX_SIZE =
  parseInt(getComputedStyle(document.documentElement).getPropertyValue('--box-size'), 10) || 358;

/** Exports beyond this are pointless: the result is an upscale of the dithered pass either way. */
const MAX_EXPORT_EDGE = 4096;

type Loaded = {
  bitmap: ImageBitmap;
  name: string;
  /** The image at preview resolution, un-dithered — kept for the compare view. */
  source: ImageData;
};

let loaded: Loaded | null = null;
let current: { settings: Settings; result: ImageData } | null = null;
let busy = false;

const history = new History(historyEl, (seed) => {
  void render(seed);
});

/** Fit `w x h` inside a square of `max`, never scaling up. */
function fit(w: number, h: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

function setCaption(text: string, isError = false): void {
  caption.textContent = text;
  caption.classList.toggle('is-error', isError);
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

  preview.style.width = `${display.width}px`;
  preview.style.height = `${display.height}px`;
  previewWrap.hidden = false;

  dropbox.classList.add('has-image');
  dropboxPrompt.hidden = true;
  ditherateBtn.disabled = false;
  tools.hidden = false;
  history.clear();

  loaded = { bitmap, name, source: rasterise(bitmap, width, height) };
  current = null;

  // Roll straight away — an upload that just sits there waiting for a second
  // click is a worse first impression than seeing the effect immediately.
  void render(takeSharedSeed() ?? randomSeed());
}

/**
 * Composite the result and publish it as an object URL for the <img> and the
 * magnifier — the zoom library needs a real source URL, not a canvas.
 *
 * Deliberately fire-and-forget: nothing downstream needs to wait for the image
 * to paint. An earlier version awaited `img.decode()` here, which never settles
 * while the tab isn't painting and left the app wedged with `busy` stuck true.
 */
function showResult(image: ImageData): void {
  scratch.width = image.width;
  scratch.height = image.height;
  scratchCtx.putImageData(image, 0, 0);

  scratch.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);

    // The magnifier needs the <img> measured, so bind it on load. Assigning
    // onload (rather than adding a listener) means a fast re-roll replaces the
    // pending handler instead of stacking up.
    preview.onload = () => magnifier.attach(url);
    preview.src = url;

    // Safe to release immediately: the element now points at the new URL, and
    // the already-decoded frame it is still showing doesn't depend on the old
    // one staying alive.
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = url;
  }, 'image/png');
}

/**
 * A seed in the URL applies to the first image of the session only — that's the
 * shared-link case. Consuming it means a later upload gets a fresh roll instead
 * of being pinned to whatever seed the link carried.
 */
let sharedSeed: number | null = (() => {
  const match = /(?:^|[#&])s=(\d+)/.exec(window.location.hash);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value >>> 0 : null;
})();

function takeSharedSeed(): number | null {
  const seed = sharedSeed;
  sharedSeed = null;
  return seed;
}

async function render(seed: number): Promise<void> {
  if (!loaded || busy) return;
  busy = true;
  ditherateBtn.classList.add('is-busy');

  try {
    const settings = rollSettings(seed, loaded.source.data);
    const result = await renderDither(loaded.source, settings);
    current = { settings, result };

    showResult(result);
    history.add(seed, result);
    window.history.replaceState(null, '', `#s=${seed}`);
    setCaption('press DITHERATE to roll a different look');
  } catch (error) {
    console.error(error);
    setCaption('something went wrong dithering that image', true);
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
    setCaption("couldn't export that image", true);
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = original;
  }
}

setupDropzone({
  box: dropbox,
  fileInput,
  onImage: loadImage,
  onError: (message) => setCaption(message, true),
  canBrowse: () => loaded === null,
});

replaceBtn.addEventListener('click', () => fileInput.click());

ditherateBtn.addEventListener('click', () => {
  void render(randomSeed());
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
