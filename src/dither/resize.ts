export type ImageLike = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

/** Box-average downscale. Averaging (not point-sampling) keeps detail that would otherwise alias away before dithering. */
export function downscale(src: ImageLike, factor: number): ImageLike {
  const width = Math.max(1, Math.round(src.width / factor));
  const height = Math.max(1, Math.round(src.height / factor));
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * src.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * src.height) / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * src.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * src.width) / width));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const p = (sy * src.width + sx) * 4;
          r += src.data[p];
          g += src.data[p + 1];
          b += src.data[p + 2];
          a += src.data[p + 3];
          n++;
        }
      }
      const p = (y * width + x) * 4;
      data[p] = r / n;
      data[p + 1] = g / n;
      data[p + 2] = b / n;
      data[p + 3] = a / n;
    }
  }
  return { data, width, height };
}

/** Nearest-neighbour upscale — the whole point is hard, un-blurred pixel edges. */
export function upscaleNearest(src: ImageLike, width: number, height: number): ImageLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y * src.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x * src.width) / width));
      const sp = (sy * src.width + sx) * 4;
      const dp = (y * width + x) * 4;
      data[dp] = src.data[sp];
      data[dp + 1] = src.data[sp + 1];
      data[dp + 2] = src.data[sp + 2];
      data[dp + 3] = src.data[sp + 3];
    }
  }
  return { data, width, height };
}
