/**
 * Chrome drops the page's custom cursor after a native file dialog closes and
 * doesn't re-evaluate it until the pointer moves — so dismissing the picker
 * without choosing a file leaves the OS arrow until you move the mouse or
 * leave and re-enter the tab.
 *
 * Flipping every element to a different cursor for one frame forces the
 * re-evaluation. `none` is used for that frame because it can't be mistaken
 * for a real state if the timing ever slips.
 */
export function refreshCursor(): void {
  const root = document.documentElement;
  root.classList.add('cursor-reset');
  // Read a layout property so the class change is flushed before it's undone.
  void root.offsetWidth;
  requestAnimationFrame(() => root.classList.remove('cursor-reset'));
  // rAF doesn't run in a background tab; this guarantees the class is dropped.
  setTimeout(() => root.classList.remove('cursor-reset'), 120);
}

/** Re-assert the cursor after anything that can steal it. */
export function setupCursorFix(fileInput: HTMLInputElement): void {
  // Fires when the picker is dismissed without a selection.
  fileInput.addEventListener('cancel', refreshCursor);
  fileInput.addEventListener('change', refreshCursor);
  window.addEventListener('focus', refreshCursor);
}
