import { mulberry32 } from './random.ts';

/**
 * Generate a blue-noise threshold map with the void-and-cluster method
 * (Ulichney, 1993).
 *
 * Blue noise is the reason this is worth the trouble: unlike white noise its
 * energy is concentrated at high frequencies, so the dots spread evenly and the
 * eye reads texture rather than clumps. Unlike Bayer it has no repeating grid,
 * so there's no visible crosshatch.
 *
 * The map is a permutation of 0..(size*size-1) normalised to (0,1).
 */
export function generateBlueNoise(size: number, seed: number): Float32Array {
  const total = size * size;
  const pattern = new Uint8Array(total);
  const energy = new Float32Array(total);
  const rank = new Int32Array(total).fill(-1);

  // A gaussian falloff of ~1.5 samples is the standard choice; the radius is
  // where the kernel has decayed to nothing.
  const sigma = 1.9;
  const radius = Math.min(Math.floor(size / 2), 8);
  const kernel: { dx: number; dy: number; w: number }[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      kernel.push({ dx, dy, w: Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)) });
    }
  }

  // The map tiles, so energy has to wrap — otherwise the seams cluster.
  const splat = (index: number, sign: number): void => {
    const x = index % size;
    const y = (index / size) | 0;
    for (const { dx, dy, w } of kernel) {
      const nx = (x + dx + size) % size;
      const ny = (y + dy + size) % size;
      energy[ny * size + nx] += sign * w;
    }
  };

  const tightestCluster = (): number => {
    let best = -1;
    let bestEnergy = -Infinity;
    for (let i = 0; i < total; i++) {
      if (pattern[i] === 1 && energy[i] > bestEnergy) {
        bestEnergy = energy[i];
        best = i;
      }
    }
    return best;
  };

  const largestVoid = (): number => {
    let best = -1;
    let bestEnergy = Infinity;
    for (let i = 0; i < total; i++) {
      if (pattern[i] === 0 && energy[i] < bestEnergy) {
        bestEnergy = energy[i];
        best = i;
      }
    }
    return best;
  };

  // --- initial binary pattern: scatter, then relax it until it stops moving ---
  const rng = mulberry32(seed);
  const initialCount = Math.max(1, Math.round(total / 10));
  let placed = 0;
  while (placed < initialCount) {
    const i = Math.floor(rng() * total);
    if (pattern[i] === 0) {
      pattern[i] = 1;
      splat(i, 1);
      placed++;
    }
  }

  // Bounded: the relaxation converges quickly, but it must never be able to
  // oscillate forever on a pathological start.
  for (let step = 0; step < total * 2; step++) {
    const cluster = tightestCluster();
    pattern[cluster] = 0;
    splat(cluster, -1);
    const empty = largestVoid();
    // Once removing the tightest cluster just re-fills the same cell, the
    // pattern is as evenly spread as it is going to get.
    if (empty === cluster) {
      pattern[cluster] = 1;
      splat(cluster, 1);
      break;
    }
    pattern[empty] = 1;
    splat(empty, 1);
  }

  const initial = Uint8Array.from(pattern);

  // --- phase 1: peel the initial pattern apart, ranking downward ---
  for (let r = initialCount - 1; r >= 0; r--) {
    const cluster = tightestCluster();
    pattern[cluster] = 0;
    splat(cluster, -1);
    rank[cluster] = r;
  }

  // --- phase 2 & 3: refill from the largest void, ranking upward ---
  pattern.set(initial);
  energy.fill(0);
  for (let i = 0; i < total; i++) if (pattern[i] === 1) splat(i, 1);

  for (let r = initialCount; r < total; r++) {
    const empty = largestVoid();
    pattern[empty] = 1;
    splat(empty, 1);
    rank[empty] = r;
  }

  const map = new Float32Array(total);
  for (let i = 0; i < total; i++) map[i] = (rank[i] + 0.5) / total;
  return map;
}
