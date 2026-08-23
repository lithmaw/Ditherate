# DITHERATE

Upload an image, hit one button, get a randomly dithered version. Press again for a
different look. No settings, no sign-in, no server — every pixel is processed in your
own browser and nothing is ever uploaded anywhere.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + static bundle into dist/
npm run preview  # serve the production build
```

`dist/` is plain static files: drop it on Vercel, Netlify, GitHub Pages, or anything
that serves a folder.

## How it works

Pressing DITHERATE generates a random 32-bit **seed**. Everything else — the threshold
map, palette, pixel scale, contrast, gamma, spread — is derived from that seed by a
deterministic PRNG (`src/dither/random.ts`). That one decision buys three features
almost for free:

- the history strip stores a seed and a thumbnail instead of megabytes of pixels;
- the PNG export reproduces the exact roll at full resolution;
- the seed lives in the URL (`#s=1849203`), so a look you like is a shareable link.

Roughly two thirds of rolls stay 1-bit black and white; the rest land on a colour
palette, including one derived from your own image by median cut.

### Algorithms

Ten ordered dithers, all driven by the same one-line rule — only the threshold map
differs:

```
out = nearest_palette_color(color + (map[x % n][y % n] - 0.5) * spread)
```

| | |
|---|---|
| `bayer2` `bayer4` `bayer8` `bayer16` | recursive Bayer matrices, coarse to fine |
| `blue-noise` | 64×64 void-and-cluster map — even grain, no grid |
| `threshold` | flat 50% cut; hard posterize, no pattern |
| `dot` `spiral` | clustered-dot screens, rosette halftones |
| `diagonal` | 45° line screen |
| `white-noise` | random threshold; grainy and film-like |

Every one is **point-wise** — a pixel's output depends only on its own colour and its
position in the map. No neighbour dependency, which is exactly why the whole set
collapses into a single GPU shader pass.

`dot`, `spiral` and `diagonal` are capped at low pixel scales: their 8×8 cells already
carry large structure, and enlarging that turns the picture into unreadable blobs.

### Rendering

Two engines, chosen automatically:

- **WebGL2** (`src/render/`) — one fragment shader, no dependency. ~0.9ms at preview
  size, ~16ms at 4K.
- **CPU** (`src/dither/`, in a Web Worker) — the fallback, and the reference the shader
  is written to match. ~7× slower.

The renderers are never mixed within a session: WebGL drives both the preview and the
export, or the CPU path drives both. Both return `ImageData`, so the preview, compare,
history and export code is identical either way.

Threshold maps are shared between the two engines, built once and cached. Blue noise
generation takes ~28ms, so it's warmed on idle at startup rather than being charged to
whichever roll happens to land on it first.

### Interface

The UI is deliberately bare: an image, one button, and nothing to read. There are no
instructions and no readout of what a roll produced — the picture is the feedback. The
only text that can appear under the image is an error.

The button's **pixel reveal** uses [anime.js](https://animejs.com)
(`src/ui/pixelReveal.ts`). It rests as grey text in a matching outline; hovering
scatters white cells across it via `stagger(7, { grid, from: 'random' })` until they
fill it in. Three details worth keeping:

- The colour flip is driven by the same class the animation toggles, not a CSS `:hover`
  rule — text and fill stay in lockstep, keyboard focus behaves identically, and no
  sticky hover is left behind on touch.
- It refuses to play while the button is disabled. A locked button that lights up on
  hover reads as clickable when it isn't.
- Reduced-motion users get the state change without the scatter.

### Layout

```
src/dither/     threshold maps, palettes, CPU pipeline — pure, DOM-free
src/render/     WebGL2 renderer + engine selection
src/worker/     runs src/dither off the main thread
src/ui/         dropzone, pixel reveal, history, download
src/main.ts     wiring and app state
```

## Controls

| | |
|---|---|
| Click the box / drag a file / Ctrl+V | load an image |
| Click the image again | swap in a different one |
| DITHERATE | roll a new random look |
| History thumbnails | jump back to an earlier roll |

## Notes

- Exports are capped at 4096px on the long edge. Beyond that there's nothing to gain:
  the result is an upscale of the dithered pass either way.
- EXIF orientation is honoured, so phone photos come out the right way up.
- The "Support" link in the header is a placeholder — point it somewhere real.
- Don't await `img.decode()` anywhere in the roll path. It never settles while a tab
  isn't painting, which is enough to wedge the whole app.

## Credits

The `dot`, `diagonal` and `spiral` screens were inspired by the matrix set in
[Spargo](https://github.com/darkroomengineering/spargo) (MIT), a real-time GPU
dithering tool by Darkroom Engineering.
