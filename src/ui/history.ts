import type { MapId } from '../dither/thresholdMaps.ts';

const MAX_ENTRIES = 8;
const THUMB_SIZE = 96;

type Entry = { seed: number; map: MapId; flipped: boolean; thumbnail: string };

/**
 * The last few rolls, as clickable thumbnails.
 *
 * Only a seed and a small data URL are kept per entry — a roll is fully
 * reproducible from its seed, so there's no reason to hold on to pixels.
 */
export class History {
  private entries: Entry[] = [];
  private activeSeed: number | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly onSelect: (seed: number, map: MapId, flipped: boolean) => void,
  ) {}

  add(seed: number, map: MapId, flipped: boolean, image: ImageData): void {
    const match = (e: Entry) => e.seed === seed && e.map === map && e.flipped === flipped;
    if (!this.entries.some(match)) {
      this.entries.push({ seed, map, flipped, thumbnail: makeThumbnail(image) });
      if (this.entries.length > MAX_ENTRIES) this.entries.shift();
    }
    this.activeSeed = seed;
    this.render();
  }

  setActive(seed: number): void {
    this.activeSeed = seed;
    this.render();
  }

  clear(): void {
    this.entries = [];
    this.activeSeed = null;
    this.render();
  }

  private render(): void {
    this.container.replaceChildren();
    this.container.hidden = this.entries.length < 2;

    // Newest first — the roll you just made is the one you're most likely to want back.
    for (const entry of [...this.entries].reverse()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'history__item';
      button.classList.toggle('is-active', entry.seed === this.activeSeed);
      button.title = `Roll ${entry.seed}`;

      const img = document.createElement('img');
      img.src = entry.thumbnail;
      img.alt = `Roll ${entry.seed}`;
      button.append(img);

      button.addEventListener('click', () => this.onSelect(entry.seed, entry.map, entry.flipped));
      this.container.append(button);
    }
  }
}

function makeThumbnail(image: ImageData): string {
  const full = document.createElement('canvas');
  full.width = image.width;
  full.height = image.height;
  full.getContext('2d')!.putImageData(image, 0, 0);

  const scale = Math.min(1, THUMB_SIZE / Math.max(image.width, image.height));
  const thumb = document.createElement('canvas');
  thumb.width = Math.max(1, Math.round(image.width * scale));
  thumb.height = Math.max(1, Math.round(image.height * scale));
  const ctx = thumb.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(full, 0, 0, thumb.width, thumb.height);
  return thumb.toDataURL('image/png');
}
