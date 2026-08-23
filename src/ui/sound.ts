import { click003Sound } from '../sounds/click-003.ts';
import { drop004Sound } from '../sounds/drop-004.ts';
import { playSound } from '../sounds/soundEngine.ts';

const STORAGE_KEY = 'ditherate:sound';
/** These are UI ticks, not events — they should sit under the interaction. */
const VOLUME = 0.35;

const EFFECTS = {
  click: click003Sound,
  drop: drop004Sound,
} as const;

export type Effect = keyof typeof EFFECTS;

type Listener = (enabled: boolean) => void;
const listeners = new Set<Listener>();

let enabled = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    // Private mode or blocked storage — default to on.
    return true;
  }
})();

export const soundEnabled = (): boolean => enabled;

export function setSoundEnabled(value: boolean): void {
  if (value === enabled) return;
  enabled = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
  } catch {
    // Not remembering the choice shouldn't stop them making it.
  }
  for (const listener of listeners) listener(enabled);
}

export function onSoundChange(listener: Listener): void {
  listeners.add(listener);
}

/**
 * Fire a UI sound. Never awaited and never allowed to throw: the AudioContext
 * can refuse to start (autoplay policy, no output device), and a failed tick
 * must not take an interaction down with it.
 */
export function play(effect: Effect): void {
  if (!enabled) return;
  void playSound(EFFECTS[effect].dataUri, { volume: VOLUME }).catch(() => {});
}
