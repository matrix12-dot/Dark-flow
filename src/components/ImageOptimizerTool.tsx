import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Download,
  Loader2,
  Trash2,
} from 'lucide-react';
import { DropZone } from './DropZone';
import {
  buildOptimizedImagesZip,
  convertImageViaCanvas,
  loadImageElement,
  OptimizedImageItem,
  OutputImageFormat,
} from '../utils/imageOptimizer';
import { downloadBlob, formatBytes } from '../utils/fileHelpers';

export const ImageOptimizerTool: React.FC = () => {
  const [items, setItems] = useState<OptimizedImageItem[]>([]);
  const [format, setFormat] = useState<OutputImageFormat>('webp');
  const [quality, setQuality] = useState<number>(82);
  const [maxWidth, setMaxWidth] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemsRef = useRef<OptimizedImageItem[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => {
        URL.revokeObjectURL(item.originalPreviewUrl);
        if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
      });
    };
  }, []);

  const reprocessAll = async (
    targetItems: OptimizedImageItem[],
    fmt: OutputImageFormat,
    q: number,
    widthLimit: number | null
  ) => {
    if (targetItems.length === 0) return;
    setIsProcessing(true);
    setError(null);

    try {
      const updated: OptimizedImageItem[] = [];
      for (const item of targetItems) {
        const res = await convertImageViaCanvas(item.originalPreviewUrl, item.originalName, {
          format: fmt,
          quality: q / 100,
          maxWidth: widthLimit,
        });
        if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
        updated.push({
          ...item,
          outputBlob: res.blob,
          outputUrl: res.url,
          outputSize: res.blob.size,
          outputWidth: res.width,
          outputHeight: res.height,
          outputName: res.outputName,
        });
      }
      setItems(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر ضغط إحدى الصور.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Debounced recompression when quality, format, or resize changes
  useEffect(() => {
    if (itemsRef.current.length === 0) return;
    const timer = setTimeout(() => {
      void reprocessAll(itemsRef.current, format, quality, maxWidth);
    }, 140);
    return () => clearTimeout(timer);
  }, [format, quality, maxWidth]);

  const handleFilesSelected = async (files: File[]) => {
    setError(null);
    const valid = files.filter(
      (f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name)
    );
    if (valid.length === 0) {
      setError('الرجاء اختيار صور صالحة (PNG, JPG, WEBP).');
      return;
    }

    setIsProcessing(true);
    try {
      const newItems: OptimizedImageItem[] = [];
      for (const file of valid) {
        const originalPreviewUrl = URL.createObjectURL(file);
        try {
          const img = await loadImageElement(originalPreviewUrl);
          const converted = await convertImageViaCanvas(originalPreviewUrl, file.name, {
            format,
            quality: quality / 100,
            maxWidth,
          });
          newItems.push({
            id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            originalFile: file,
            originalName: file.name,
            originalSize: file.size,
            originalWidth: img.naturalWidth || img.width,
            originalHeight: img.naturalHeight || img.height,
            originalPreviewUrl,
            outputBlob: converted.blob,
            outputUrl: converted.url,
            outputSize: converted.blob.size,
            outputWidth: converted.width,
            outputHeight: converted.height,
            outputName: converted.outputName,
          });
        } catch {
          URL.revokeObjectURL(originalPreviewUrl);
        }
      }

      if (newItems.length === 0) {
        setError('تعذر تحميل الصور المختارة.');
      } else {
        setItems((prev) => [...prev, ...newItems]);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const found = prev.find((i) => i.id === id);
      if (found) {
        URL.revokeObjectURL(found.originalPreviewUrl);
        if (found.outputUrl) URL.revokeObjectURL(found.outputUrl);
      }
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearAll = () => {
    items.forEach((item) => {
      URL.revokeObjectURL(item.originalPreviewUrl);
      if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
    });
    setItems([]);
    setError(null);
  };

  const handleDownloadAllZip = async () => {
    if (items.length === 0) return;
    setIsExportingZip(true);
    try {
      const blob = await buildOptimizedImagesZip(items);
      downloadBlob(blob, `stark_optimized_${format}.zip`);
    } catch {
      setError('تعذر ضغط الصور في ملف ZIP.');
    } finally {
      setIsExportingZip(false);
    }
  };

  const totalOriginal = items.reduce((sum, i) => sum + i.originalSize, 0);
  const totalOutput = items.reduce((sum, i) => sum + i.outputSize, 0);
  const totalSavedPct =
    totalOriginal > 0 ? Math.round(((totalOriginal - totalOutput) / totalOriginal) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100">ضغط وتحويل صيغ الصور</h2>
          <p className="text-sm text-slate-400">
            تحويل فوري عبر HTML5 Canvas بين PNG و JPG و WEBP مع معاينة حية لفرق الحجم.
          </p>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.08]"
          >
            <Trash2 className="h-4 w-4" />
            <span>مسح الصور</span>
          </button>
        )}
      </div>

      {/* Format, Quality & Resize Controls */}
      <div className="grid grid-cols-1 gap-5 border-y border-white/[0.07] py-5 sm:grid-cols-3">
        <div>
          <span className="mb-2 block text-xs font-medium text-slate-400">الصيغة المطلوبة</span>
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {(
              [
                { id: 'webp', label: 'WEBP' },
                { id: 'jpeg', label: 'JPG' },
                { id: 'png', label: 'PNG' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFormat(opt.id)}
                className={`min-h-[36px] whitespace-nowrap rounded-lg text-xs font-bold transition-colors ${
                  format === opt.id
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-300 hover:bg-white/[0.05]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">جودة الضغط</span>
            <span className="font-mono-nums text-xs font-bold text-sky-400">
              {format === 'png' ? 'بدون فقدان' : `${quality}%`}
            </span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            step={1}
            value={quality}
            disabled={format === 'png'}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="h-2 w-full cursor-pointer accent-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium text-slate-400">الحد الأقصى للعرض</label>
          <select
            value={maxWidth ?? 'original'}
            onChange={(e) =>
              setMaxWidth(e.target.value === 'original' ? null : Number(e.target.value))
            }
            className="min-h-[40px] w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm text-slate-100 focus:border-sky-400/60 focus:outline-none"
          >
            <option value="original">الحجم الأصلي</option>
            <option value="1920">1920 px (Full HD)</option>
            <option value="1280">1280 px (HD)</option>
            <option value="800">800 px (ويب سريع)</option>
          </select>
        </div>
      </div>

      <DropZone
        accept="image/png,image/jpeg,image/webp,image/bmp,.png,.jpg,.jpeg,.webp"
        multiple
        title="اسحب صورة أو عدة صور هنا لتحويلها وضغطها"
        subtitle="تدعم المعالجة الفورية ومقارنة الحجم قبل التحميل"
        onFilesSelected={handleFilesSelected}
      />

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-4">
          {/* Live Total Comparison Summary */}
          <div className="flex flex-col justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <div>
                <span className="text-slate-400">الحجم الأصلي: </span>
                <span className="font-mono-nums font-semibold text-slate-200">
                  {formatBytes(totalOriginal)}
                </span>
              </div>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <div>
                <span className="text-slate-400">الحجم الجديد: </span>
                <span className="font-mono-nums font-bold text-sky-400">
                  {formatBytes(totalOutput)}
                </span>
              </div>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <div>
                <span className="text-slate-400">التوفير: </span>
                <span
                  className={`font-mono-nums font-bold ${
                    totalSavedPct >= 0 ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {totalSavedPct >= 0 ? `-${totalSavedPct}%` : `+${Math.abs(totalSavedPct)}%`}
                </span>
              </div>
            </div>

            {items.length > 1 && (
              <button
                type="button"
                onClick={handleDownloadAllZip}
                disabled={isProcessing || isExportingZip}
                className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-sky-500 px-4 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50"
              >
                {isExportingZip || isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                <span>تحميل الكل ({items.length} ZIP)</span>
              </button>
            )}
          </div>

          {/* Per-Image Live Comparison Cards */}
          <div className="space-y-3">
            {items.map((item) => {
              const diffPct =
                item.originalSize > 0
                  ? Math.round(((item.originalSize - item.outputSize) / item.originalSize) * 100)
                  : 0;
              return (
                <div
                  key={item.id}
                  className="flex flex-col justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.025] p-3.5 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <img
                      src={item.outputUrl || item.originalPreviewUrl}
                      alt={item.outputName}
                      referrerPolicy="no-referrer"
                      className="h-14 w-14 shrink-0 rounded-lg border border-white/10 bg-slate-950 object-cover"
                    />
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-semibold text-slate-100">
                        {item.outputName}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="font-mono-nums">
                          {item.outputWidth}×{item.outputHeight}
                        </span>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span className="font-mono-nums line-through decoration-slate-600">
                          {formatBytes(item.originalSize)}
                        </span>
                        <span aria-hidden="true" className="text-slate-500">←</span>
                        <span className="font-mono-nums font-bold text-sky-300">
                          {formatBytes(item.outputSize)}
                        </span>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span
                          className={`font-mono-nums font-semibold ${
                            diffPct >= 0 ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {diffPct >= 0 ? `توفير ${diffPct}%` : `زيادة ${Math.abs(diffPct)}%`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={!item.outputBlob || isProcessing}
                      onClick={() =>
                        item.outputBlob && downloadBlob(item.outputBlob, item.outputName)
                      }
                      className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-sky-500 px-4 text-xs font-bold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50 sm:flex-none"
                    >
                      <Download className="h-4 w-4" />
                      <span>تحميل</span>
                    </button>
                    <button
                      type="button"
                      aria-label="حذف الصورة"
                      onClick={() => removeItem(item.id)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition-colors hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
