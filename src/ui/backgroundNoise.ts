/** Size of one noise pixel on screen. Bigger = chunkier and cheaper. */
const PIXEL = 4;
/** Frames cycled to fake continuous static. */
const FRAMES = 8;
const FPS = 9;

/**
 * A slow field of pixel static behind everything.
 *
 * Deliberately not generated per frame: a viewport's worth of random bytes at
 * animation rate is real CPU for a background nobody looks at directly. A small
 * set of frames is built once and cycled, which is indistinguishable from
 * continuous static at this size and opacity.
 */
export function setupBackgroundNoise(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d', { alpha: true })!;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let frames: ImageData[] = [];
  let index = 0;
  let last = 0;
  let raf = 0;

  const build = (): void => {
    const width = Math.max(1, Math.ceil(window.innerWidth / PIXEL));
    const height = Math.max(1, Math.ceil(window.innerHeight / PIXEL));
    canvas.width = width;
    canvas.height = height;

    frames = Array.from({ length: FRAMES }, () => {
      const frame = ctx.createImageData(width, height);
      const data = frame.data;
      for (let i = 0; i < data.length; i += 4) {
        // Grey specks at low alpha — the CSS opacity does the rest of the work.
        const v = Math.random() < 0.5 ? 255 : 0;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = Math.random() * 60;
      }
      return frame;
    });

    ctx.putImageData(frames[0], 0, 0);
  };

  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    if (now - last < 1000 / FPS) return;
    last = now;
    index = (index + 1) % frames.length;
    ctx.putImageData(frames[index], 0, 0);
  };

  const start = (): void => {
    cancelAnimationFrame(raf);
    if (reducedMotion.matches) return;
    raf = requestAnimationFrame(tick);
  };

  let resizeTimer: number | undefined;
  window.addEventListener('resize', () => {
    // Rebuilding every frame of a full-viewport noise field is expensive, so
    // wait for the drag to settle.
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      build();
      start();
    }, 200);
  });

  reducedMotion.addEventListener('change', start);

  build();
  start();
}
