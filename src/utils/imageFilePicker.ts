'use client';

/** Open the device camera or gallery picker — input is mounted in DOM for mobile Safari reliability. */
export function openImageFilePicker(options: {
  capture?: boolean;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  if (options.capture) {
    input.capture = 'environment';
  }
  input.multiple = options.multiple ?? false;
  input.style.display = 'none';
  document.body.appendChild(input);

  let settled = false;
  const cleanup = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(cancelTimer);
    input.remove();
  };

  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    cleanup();
    if (files.length > 0) {
      options.onFiles(files);
    }
  });

  const cancelTimer = window.setTimeout(cleanup, 120_000);
  input.click();
}