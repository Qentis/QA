export interface ProcessedImage {
  dataUrl: string;
  base64: string;
  mimeType: string;
  fileName: string;
  width: number;
  height: number;
}

const MAX_DIMENSION = 1600;

export function processImageFile(file: File): Promise<ProcessedImage> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Выберите файл изображения (PNG, JPEG, WebP).'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл изображения.'));
    reader.onload = () => {
      const originalDataUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('Повреждённое или неподдерживаемое изображение.'));
      img.onload = () => {
        const { width, height } = img;
        const needsResize = width > MAX_DIMENSION || height > MAX_DIMENSION;

        if (!needsResize && (file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/webp')) {
          const base64 = originalDataUrl.split(',')[1] || '';
          resolve({
            dataUrl: originalDataUrl,
            base64,
            mimeType: file.type,
            fileName: file.name || 'screenshot.png',
            width,
            height,
          });
          return;
        }

        const scale = needsResize ? MAX_DIMENSION / Math.max(width, height) : 1;
        const targetW = Math.max(1, Math.round(width * scale));
        const targetH = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const base64 = originalDataUrl.split(',')[1] || '';
          resolve({
            dataUrl: originalDataUrl,
            base64,
            mimeType: file.type || 'image/png',
            fileName: file.name || 'screenshot.png',
            width,
            height,
          });
          return;
        }

        ctx.drawImage(img, 0, 0, targetW, targetH);
        const outputMime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
        const quality = outputMime === 'image/jpeg' ? 0.88 : undefined;
        const resizedDataUrl = canvas.toDataURL(outputMime, quality);
        const base64 = resizedDataUrl.split(',')[1] || '';

        resolve({
          dataUrl: resizedDataUrl,
          base64,
          mimeType: outputMime,
          fileName: file.name || (outputMime === 'image/jpeg' ? 'screenshot.jpg' : 'screenshot.png'),
          width: targetW,
          height: targetH,
        });
      };
      img.src = originalDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function generateUuidV4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
