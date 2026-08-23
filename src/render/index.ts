import { ditherClient } from '../ditherClient.ts';
import type { Settings } from '../dither/types.ts';
import { GpuRenderer } from './gpu.ts';

let gpu: GpuRenderer | null = null;
let initialised = false;

function renderer(): GpuRenderer | null {
  if (!initialised) {
    gpu = GpuRenderer.create();
    initialised = true;
  }
  return gpu;
}

export type Engine = 'webgl' | 'cpu';

let lastEngine: Engine = 'cpu';
export const engine = (): Engine => lastEngine;

/**
 * Dither on the GPU when we can, on the CPU worker when we can't.
 *
 * Both paths return ImageData, so everything downstream — preview, compare,
 * history thumbnails, PNG export — is identical regardless of which ran.
 */
export async function renderDither(source: ImageData, settings: Settings): Promise<ImageData> {
  const gl = renderer();
  if (gl && gl.canRender(source.width, source.height)) {
    try {
      const result = gl.render(source, settings);
      lastEngine = 'webgl';
      return result;
    } catch (error) {
      // A lost context or a driver hiccup shouldn't lose the user's roll —
      // drop to the CPU path for good and carry on.
      console.warn('WebGL render failed, falling back to CPU:', error);
      gpu = null;
    }
  }
  lastEngine = 'cpu';
  return ditherClient.run(source, settings);
}

/** Build the GL context and the threshold maps before the first roll needs them. */
export function warmRenderer(): void {
  renderer();
}
