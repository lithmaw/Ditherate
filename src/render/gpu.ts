import { getThresholdMap, type MapId } from '../dither/thresholdMaps.ts';
import { MAX_PALETTE_COLORS, type Settings } from '../dither/types.ts';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders.ts';

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

/**
 * WebGL2 dither renderer.
 *
 * Runs on an offscreen canvas and hands back ImageData, so it is a drop-in peer
 * of the CPU path — the preview, history and export code downstream don't know
 * or care which engine produced the pixels.
 */
export class GpuRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private imageTexture: WebGLTexture;
  private mapTexture: WebGLTexture;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private uploadedMap: MapId | null = null;
  private lost = false;

  static create(): GpuRenderer | null {
    try {
      return new GpuRenderer();
    } catch (error) {
      console.warn('WebGL dither unavailable, falling back to CPU:', error);
      return null;
    }
  }

  private constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      // readPixels happens after the draw returns, so the buffer has to survive.
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.lost = true;
    });

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;
    gl.useProgram(program);

    for (const name of [
      'uImage', 'uMap', 'uPalette', 'uPaletteCount', 'uMapSize', 'uGrid', 'uLod',
      'uThreshold', 'uSpread', 'uBrightness', 'uContrast', 'uGamma', 'uInvert',
    ]) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }

    // One triangle covering clip space — cheaper than two, and no seam.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const attrib = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(attrib);
    gl.vertexAttribPointer(attrib, 2, gl.FLOAT, false, 0, 0);

    this.imageTexture = gl.createTexture()!;
    this.mapTexture = gl.createTexture()!;
    gl.uniform1i(this.uniforms.uImage, 0);
    gl.uniform1i(this.uniforms.uMap, 1);
  }

  /** True if this renderer can handle an image of the given size. */
  canRender(width: number, height: number): boolean {
    if (this.lost) return false;
    const max = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
    return width <= max && height <= max;
  }

  private uploadMap(id: MapId): void {
    if (this.uploadedMap === id) return;
    const gl = this.gl;
    const map = getThresholdMap(id);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.mapTexture);
    // R32F: an 8-bit map would quantize the 4096 ranks of the blue-noise
    // texture down to 256 levels and reintroduce banding.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, map.size, map.size, 0, gl.RED, gl.FLOAT, map.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    this.uploadedMap = id;
  }

  private uploadImage(source: ImageData): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, source.width, source.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // Mipmaps give the shader an O(1) box-averaged downscale via textureLod, at
    // any pixelScale. Sampling the block explicitly would match the CPU path's
    // box filter exactly, but costs scale^2 taps per pixel — and export scales
    // pixelScale by the resolution ratio, so that reaches thousands of taps on a
    // 4K render. Trilinear mip sampling is a slightly different filter; the
    // resulting divergence from the CPU path is ~7% of pixels at pixelScale 3,
    // all on quantization boundaries.
    //
    // That divergence never reaches a user: engines are never mixed within a
    // session. WebGL drives both the preview and the export, or (if it is
    // unavailable) the CPU path drives both.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  /** Render one dither and read the pixels back. */
  render(source: ImageData, settings: Settings): ImageData {
    const gl = this.gl;
    const { width, height } = source;

    this.canvas.width = width;
    this.canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);

    this.uploadImage(source);
    this.uploadMap(settings.map);

    const map = getThresholdMap(settings.map);
    const scale = Math.max(1, settings.pixelScale);
    const gridW = Math.max(1, Math.round(width / scale));
    const gridH = Math.max(1, Math.round(height / scale));

    const colors = settings.palette.colors.slice(0, MAX_PALETTE_COLORS);
    const flat = new Float32Array(MAX_PALETTE_COLORS * 3);
    colors.forEach((c, i) => flat.set(c, i * 3));

    const u = this.uniforms;
    gl.uniform3fv(u.uPalette, flat);
    gl.uniform1i(u.uPaletteCount, colors.length);
    gl.uniform1f(u.uMapSize, map.size);
    gl.uniform2f(u.uGrid, gridW, gridH);
    gl.uniform1f(u.uLod, Math.log2(scale));
    gl.uniform1f(u.uThreshold, settings.threshold);
    gl.uniform1f(u.uSpread, settings.spread);
    gl.uniform1f(u.uBrightness, settings.brightness);
    gl.uniform1f(u.uContrast, settings.contrast);
    gl.uniform1f(u.uGamma, settings.gamma);
    gl.uniform1f(u.uInvert, settings.invert ? 1 : 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const pixels = new Uint8ClampedArray(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    // No row flip needed: the framebuffer's bottom row corresponds to v=0,
    // which is the first (top) row of the unflipped texture upload.
    return new ImageData(pixels, width, height);
  }
}
