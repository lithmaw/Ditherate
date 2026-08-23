import { animate, stagger, utils } from 'animejs';

const CELL = 6;

/**
 * Idle pixel-shuffle over the logo while the cursor is on it.
 *
 * The cells sit inside the wordmark, which carries a CSS mask — so they're
 * clipped to the letterforms and painting one in the panel colour punches a
 * pixel-shaped hole. Blinking a random handful in and out reads as the logo
 * scrambling itself.
 */
export function setupLogoShuffle(logo: HTMLElement, layer: HTMLElement): void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let cells: HTMLElement[] = [];
  let grid: [number, number] = [1, 1];
  let hovering = false;
  let timer: number | undefined;

  const build = (): void => {
    const { width, height } = logo.getBoundingClientRect();
    if (!width || !height) return;

    const cols = Math.max(1, Math.round(width / CELL));
    const rows = Math.max(1, Math.round(height / CELL));
    if (cols === grid[0] && rows === grid[1] && cells.length) return;

    grid = [cols, rows];
    layer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    layer.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    layer.replaceChildren();

    cells = Array.from({ length: cols * rows }, () => {
      const cell = document.createElement('span');
      cell.className = 'wordmark__cell';
      layer.append(cell);
      return cell;
    });
  };

  /** One pass: scatter a random subset out, then bring them back. */
  const shuffle = (): void => {
    if (!hovering || !cells.length) return;

    // A third of the cells per pass — enough to read as motion, sparse enough
    // that the word stays legible while it churns.
    const picked = cells.filter(() => Math.random() < 0.34);
    if (picked.length) {
      animate(picked, {
        opacity: [
          { to: 1, duration: 90 },
          { to: 0, duration: 200 },
        ],
        delay: stagger(12, { from: 'random' }),
        ease: 'linear',
      });
    }
    timer = window.setTimeout(shuffle, 280);
  };

  const stop = (): void => {
    hovering = false;
    window.clearTimeout(timer);
    if (cells.length) {
      utils.remove(cells);
      for (const cell of cells) cell.style.opacity = '0';
    }
  };

  logo.addEventListener('pointerenter', () => {
    if (reducedMotion.matches) return;
    build();
    hovering = true;
    shuffle();
  });
  logo.addEventListener('pointerleave', stop);
  window.addEventListener('blur', stop);
  window.addEventListener('resize', build);

  build();
}
