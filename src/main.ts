import './styles.css';
import { randomSeed, rollSettings } from './dither/random.ts';
import { MAP_IDS, MAP_LABELS, warmThresholdMaps, type MapId } from './dither/thresholdMaps.ts';
import { renderDither, warmRenderer } from './render/index.ts';
import type { Settings } from './dither/types.ts';
import { downloadImageData } from './ui/download.ts';
import { setupDropzone } from './ui/dropzone.ts';
import { History } from './ui/history.ts';
import { setupLogoShuffle } from './ui/logoShuffle.ts';
import { PixelSelect } from './ui/pixelSelect.ts';
import { setupBackgroundNoise } from './ui/backgroundNoise.ts';
import { setupCursorFix } from './ui/cursorFix.ts';
import { ImageReveal } from './ui/imageReveal.ts';
import { setupIntroReveal } from './ui/introReveal.ts';
import { animationsEnabled, onAnimationsChange, setAnimationsEnabled } from './ui/motion.ts';
import { onSoundChange, play, setSoundEnabled, soundEnabled } from './ui/sound.ts';
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
const algorithmRoot = el('algorithmRoot');
const algorithmTrigger = el<HTMLButtonElement>('algorithmTrigger');
const algorithmValue = el('algorithmValue');
const algorithmPanel = el('algorithmPanel');
const algorithmList = el('algorithmList');
const algorithmPixels = el('algorithmPixels');
const invertBtn = el<HTMLButtonElement>('invertBtn');
const backdrop = el<HTMLCanvasElement>('backdrop');
const canvasPixels = el('canvasPixels');
const intro = el('intro');
const motionToggle = el<HTMLButtonElement>('motionToggle');
const soundToggle = el<HTMLButtonElement>('soundToggle');
const wordmark = el('wordmark');
const wordmarkShuffle = el('wordmarkShuffle');
const caption = el('caption');
const tools = el('tools');
const downloadBtn = el<HTMLButtonElement>('downloadBtn');
const historyEl = el('history');
const ditherateBtn = el<HTMLButtonElement>('ditherateBtn');
const fileInput = el<HTMLInputElement>('fileInput');

const ctx = canvas.getContext('2d')!;
const imageReveal = new ImageReveal(dropbox, canvasPixels);

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
let current: { settings: Settings; result: ImageData; flipped: boolean } | null = null;
let busy = false;

const history = new History(historyEl, (seed, map, wasFlipped) => {
  // Restore the roll exactly as it was, whatever the controls say now.
  void render(seed, map, wasFlipped);
});

/** The algorithm the picker is pinned to, or null for "random". */
let pinnedMap: MapId | null = null;

// Constructed for its side effects: it owns the trigger, the listbox and the
// pixel cover, and reports back through onChange.
new PixelSelect({
  root: algorithmRoot,
  trigger: algorithmTrigger,
  valueEl: algorithmValue,
  panel: algorithmPanel,
  list: algorithmList,
  pixels: algorithmPixels,
  options: [
    { value: '', label: 'Random' },
    ...MAP_IDS.map((id) => ({ value: id, label: MAP_LABELS[id] })),
  ],
  onChange: (value) => {
    // Selecting only arms the choice; DITHERATE is what generates. That's what
    // lets you sit on one algorithm and roll it repeatedly.
    pinnedMap = (value || null) as MapId | null;
  },
});

