import JSZip from 'jszip';
import { stripExtension } from './fileHelpers';

export type OutputImageFormat = 'webp' | 'jpeg' | 'png';

export interface OptimizedImageItem {
  id: string;
  originalFile: File;
  originalName: string;
  originalSize: number;
  originalWidth: number;
  originalHeight: number;
  originalPreviewUrl: string;
  outputBlob: Blob | null;
  outputUrl: string | null;
  outputSize: number;
  outputWidth: number;
  outputHeight: number;
  outputName: string;
}

export function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('تعذر تحميل الصورة للمعالجة.'));
    img.src = url;
  });
}

export async function convertImageViaCanvas(
  sourceUrl: string,
  originalName: string,
  options: {
    format: OutputImageFormat;
    quality: number; // 0.1 to 1.0
    maxWidth: number | null; // null = original width
  }
): Promise<{
  blob: Blob;
  url: string;
  width: number;
  height: number;
  outputName: string;
}> {
  const img = await loadImageElement(sourceUrl);
  let targetW = img.naturalWidth || img.width;
  let targetH = img.naturalHeight || img.height;

  if (options.maxWidth && targetW > options.maxWidth) {
    const ratio = options.maxWidth / targetW;
    targetW = options.maxWidth;
    targetH = Math.max(1, Math.round(targetH * ratio));
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('تعذر تهيئة Canvas لتحويل الصورة.');
  }

  // Fill white matte for JPEG since JPEG does not support alpha transparency
  if (options.format === 'jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
  } else {
    ctx.clearRect(0, 0, targetW, targetH);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const mimeType =
    options.format === 'png'
      ? 'image/png'
      : options.format === 'jpeg'
        ? 'image/jpeg'
        : 'image/webp';

  const qualityArg = options.format === 'png' ? undefined : options.quality;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('فشل المتصفح في تصدير الصورة بالصيغة المختارة.'));
      },
      mimeType,
      qualityArg
    );
  });

  const ext = options.format === 'jpeg' ? 'jpg' : options.format;
  const outputName = `${stripExtension(originalName)}.${ext}`;
  const url = URL.createObjectURL(blob);

  return {
    blob,
    url,
    width: targetW,
    height: targetH,
    outputName,
  };
}

export async function buildOptimizedImagesZip(items: OptimizedImageItem[]): Promise<Blob> {
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const item of items) {
    if (!item.outputBlob) continue;
    let finalName = item.outputName;
    let counter = 1;
    while (usedNames.has(finalName)) {
      const dot = item.outputName.lastIndexOf('.');
      const base = dot > 0 ? item.outputName.slice(0, dot) : item.outputName;
      const ext = dot > 0 ? item.outputName.slice(dot) : '';
      finalName = `${base}_${counter}${ext}`;
      counter++;
    }
    usedNames.add(finalName);
    zip.file(finalName, item.outputBlob);
  }

  return zip.generateAsync({ type: 'blob' });
}
