type Options = {
  box: HTMLElement;
  fileInput: HTMLInputElement;
  onImage: (bitmap: ImageBitmap, name: string) => void;
  onError: (message: string) => void;
};

const isImage = (file: File): boolean => file.type.startsWith('image/');

async function decode(file: File, options: Options): Promise<void> {
  if (!isImage(file)) {
    options.onError('That file is not an image — try a PNG, JPG, GIF or WebP');
    return;
  }
  try {
    // `from-image` honours EXIF orientation; without it, phone photos land sideways.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    options.onImage(bitmap, file.name);
  } catch {
    options.onError("Couldn't read that image — it may be corrupt or an unsupported format");
  }
}

/** Wires up all three ways in: click to browse, drag and drop, and paste. */
export function setupDropzone(options: Options): void {
  const { box, fileInput } = options;

  // Clicking the box always opens the picker — before an image is loaded to
  // choose one, and afterwards to swap it out.
  box.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) void decode(file, options);
    // Reset so picking the same file twice still fires a change event.
    fileInput.value = '';
  });

  const setDragging = (on: boolean) => box.classList.toggle('is-dragging', on);

  box.addEventListener('dragover', (event) => {
    event.preventDefault();
    setDragging(true);
  });
  box.addEventListener('dragleave', () => setDragging(false));
  box.addEventListener('drop', (event) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void decode(file, options);
  });

  // The whole document accepts a paste — hunting for a focused drop target first
  // would be a pointless extra step.
  document.addEventListener('paste', (event) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file) {
        event.preventDefault();
        void decode(file, options);
        return;
      }
    }
  });
}
