import type { Settings } from './dither/types.ts';
import type { DitherRequest, DitherResponse } from './worker/dither.worker.ts';

/**
 * Promise wrapper around the dither worker. Keeping the heavy pass off the main
 * thread is what lets a 6000px photo be re-rolled without freezing the page.
 */
class DitherClient {
  private worker = new Worker(new URL('./worker/dither.worker.ts', import.meta.url), {
    type: 'module',
  });
  private nextId = 1;
  private pending = new Map<number, (value: ImageData) => void>();

  constructor() {
    this.worker.onmessage = (event: MessageEvent<DitherResponse>) => {
      const { id, buffer, width, height } = event.data;
      const resolve = this.pending.get(id);
      if (!resolve) return;
      this.pending.delete(id);
      resolve(new ImageData(new Uint8ClampedArray(buffer), width, height));
    };
  }

  run(source: ImageData, settings: Settings): Promise<ImageData> {
    const id = this.nextId++;
    // Copy: the caller reuses `source` for every later roll, so we must not
    // transfer its buffer away.
    const buffer = source.data.slice().buffer;
    const request: DitherRequest = {
      id,
      buffer,
      width: source.width,
      height: source.height,
      settings,
    };
    return new Promise<ImageData>((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage(request, [buffer]);
    });
  }
}

export const ditherClient = new DitherClient();
