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

The **algorithm picker** is the one control. Left on `random` it stays a pure slot
machine; pinned to an algorithm, that one is used and everything else — palette,
contrast, gamma, pixel scale, grain — still rolls. The random draw for the algorithm
happens either way, so a given seed produces the same palette and grain whichever
algorithm it ends up wearing.

Two consequences worth keeping:

- History entries store the algorithm alongside the seed, so restoring an earlier roll
  reproduces it exactly even if the picker has moved on since.
- The URL carries both (`#s=1849203&m=dot`), or a shared link would reproduce a roll's
  palette and grain but not its algorithm.

The picker says what the *next* roll will be, not what's on screen — restoring from
history deliberately leaves it alone.

The **algorithm menu** is a custom listbox, not a `<select>` — a native option
list is drawn by the OS and can't be animated, so opening it dissolves a grid of
pixels away to uncover the options. Keyboard behaviour (arrows, Home/End, Enter,
Escape, click-outside) is reimplemented to match the platform. It shows every
option without scrolling, so it flips above the trigger when that's the roomier
side.

Choosing an option only arms the choice — DITHERATE is what generates. That's
what lets you settle on one algorithm and roll it repeatedly.

**Invert** is a one-shot action on the image in front of you, not a mode: it
re-renders the current roll with its polarity flipped and records that as its own
entry. The next roll comes out however it rolls. Pressing it twice returns to
where you started.

It inverts tones *before* quantizing, so the palette stays intact and the dither
structure stays valid — a polarity flip, not a pixel-exact negative of the
output.

**Sound.** Two UI effects from [soundcn](https://github.com/kapishdima/soundcn):
a drop on the generate press and on loading an image, a click on everything else.
Each sound is a self-contained module with the audio inlined as a base64 data
URI, so there is nothing to fetch at runtime. The registry ships a React
`useSound` hook *and* a framework-agnostic `sound-engine.ts`; this project uses
the engine, so no React is involved. A footer switch mutes it, remembered in
`localStorage`. Both footer controls are icon-only; an off state is shown by
dimming the icon and striking it through, with the state carried in
`aria-label` and the tooltip.

Loading an image does **not** dither it. The photo is shown untouched until you
press the button; Invert and Download stay hidden until there's a roll for them
to act on. A seed carried in from a shared link is spent on that first press, so
links still reproduce their roll.

Each new result is **uncovered by dissolving a grid of pixels off it**, painted in
the panel colour so the image assembles out of the background rather than fading
in. The grid coarsens itself on large images so it never spawns thousands of
nodes to animate.

Every animated piece reads a single **motion switch** (`src/ui/motion.ts`) rather
than checking `prefers-reduced-motion` itself, so the footer control and the OS
setting can't disagree. The OS preference is the default; the footer choice wins
once made and is remembered in `localStorage`. With motion off, state changes
still happen — the button still flips to its filled state, it just doesn't
scatter to get there.

The **background** is a field of pixel static behind the whole page (the panel is
opaque, so it only shows in the gutters). A viewport of random bytes at animation
rate is real CPU for something nobody looks at directly, so a handful of frames
are built once and cycled instead.

The **logo** shuffles its own pixels while hovered. The cells sit inside the wordmark,
which carries a CSS mask, so they're clipped to the letterforms — painting one in the
panel colour punches a pixel-shaped hole, and blinking a random third of them in and out
reads as the logo scrambling itself.

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
src/sounds/     soundcn effects and their Web Audio engine
src/ui/         dropzone, pixel reveals, pixel select, logo shuffle, motion, sound, history, download
src/main.ts     wiring and app state
```

## Controls

| | |
|---|---|
| Click the box / drag a file / Ctrl+V | load an image |
| Click the image again | swap in a different one |
| DITHERATE | roll a new random look |
| Invert | re-render the current roll with its polarity flipped |
| Algorithm picker | pin one algorithm, keep everything else random |
| History thumbnails | jump back to an earlier roll |
| Animations (footer) | meteor icon — turn all motion on or off; remembered between visits |
| Sound (footer) | speaker icon — mute the UI effects; remembered between visits |

## Responsive

The preview box is sized in JavaScript (`computeBoxSize`), not CSS. The same
number has to drive the canvas's backing store, and a `min()` inside a custom
property can't be read back as a number — so CSS carries a static fallback for
the first paint and JS refines it against the viewport, keeping the box within
both the column's width and the height left over by the header, controls and
button.

That size is re-applied on resize and rotation, debounced and guarded on the
value actually changing: mobile browsers fire `resize` as the URL bar collapses
on scroll, and re-rasterising the source for each of those would be waste.

Two layout details worth keeping:

- `.stage` is full width. Without it the history strip is bounded by the image
  above it, so a narrow portrait photo squeezes the thumbnails onto a second row
  and the page shifts — the exact thing the reserved row exists to prevent.
- Thumbnails and gaps shrink at 520px and again at 400px so eight of them still
  fit on one row at the narrowest supported width.

Verified with no horizontal overflow and a stable button position at 320, 360,
390, 430, 768 and 1024px.

## Notes

- Exports are capped at 4096px on the long edge. Beyond that there's nothing to gain:
  the result is an upscale of the dithered pass either way.
- EXIF orientation is honoured, so phone photos come out the right way up.
- Don't await `img.decode()` anywhere in the roll path. It never settles while a tab
  isn't painting, which is enough to wedge the whole app.
- Anything gated on an animation finishing needs a timeout backstop, for the same
  reason: animations don't run in a backgrounded tab.
- Arriving dissolves a full-screen pixel cover off the page. **Currently set to
  play on every visit for testing** — `QUIET_MS` in `src/ui/introReveal.ts` is 0;
  restore `10 * 60 * 1000` for the intended once-per-10-minutes behaviour.
  The overlay carries a solid fill in CSS so the page is covered from the first
  paint, and hands that fill over to the cells once JS builds them. `html` also
  gets its background inline in `<head>`, or the browser shows its default white
  page until the stylesheet arrives.
- `styles.css` is linked from `index.html`, not imported from `main.ts`. A JS
  import means the stylesheet is injected only after the module evaluates, so
  the raw unstyled markup paints first; a `<link>` is render-blocking in both
  dev and the build. The cover is deliberately lighter than the
  page — matching it made the reveal invisible. It runs about 800ms.
- Chrome drops the page's custom cursor after a native file dialog closes and
  won't re-evaluate until the pointer moves. `src/ui/cursorFix.ts` forces the
  re-evaluation on the file input's `cancel`/`change` and on window focus.
- The site uses exactly two cursors — a default arrow and a blocked state — set on
  `*` so the browser's own pointer, text and resize cursors are overridden too.
  The blocked one is driven by `:disabled`, so it follows the buttons' real state.
  SVG cursors aren't supported in Safari, which falls back to `auto`/`not-allowed`.
- `icons/` is a staging folder for exported artwork; the served copies live in
  `public/assets/`. Vite is told not to watch it — a design tool writing a file in
  place crashes the dev server's watcher with `EBUSY`.

## Credits

The `dot`, `diagonal` and `spiral` screens were inspired by the matrix set in
[Spargo](https://github.com/darkroomengineering/spargo) (MIT), a real-time GPU
dithering tool by Darkroom Engineering.

Sound effects (`click-003`, `drop-004`) come from
[soundcn](https://github.com/kapishdima/soundcn), originally by
[Kenney](https://kenney.nl) and released under CC0.
