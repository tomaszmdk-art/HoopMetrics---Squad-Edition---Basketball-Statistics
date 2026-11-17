/**
 * Utility functions for resizing and compressing player / club photos
 * to compact base64 JPEG Data URLs.
 * Keeps localStorage and IndexedDB small and fast while ensuring crisp rendering.
 */

export function compressFileToDataUrl(
  file: File | Blob,
  maxWidth = 360,
  maxHeight = 360,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (!src) {
        reject(new Error('Nie udało się odczytać pliku'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(src);
            return;
          }

          // Background white in case of transparent png converted to jpeg
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed);
        } catch {
          resolve(src);
        }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function processPastedImage(
  clipboardEvent: React.ClipboardEvent | ClipboardEvent
): Promise<string | null> {
  const items = clipboardEvent.clipboardData?.items;
  if (!items) return null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        return await compressFileToDataUrl(file);
      }
    }
  }

  // Check if text is an image URL
  const text = clipboardEvent.clipboardData?.getData('text') || '';
  const trimmed = text.trim();
  if (
    trimmed.startsWith('data:image/') ||
    /^https?:\/\/.*\.(png|jpe?g|webp|gif|svg)($|\?)/i.test(trimmed) ||
    (trimmed.startsWith('http') && (trimmed.includes('images') || trimmed.includes('photo') || trimmed.includes('avatar')))
  ) {
    return trimmed;
  }

  return null;
}