/** Fit `w x h` inside a square of `max`, never scaling up. */
function fit(w: number, h: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/** Invert and Download only mean anything once something has been generated. */
function setRollActionsEnabled(enabled: boolean): void {
  invertBtn.disabled = !enabled;
  downloadBtn.disabled = !enabled;
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
  // The controls appear with the image so the algorithm can be chosen before
  // generating. Invert and Download act on a roll, so they stay disabled until
  // there is one rather than disappearing.
  tools.hidden = false;
  setRollActionsEnabled(false);
  history.clear();

  loaded = { bitmap, name, source: rasterise(bitmap, width, height) };
  current = null;
  play('drop');

  // Show the image untouched. Dithering is what the button is for — doing it
  // on upload spends the user's first look before they've asked for anything.
  ctx.putImageData(loaded.source, 0, 0);

  // Nothing is rolled yet, so the URL shouldn't still name the previous roll.
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

/**
 * A seed in the URL applies to the first image of the session only — that's the
 * shared-link case. Consuming it means a later upload gets a fresh roll instead
 * of being pinned to whatever seed the link carried.
 */
let shared: { seed: number; map?: MapId; inverted: boolean } | null = (() => {
  const seedMatch = /(?:^|[#&])s=(\d+)/.exec(window.location.hash);
  if (!seedMatch) return null;
  const seed = Number(seedMatch[1]);
  if (!Number.isFinite(seed)) return null;

  const mapMatch = /(?:^|[#&])m=([\w-]+)/.exec(window.location.hash);
  const map = MAP_IDS.find((id) => id === mapMatch?.[1]);
  const inverted = /(?:^|[#&])i=1/.test(window.location.hash);
  return { seed: seed >>> 0, map, inverted };
})();

function takeShared(): { seed: number; map?: MapId; inverted: boolean } | null {
  const value = shared;
  shared = null;
  return value;
}

async function render(seed: number, forcedMap?: MapId, flipped = false): Promise<void> {
  if (!loaded || busy) return;
  busy = true;
  ditherateBtn.classList.add('is-busy');

  try {
    const rolled = rollSettings(seed, loaded.source.data, forcedMap ?? pinnedMap ?? undefined);
    const settings = flipped ? { ...rolled, invert: !rolled.invert } : rolled;
    const result = await renderDither(loaded.source, settings);
    current = { settings, result, flipped };

    ctx.putImageData(result, 0, 0);
    imageReveal.play();
    setRollActionsEnabled(true);
    history.add(seed, settings.map, flipped, result);
    // The map and invert flag go in the URL too, or a shared link reproduces
    // the roll's palette and grain but not how it actually looked.
    const invertFlag = flipped ? '&i=1' : '';
    window.history.replaceState(null, '', `#s=${seed}&m=${settings.map}${invertFlag}`);
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
  downloadBtn.textContent = 'Rendering…';

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
    // Not unconditionally re-enabled: the image may have been replaced while
    // the export was running, which leaves nothing to download.
    downloadBtn.disabled = !current;
    downloadBtn.textContent = original;
  }
}

// Run before anything else so the cover comes off as early as possible.
setupIntroReveal(intro);
setupCursorFix(fileInput);

setupDropzone({
  box: dropbox,
  fileInput,
  onImage: loadImage,
  onError: (message) => setCaption(message),
});

ditherateBtn.addEventListener('click', () => {
  play('drop');
  // A seed carried in from a shared link is spent on the first press, so the
  // link still reproduces its roll even though upload no longer generates.
  const shared = takeShared();
  if (shared) void render(shared.seed, shared.map, shared.inverted);
  else void render(randomSeed());
});


downloadBtn.addEventListener('click', () => {
  play('click');
  void download();
});

invertBtn.addEventListener('click', () => {
  play('click');
  if (!current) return;
  // A one-shot action on the picture in front of you, recorded as its own
  // entry. It is not a mode: the next roll comes out however it rolls.
  void render(current.settings.seed, current.settings.map, !current.flipped);
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
setupBackgroundNoise(backdrop);

/**
 * The footer controls are icon-only, so the state has to live in the
 * accessible name and the tooltip rather than in visible text.
 */
function paintToggle(button: HTMLButtonElement, label: string, on: boolean): void {
  const text = `${label}: ${on ? 'On' : 'Off'}`;
  button.setAttribute('aria-pressed', String(on));
  button.setAttribute('aria-label', text);
  button.title = text;
}

function paintMotionToggle(): void {
  paintToggle(motionToggle, 'Animations', animationsEnabled());
}

// The algorithm menu's own elements are built by PixelSelect, so the tick is
// attached here rather than wiring sound through a generic component.
algorithmTrigger.addEventListener('click', () => play('click'));
algorithmList.addEventListener('click', () => play('click'));

function paintSoundToggle(): void {
  paintToggle(soundToggle, 'Sound', soundEnabled());
}

motionToggle.addEventListener('click', () => {
  play('click');
  setAnimationsEnabled(!animationsEnabled());
});

soundToggle.addEventListener('click', () => {
  // Play before muting so switching off still gives feedback that it worked.
  play('click');
  setSoundEnabled(!soundEnabled());
});

onAnimationsChange((on) => {
  paintMotionToggle();
  // Any cover mid-dissolve would otherwise freeze on top of the image.
  if (!on) imageReveal.hide();
});
onSoundChange(paintSoundToggle);

paintMotionToggle();
paintSoundToggle();
