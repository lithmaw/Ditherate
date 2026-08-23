import { animate, stagger, utils } from 'animejs';
import { animationsEnabled } from './motion.ts';

/** Target cell size, relaxed upward so a big image doesn't spawn thousands of nodes. */
const CELL = 26;
const MAX_CELLS = 520;

/**
 * Uncovers a freshly generated image by dissolving a grid of pixels off it.
 *
 * The cover is painted in the panel colour, so the image appears to assemble
 * out of the background rather than fading in.
 */
export class ImageReveal {
  private cells: HTMLElement[] = [];
  private grid: [number, number] = [1, 1];

  constructor(
    private readonly target: HTMLElement,
    private readonly layer: HTMLElement,
  ) {}

  private build(): boolean {
    const { width, height } = this.target.getBoundingClientRect();
    if (!width || !height) return false;

    let cell = CELL;
    let cols = Math.max(1, Math.round(width / cell));
    let rows = Math.max(1, Math.round(height / cell));
    // Coarsen until the grid is a sane number of elements to animate.
    while (cols * rows > MAX_CELLS) {
      cell *= 1.25;
      cols = Math.max(1, Math.round(width / cell));
      rows = Math.max(1, Math.round(height / cell));
    }

    if (cols === this.grid[0] && rows === this.grid[1] && this.cells.length) return true;

    this.grid = [cols, rows];
    this.layer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    this.layer.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    this.layer.replaceChildren();
    this.cells = Array.from({ length: cols * rows }, () => {
      const node = document.createElement('span');
      node.className = 'dropbox__pixel';
      this.layer.append(node);
      return node;
    });
    return true;
  }

  play(): void {
    if (!animationsEnabled()) {
      this.hide();
      return;
    }
    if (!this.build()) return;

    this.layer.hidden = false;
    utils.remove(this.cells);
    for (const cell of this.cells) cell.style.opacity = '1';

    animate(this.cells, {
      opacity: 0,
      duration: 160,
      ease: 'linear',
      delay: stagger(3, { grid: this.grid, from: 'random' }),
      onComplete: () => {
        this.layer.hidden = true;
      },
    });
  }

  /** Drop the cover immediately — used when motion is switched off. */
  hide(): void {
    utils.remove(this.cells);
    for (const cell of this.cells) cell.style.opacity = '0';
    this.layer.hidden = true;
  }
}
