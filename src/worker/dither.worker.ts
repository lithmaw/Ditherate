import { dither } from '../dither/index.ts';
import type { Settings } from '../dither/types.ts';

export type DitherRequest = {
  id: number;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  settings: Settings;
};

export type DitherResponse = {
  id: number;
  buffer: ArrayBuffer;
  width: number;
  height: number;
};

self.onmessage = (event: MessageEvent<DitherRequest>) => {
  const { id, buffer, width, height, settings } = event.data;
  const result = dither({ data: new Uint8ClampedArray(buffer), width, height }, settings);
  const out = result.data.buffer as ArrayBuffer;
  const response: DitherResponse = { id, buffer: out, width: result.width, height: result.height };
  // Transfer rather than copy: full-resolution buffers are tens of megabytes.
  (self as unknown as Worker).postMessage(response, [out]);
};
