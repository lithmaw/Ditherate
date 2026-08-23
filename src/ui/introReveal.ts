import { animate, stagger } from 'animejs';
import { animationsEnabled } from './motion.ts';

const STORAGE_KEY = 'ditherate:intro';
/**
 * How long a visitor is considered "already greeted" for.
 *
 * TEMPORARY: 0 makes the intro play on every visit while it's being worked on.
 * Restore `10 * 60 * 1000` for the intended once-per-10-minutes behaviour.
 */
const QUIET_MS = 0;

const TARGET_CELL = 46;
const MAX_CELLS = 900;

function recentlyPlayed(): boolean {
  try {
    const last = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(last) && last > 0 && Date.now() - last < QUIET_MS;
  } catch {
    // Storage blocked — treat every load as a first visit.
    return false;
  }
}

function stamp(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Not remembering it only means it plays again next time.
  }
}

/**
 * Dissolves a full-screen cover off the page on arrival.
 *
 * The overlay carries a solid background in CSS so the page is covered from the
 * very first paint; the cells are only built once this runs, and the solid
 * background is handed over to them at that point. Without that, there'd be a
 * flash of the finished page before the cover appeared.
 */
export function setupIntroReveal(overlay: HTMLElement): void {
  const finish = (): void => overlay.remove();

  if (!animationsEnabled() || recentlyPlayed()) {
    finish();
    return;
  }

  const { innerWidth: width, innerHeight: height } = window;
  let cell = TARGET_CELL;
  let cols = Math.max(1, Math.ceil(width / cell));
  let rows = Math.max(1, Math.ceil(height / cell));
  while (cols * rows > MAX_CELLS) {
    cell *= 1.25;
    cols = Math.max(1, Math.ceil(width / cell));
    rows = Math.max(1, Math.ceil(height / cell));
  }

  overlay.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  overlay.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  const cells = Array.from({ length: cols * rows }, () => {
    const node = document.createElement('span');
    node.className = 'intro__cell';
    overlay.append(node);
    return node;
  });

  // The cells now provide the cover, so the overlay's own fill can go.
  overlay.classList.add('is-ready');
  stamp();

  animate(cells, {
    opacity: 0,
    duration: 220,
    ease: 'linear',
    delay: stagger(4, { grid: [cols, rows], from: 'random' }),
    onComplete: finish,
  });

  // Animations don't run in a background tab; never leave the page covered.
  setTimeout(finish, 4000);
}
