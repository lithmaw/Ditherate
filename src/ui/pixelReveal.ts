import { animate, stagger } from 'animejs';
import { animationsEnabled } from './motion.ts';

const CELL = 14;

/**
 * Pixel-reveal hover, via anime.js.
 *
 * The button rests as grey text in a matching outline; hovering scatters white
 * cells across it until they've filled it in. `stagger` with a grid and
 * `from: 'random'` is doing the real work — it maps each cell's index onto a
 * position in the grid and offsets its delay from a random origin.
 */
export function setupPixelReveal(button: HTMLButtonElement, layer: HTMLElement): void {
  let cells: HTMLElement[] = [];
  let grid: [number, number] = [1, 1];

  const build = (): void => {
    const { width, height } = button.getBoundingClientRect();
    if (!width || !height) return;

    const cols = Math.max(1, Math.ceil(width / CELL));
    const rows = Math.max(1, Math.ceil(height / CELL));
    if (cols === grid[0] && rows === grid[1] && cells.length) return;

    grid = [cols, rows];
    layer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    layer.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    layer.replaceChildren();

    cells = Array.from({ length: cols * rows }, () => {
      const cell = document.createElement('span');
      cell.className = 'ditherate__pixel';
      layer.append(cell);
      return cell;
    });
  };

  const play = (visible: boolean): void => {
    // Nothing to reveal until there's an image to dither: a locked button that
    // lights up on hover reads as clickable when it isn't.
    if (visible && button.disabled) return;

    build();
    if (!cells.length) return;
    // Drive the colour flip from the same trigger as the fill, rather than a
    // CSS :hover rule — they stay in lockstep, keyboard focus gets the same
    // treatment, and there's no sticky hover left behind on touch devices.
    button.classList.toggle('is-revealed', visible);

    // Motion off still gets the state change, just without the scatter.
    if (!animationsEnabled()) {
      for (const cell of cells) cell.style.opacity = visible ? '1' : '0';
      return;
    }

    animate(cells, {
      opacity: visible ? 1 : 0,
      duration: 90,
      ease: 'linear',
      delay: stagger(7, { grid, from: 'random' }),
    });
  };

  button.addEventListener('pointerenter', () => play(true));
  button.addEventListener('pointerleave', () => play(false));
  button.addEventListener('focus', () => play(true));
  button.addEventListener('blur', () => play(false));

  build();
  window.addEventListener('resize', build);
}
