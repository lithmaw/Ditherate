import { generateBlueNoise } from './blueNoise.ts';
import { mulberry32 } from './random.ts';

export type ThresholdMap = {
  name: string;
  size: number;
  /** size*size values in (0,1) — a normalised permutation of the cell ranks. */
  data: Float32Array;
};

export type MapId =
  | 'bayer2'
  | 'bayer4'
  | 'bayer8'
  | 'bayer16'
  | 'blue-noise'
  | 'threshold'
  | 'dot'
  | 'diagonal'
  | 'spiral'
  | 'white-noise';

export const MAP_IDS: MapId[] = [
  'bayer2',
  'bayer4',
  'bayer8',
  'bayer16',
  'blue-noise',
  'threshold',
  'dot',
  'diagonal',
  'spiral',
  'white-noise',
];

/**
 * Rank every cell by a score function and normalise.
 *
 * Any score function at all yields a valid threshold map this way, because
 * rank-ordering is a bijection onto 0..n-1. That's what makes the dot, diagonal
 * and spiral screens two lines each instead of hand-typed matrices.
 */
function fromScore(size: number, score: (x: number, y: number) => number): Float32Array {
  const total = size * size;
  const indices = Array.from({ length: total }, (_, i) => i);
  const scores = new Float32Array(total);
  for (let i = 0; i < total; i++) scores[i] = score(i % size, (i / size) | 0);
  indices.sort((a, b) => scores[a] - scores[b] || a - b);

  const data = new Float32Array(total);
  for (let rank = 0; rank < total; rank++) data[indices[rank]] = (rank + 0.5) / total;
  return data;
}

/**
 * Recursive Bayer construction:
 * M(2n) = [[4M, 4M+2], [4M+3, 4M+1]]
 */
function bayer(level: number): Float32Array {
  let matrix = [[0]];
  for (let l = 0; l < level; l++) {
    const n = matrix.length;
    const next: number[][] = Array.from({ length: n * 2 }, () => new Array(n * 2).fill(0));
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = matrix[y][x] * 4;
        next[y][x] = v;
        next[y][x + n] = v + 2;
        next[y + n][x] = v + 3;
        next[y + n][x + n] = v + 1;
      }
    }
    matrix = next;
  }
  const size = matrix.length;
  const total = size * size;
  const data = new Float32Array(total);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) data[y * size + x] = (matrix[y][x] + 0.5) / total;
  }
  return data;
}

const wrap = (v: number, size: number): number => {
  const half = size / 2;
  return v > half ? size - v : v;
};

const CACHE = new Map<MapId, ThresholdMap>();

/** Threshold maps are pure and reused across every roll, so they're built once. */
export function getThresholdMap(id: MapId): ThresholdMap {
  const cached = CACHE.get(id);
  if (cached) return cached;

  let size: number;
  let data: Float32Array;

  switch (id) {
    case 'bayer2':
      size = 2;
      data = bayer(1);
      break;
    case 'bayer4':
      size = 4;
      data = bayer(2);
      break;
    case 'bayer8':
      size = 8;
      data = bayer(3);
      break;
    case 'bayer16':
      size = 16;
      data = bayer(4);
      break;
    case 'blue-noise':
      size = 64;
      data = generateBlueNoise(size, 0x5eed);
      break;
    case 'threshold':
      // A flat 50% map: every pixel gets the same cut, so this is a hard
      // posterize with no pattern at all.
      size = 1;
      data = new Float32Array([0.5]);
      break;
    case 'dot': {
      // Clustered dot — a screen-print rosette. Rank grows outward from the
      // cell centre, so the dot swells as the tone darkens.
      size = 8;
      data = fromScore(size, (x, y) => {
        const dx = wrap(Math.abs(x - size / 2 + 0.5), size);
        const dy = wrap(Math.abs(y - size / 2 + 0.5), size);
        return -(dx * dx + dy * dy);
      });
      break;
    }
    case 'diagonal': {
      // A 45-degree line screen: bands ordered along x+y, ties broken along x-y.
      size = 8;
      data = fromScore(size, (x, y) => ((x + y) % size) + (((x - y + size) % size) / size) * 0.9);
      break;
    }
    case 'spiral': {
      // Archimedean spiral out from the cell centre.
      size = 8;
      data = fromScore(size, (x, y) => {
        const dx = x - size / 2 + 0.5;
        const dy = y - size / 2 + 0.5;
        const angle = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
        return Math.hypot(dx, dy) + angle;
      });
      break;
    }
    case 'white-noise': {
      // Plain random threshold — grainy, film-like. Fixed seed so the grain is
      // stable across rolls of the same settings.
      size = 64;
      const rng = mulberry32(0xc0ffee);
      data = fromScore(size, () => rng());
      break;
    }
  }

  const map: ThresholdMap = { name: id, size, data };
  CACHE.set(id, map);
  return map;
}

/** Build every map now, so the first roll never pays for blue noise generation. */
export function warmThresholdMaps(): void {
  for (const id of MAP_IDS) getThresholdMap(id);
}
