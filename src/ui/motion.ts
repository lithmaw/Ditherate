const STORAGE_KEY = 'ditherate:animations';

type Listener = (enabled: boolean) => void;

const listeners = new Set<Listener>();

const prefersReduced = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Whether decorative motion is allowed anywhere in the app.
 *
 * Every animated piece reads this rather than checking the media query itself,
 * so the footer switch and the OS setting can't disagree. The stored choice
 * wins once made; otherwise the OS preference is the default.
 */
let enabled = (() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === 'on';
  } catch {
    // Private mode or blocked storage — fall through to the OS preference.
  }
  return !prefersReduced();
})();

export const animationsEnabled = (): boolean => enabled;

export function setAnimationsEnabled(value: boolean): void {
  if (value === enabled) return;
  enabled = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
  } catch {
    // Not being able to remember the choice shouldn't break making it.
  }
  for (const listener of listeners) listener(enabled);
}

export function onAnimationsChange(listener: Listener): void {
  listeners.add(listener);
}
