import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Download,
  FilePlus2,
  FileText,
  ImagePlus,
  Loader2,
  Trash2,
} from 'lucide-react';
import { DropZone } from './DropZone';
import {
  createPdfFromContent,
  CreatorImageItem,
  PdfOrientation,
  PdfPageSize,
  TextDirectionMode,
} from '../utils/pdfCreator';
import { downloadBlob, formatBytes, sanitizeFilename } from '../utils/fileHelpers';

function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('تعذر قراءة أبعاد الصورة'));
    img.src = url;
  });
}

export const PdfCreatorTool: React.FC = () => {
  const [title, setTitle] = useState('');
  const [markdownText, setMarkdownText] = useState('');
  const [textDirection, setTextDirection] = useState<TextDirectionMode>('auto');
  const [images, setImages] = useState<CreatorImageItem[]>([]);
  const [pageSize, setPageSize] = useState<PdfPageSize>('a4');
  const [orientation, setOrientation] = useState<PdfOrientation>('auto');
  const [marginMm, setMarginMm] = useState<number>(10);
  const [outputName, setOutputName] = useState('Stark_Document');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      images.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  const handleImagesSelected = async (files: File[]) => {
    setError(null);
    const valid = files.filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(f.name));
    if (valid.length === 0) {
      setError('الرجاء اختيار صور بصيغة JPG أو PNG أو WEBP.');
      return;
    }

    const added: CreatorImageItem[] = [];
    for (const file of valid) {
      const previewUrl = URL.createObjectURL(file);
      try {
        const dims = await loadImageDimensions(previewUrl);
        added.push({
          id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          file,
          previewUrl,
          width: dims.width,
          height: dims.height,
        });
      } catch {
        URL.revokeObjectURL(previewUrl);
      }
    }

    if (added.length === 0) {
      setError('تعذر تحميل الصور المختارة.');
      return;
    }

    setImages((prev) => [...prev, ...added]);
  };

  const handleImportTextFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setMarkdownText((prev) => (prev.trim() ? `${prev}\n\n${text}` : text));
      if (!title.trim()) {
        const dot = file.name.lastIndexOf('.');
        setTitle(dot > 0 ? file.name.slice(0, dot) : file.name);
      }
    } catch {
      setError('تعذر قراءة الملف النصي.');
    } finally {
      if (textImportRef.current) textImportRef.current.value = '';
    }
  };

  const moveImage = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    setImages((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearAll = () => {
    images.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    setImages([]);
    setTitle('');
    setMarkdownText('');
    setError(null);
  };

  const handleBuildPdf = async () => {
    setError(null);
    setIsGenerating(true);
    setProgressMsg('جاري تجهيز المستند...');
    try {
      const blob = await createPdfFromContent({
        title,
        markdownText,
        textDirection,
        images,
        pageSize,
        orientation,
        marginMm,
        onProgress: (msg) => setProgressMsg(msg),
      });
      const safeName = sanitizeFilename(outputName, 'Stark_Document');
      downloadBlob(blob, `${safeName}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء إنشاء ملف PDF.');
    } finally {
      setIsGenerating(false);
      setProgressMsg(null);
    }
  };

  const hasContent = Boolean(title.trim() || markdownText.trim() || images.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100">إنشاء PDF من الصور والنصوص العربية</h2>
          <p className="text-sm text-slate-400">
            ادمج صوراً متعددة أو نصوصاً عربية ومحتوى Markdown في ملف PDF واحد جاهز للطباعة.
          </p>
        </div>

        {hasContent && (
          <button
            type="button"
            onClick={clearAll}
            disabled={isGenerating}
            className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            <span>مسح الكل</span>
          </button>
        )}
      </div>

      {/* Text / Markdown Section */}
      <div className="space-y-3 border-t border-white/[0.07] pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <FileText className="h-4 w-4 text-sky-400" />
            <span>النص العربي أو Markdown (اختياري)</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={textImportRef}
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              onChange={handleImportTextFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => textImportRef.current?.click()}
              className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
            >
              <FilePlus2 className="h-3.5 w-3.5 text-sky-400" />
              <span>استيراد ملف .txt / .md</span>
            </button>

            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
              {(
                [
                  { id: 'auto', label: 'تلقائي' },
                  { id: 'rtl', label: 'RTL' },
                  { id: 'ltr', label: 'LTR' },
                ] as const
              ).map((dir) => (
                <button
                  key={dir.id}
                  type="button"
                  onClick={() => setTextDirection(dir.id)}
                  className={`min-h-[28px] whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                    textDirection === dir.id
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {dir.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="عنوان المستند (اختياري)..."
          dir="auto"
          className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none"
        />

        <textarea
          value={markdownText}
          onChange={(e) => setMarkdownText(e.target.value)}
          rows={6}
          dir={textDirection === 'ltr' ? 'ltr' : 'rtl'}
          placeholder="اكتب النص العربي أو تنسيقات Markdown هنا (مثل # عنوان رئيسي، **نص عريض**، - قائمة نقطية)..."
          className="w-full rounded-xl border border-white/10 bg-slate-950/50 p-4 text-sm leading-7 text-slate-100 placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none"
        />
      </div>

      {/* Images Section */}
      <div className="space-y-4 border-t border-white/[0.07] pt-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <ImagePlus className="h-4 w-4 text-sky-400" />
            <span>الصور المرفقة ({images.length})</span>
          </div>
          <span className="text-xs text-slate-400">JPG · PNG · WEBP</span>
        </div>

        <DropZone
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          multiple
          title="أضف صورة أو عدة صور"
          subtitle="يمكنك إعادة ترتيب الصور قبل دمجها في ملف PDF"
          onFilesSelected={handleImagesSelected}
          disabled={isGenerating}
        />

        {images.length > 0 && (
          <div className="space-y-2">
            {images.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <img
                    src={item.previewUrl}
                    alt={item.file.name}
                    referrerPolicy="no-referrer"
                    className="h-12 w-12 shrink-0 rounded-lg border border-white/10 bg-slate-950 object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">{item.file.name}</p>
                    <p className="font-mono-nums text-xs text-slate-400">
                      {item.width}×{item.height} · {formatBytes(item.file.size)}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label="تحريك للأعلى"
                    onClick={() => moveImage(idx, -1)}
                    disabled={idx === 0 || isGenerating}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:bg-white/[0.08] disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="تحريك للأسفل"
                    onClick={() => moveImage(idx, 1)}
                    disabled={idx === images.length - 1 || isGenerating}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:bg-white/[0.08] disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="حذف الصورة"
                    onClick={() => removeImage(item.id)}
                    disabled={isGenerating}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PDF Output Settings */}
      <div className="grid grid-cols-1 gap-4 border-t border-white/[0.07] pt-5 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">حجم الصفحة</label>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value as PdfPageSize)}
            className="min-h-[40px] w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm text-slate-100 focus:border-sky-400/60 focus:outline-none"
          >
            <option value="a4">A4 قياسي</option>
            <option value="letter">Letter أمريكي</option>
            <option value="fit">مطابق لأبعاد الصورة</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">اتجاه الصور</label>
          <select
            value={orientation}
            onChange={(e) => setOrientation(e.target.value as PdfOrientation)}
            disabled={pageSize === 'fit'}
            className="min-h-[40px] w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm text-slate-100 focus:border-sky-400/60 focus:outline-none disabled:opacity-40"
          >
            <option value="auto">تلقائي حسب الصورة</option>
            <option value="portrait">عمودي (Portrait)</option>
            <option value="landscape">أفقي (Landscape)</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">هوامش الصور</label>
          <select
            value={marginMm}
            onChange={(e) => setMarginMm(Number(e.target.value))}
            disabled={pageSize === 'fit'}
            className="min-h-[40px] w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm text-slate-100 focus:border-sky-400/60 focus:outline-none disabled:opacity-40"
          >
            <option value={0}>بدون هوامش (0 mm)</option>
            <option value={10}>هوامش متوسطة (10 mm)</option>
            <option value={18}>هوامش واسعة (18 mm)</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Filename & Generate Action */}
      <div className="flex flex-col gap-3 border-t border-white/[0.07] pt-5 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-medium text-slate-400">اسم ملف PDF الناتج</label>
          <input
            type="text"
            value={outputName}
            onChange={(e) => setOutputName(e.target.value)}
            dir="ltr"
            className="font-mono-nums min-h-[44px] w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 text-sm text-slate-100 focus:border-sky-400/60 focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={handleBuildPdf}
          disabled={!hasContent || isGenerating}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-sky-500 px-6 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{progressMsg || 'جاري الإنشاء...'}</span>
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              <span>إنشاء وتحميل PDF</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
