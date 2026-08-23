import { createZoomImageHover } from '@zoom-image/core';

type Handle = { cleanup: () => void };

/**
 * Hover-to-magnify, via @zoom-image/core.
 *
 * The library expects an <img> and a source URL, so the dither result is
 * published as an object URL (see main.ts) rather than staying a canvas. The
 * zoomed view uses that same URL: magnifying the dithered pixels themselves is
 * the point, so there is no higher-resolution source to reach for.
 */
export class Magnifier {
  private handle: Handle | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly image: HTMLImageElement,
    private readonly pane: HTMLElement,
    private readonly scale = 4,
  ) {
    // The pane only carries the zoomed image while the cursor is over the
    // source; otherwise it would sit on top of the preview as a blank panel.
    container.addEventListener('pointerenter', () => pane.classList.add('is-zooming'));
    container.addEventListener('pointerleave', () => pane.classList.remove('is-zooming'));
  }

  /**
   * Re-bind after every roll. `zoomImageSource` is captured when the zoom is
   * created, so a new result needs a new binding rather than a mutated option.
   */
  attach(source: string): void {
    this.detach();
    const width = this.image.clientWidth;
    const height = this.image.clientHeight;
    if (!width || !height) return;

    this.handle = createZoomImageHover(this.container, {
      zoomImageSource: source,
      customZoom: { width, height },
      zoomTarget: this.pane,
      zoomLensClass: 'zoom-lens',
      scale: this.scale,
      // The page doesn't scroll at this size, and locking it makes the whole
      // window feel stuck while the cursor is anywhere near the image.
      disableScrollLock: true,
    });
  }

  detach(): void {
    this.handle?.cleanup();
    this.handle = null;
  }
}
