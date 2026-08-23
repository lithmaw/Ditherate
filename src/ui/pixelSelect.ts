import { animate, stagger, utils } from 'animejs';

const CELL = 12;

export type PixelSelectOption = { value: string; label: string };

type Options = {
  root: HTMLElement;
  trigger: HTMLButtonElement;
  valueEl: HTMLElement;
  panel: HTMLElement;
  list: HTMLElement;
  pixels: HTMLElement;
  options: PixelSelectOption[];
  onChange: (value: string) => void;
};

/**
 * A dropdown whose menu is revealed by dissolving a grid of pixels away.
 *
 * A native <select> can't be animated — the option list is drawn by the OS, not
 * the page — so this is a listbox built from real elements with the platform's
 * keyboard behaviour reimplemented on top.
 */
export class PixelSelect {
  private open = false;
  private cells: HTMLElement[] = [];
  private grid: [number, number] = [1, 1];
  private items: HTMLElement[] = [];
  private active = 0;
  private value: string;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private readonly o: Options) {
    this.value = o.options[0]?.value ?? '';
    this.buildItems();
    this.select(this.value, false);

    o.trigger.addEventListener('click', () => this.toggle());
    o.trigger.addEventListener('keydown', (event) => this.onTriggerKey(event));
    o.panel.addEventListener('keydown', (event) => this.onPanelKey(event));

    // Anything outside the control closes it — the usual dropdown contract.
    document.addEventListener('pointerdown', (event) => {
      if (this.open && !o.root.contains(event.target as Node)) this.close();
    });
  }

  private buildItems(): void {
    this.o.list.replaceChildren();
    this.items = this.o.options.map((option, index) => {
      const item = document.createElement('li');
      item.className = 'pselect__option';
      item.textContent = option.label;
      item.setAttribute('role', 'option');
      item.dataset.value = option.value;
      item.addEventListener('click', () => {
        this.select(option.value, true);
        this.close();
        this.o.trigger.focus();
      });
      item.addEventListener('pointerenter', () => this.setActive(index));
      this.o.list.append(item);
      return item;
    });
  }

  /** One cell per ~12px of panel, rebuilt whenever the panel's size changes. */
  private buildCells(): void {
    const { width, height } = this.o.panel.getBoundingClientRect();
    if (!width || !height) return;

    const cols = Math.max(1, Math.ceil(width / CELL));
    const rows = Math.max(1, Math.ceil(height / CELL));
    if (cols === this.grid[0] && rows === this.grid[1] && this.cells.length) return;

    this.grid = [cols, rows];
    this.o.pixels.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    this.o.pixels.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    this.o.pixels.replaceChildren();
    this.cells = Array.from({ length: cols * rows }, () => {
      const cell = document.createElement('span');
      cell.className = 'pselect__pixel';
      this.o.pixels.append(cell);
      return cell;
    });
  }

  private setOpacity(value: number): void {
    for (const cell of this.cells) cell.style.opacity = String(value);
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    this.o.panel.hidden = false;
    this.o.trigger.setAttribute('aria-expanded', 'true');
    this.o.root.classList.add('is-open');
    this.setActive(Math.max(0, this.items.findIndex((i) => i.dataset.value === this.value)));

    this.buildCells();
    utils.remove(this.cells);

    if (this.reducedMotion.matches) {
      this.setOpacity(0);
      return;
    }

    // Start covered, then dissolve the cover away to uncover the options.
    this.setOpacity(1);
    animate(this.cells, {
      opacity: 0,
      duration: 140,
      ease: 'linear',
      delay: stagger(5, { grid: this.grid, from: 'random' }),
    });
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.o.trigger.setAttribute('aria-expanded', 'false');
    this.o.root.classList.remove('is-open');

    const hide = () => {
      // Only hide if nothing reopened it while the cover was animating back.
      if (!this.open) this.o.panel.hidden = true;
    };

    utils.remove(this.cells);
    if (this.reducedMotion.matches || !this.cells.length) {
      hide();
      return;
    }

    // Backstop: an animation that never completes — a tab backgrounded
    // mid-close, say — would otherwise leave the menu stuck open.
    const fallback = window.setTimeout(hide, 500);
    animate(this.cells, {
      opacity: 1,
      duration: 110,
      ease: 'linear',
      delay: stagger(4, { grid: this.grid, from: 'random' }),
      onComplete: () => {
        window.clearTimeout(fallback);
        hide();
      },
    });
  }

  private setActive(index: number): void {
    this.active = Math.max(0, Math.min(this.items.length - 1, index));
    this.items.forEach((item, i) => item.classList.toggle('is-active', i === this.active));
    this.items[this.active]?.scrollIntoView({ block: 'nearest' });
  }

  private select(value: string, notify: boolean): void {
    this.value = value;
    const option = this.o.options.find((o) => o.value === value);
    this.o.valueEl.textContent = option?.label ?? '';
    this.items.forEach((item) =>
      item.setAttribute('aria-selected', String(item.dataset.value === value)),
    );
    if (notify) this.o.onChange(value);
  }

  private onTriggerKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.show();
      this.o.panel.focus();
    }
  }

  private onPanelKey(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.setActive(this.active + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.setActive(this.active - 1);
        break;
      case 'Home':
        event.preventDefault();
        this.setActive(0);
        break;
      case 'End':
        event.preventDefault();
        this.setActive(this.items.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.select(this.items[this.active]?.dataset.value ?? '', true);
        this.close();
        this.o.trigger.focus();
        break;
      case 'Escape':
        event.preventDefault();
        this.close();
        this.o.trigger.focus();
        break;
    }
  }
}
