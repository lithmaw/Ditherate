export const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

/**
 * The entire dither, in one pass.
 *
 * Every algorithm in the app is point-wise — a pixel's output depends only on
 * its own colour and its position in the threshold map — so there is no
 * neighbour dependency to serialise and the whole thing collapses into a single
 * fragment shader.
 *
 * This is written to match src/dither/index.ts exactly, so the GPU and CPU paths
 * produce the same picture.
 */
export const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D uImage;
uniform sampler2D uMap;       // R32F threshold map, NEAREST
uniform vec3  uPalette[8];
uniform int   uPaletteCount;
uniform float uMapSize;
uniform vec2  uGrid;          // dither resolution in cells
uniform float uLod;           // mip level, for box-averaged downscaling
uniform float uThreshold;
uniform float uSpread;
uniform float uBrightness;
uniform float uContrast;
uniform float uGamma;
uniform float uInvert;
uniform float uBypass;        // 1.0 = show the source untouched

in vec2 vUv;
out vec4 fragColor;

vec3 adjust(vec3 c) {
  float factor = (259.0 * (uContrast + 255.0)) / (255.0 * (259.0 - uContrast));
  vec3 v = clamp(factor * (c + uBrightness - 128.0) + 128.0, 0.0, 255.0);
  v = 255.0 * pow(v / 255.0, vec3(1.0 / uGamma));
  return mix(v, 255.0 - v, uInvert);
}

vec3 nearestColor(vec3 c) {
  vec3 best = uPalette[0];
  float bestDist = 1.0e20;
  for (int i = 0; i < 8; i++) {
    if (i >= uPaletteCount) break;
    vec3 d = c - uPalette[i];
    float dist = dot(d, d);
    if (dist < bestDist) {
      bestDist = dist;
      best = uPalette[i];
    }
  }
  return best;
}

void main() {
  // Snap to the dither grid: this is the GPU equivalent of downscaling by
  // pixelScale and then upscaling nearest-neighbour.
  vec2 cell = floor(vUv * uGrid);
  vec2 uv = (cell + 0.5) / uGrid;
  vec3 source = textureLod(uImage, uv, uLod).rgb * 255.0;

  if (uBypass > 0.5) {
    fragColor = vec4(source / 255.0, 1.0);
    return;
  }

  vec3 c = adjust(source);

  ivec2 mi = ivec2(mod(cell, vec2(uMapSize)));
  float t = texelFetch(uMap, mi, 0).r;

  float amount = (255.0 / max(1.0, float(uPaletteCount) - 1.0)) * uSpread;
  float nudge = (t - 0.5 + uThreshold) * amount;

  fragColor = vec4(nearestColor(c + nudge) / 255.0, 1.0);
}`;
