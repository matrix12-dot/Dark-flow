import React, { useEffect, useState } from 'react';
import {
  Archive,
  Check,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import { DropZone } from './DropZone';
import {
  buildDocxFromExtractedPdf,
  buildPagesZipBlob,
  extractPdfPagesAndText,
  PdfExtractionResult,
  PdfImageFormat,
} from '../utils/pdfProcessor';
import {
  copyTextToClipboard,
  downloadBlob,
  formatBytes,
  stripExtension,
} from '../utils/fileHelpers';

export const PdfExtractorTool: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [format, setFormat] = useState<PdfImageFormat>('png');
  const [scale, setScale] = useState<number>(2);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [result, setResult] = useState<PdfExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState<'pages' | 'text'>('pages');

  useEffect(() => {
    return () => {
      result?.pages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, [result]);

  const runExtraction = async (file: File, imgFormat: PdfImageFormat, renderScale: number) => {
    setError(null);
    setIsProcessing(true);
    setProgress(null);

    try {
      const extracted = await extractPdfPagesAndText(file, {
        format: imgFormat,
        scale: renderScale,
        onProgress: (current, total) => setProgress({ current, total }),
      });
      setResult((prev) => {
        prev?.pages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
        return extracted;
      });
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'تعذر قراءة ملف PDF. تأكد من سلامة الملف وأنه غير محمي بكلمة مرور.';
      setError(message);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const handleFilesSelected = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setError('الرجاء اختيار ملف بصيغة PDF صالحة.');
      return;
    }
    setSelectedFile(file);
    void runExtraction(file, format, scale);
  };

  const handleDownloadDocx = async () => {
    if (!result) return;
    setIsExportingDocx(true);
    setError(null);
    try {
      const blob = await buildDocxFromExtractedPdf(result);
      downloadBlob(blob, `${stripExtension(result.fileName)}.docx`);
    } catch {
      setError('حدث خطأ أثناء إنشاء ملف Word (.docx).');
    } finally {
      setIsExportingDocx(false);
    }
  };

  const handleDownloadAllZip = async () => {
    if (!result) return;
    setIsExportingZip(true);
    setError(null);
    try {
      const zipBlob = await buildPagesZipBlob(result.pages, format, result.fileName);
      downloadBlob(zipBlob, `${stripExtension(result.fileName)}_pages.zip`);
    } catch {
      setError('حدث خطأ أثناء ضغط الصور في ملف ZIP.');
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleDownloadTxt = () => {
    if (!result) return;
    const blob = new Blob([result.fullText], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `${stripExtension(result.fileName)}.txt`);
  };

  const handleCopyText = async () => {
    if (!result) return;
    const ok = await copyTextToClipboard(result.fullText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleReset = () => {
    result?.pages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setResult(null);
    setSelectedFile(null);
    setError(null);
    setProgress(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100">استخراج PDF إلى Word وصور</h2>
          <p className="text-sm text-slate-400">
            حوّل صفحات PDF إلى صور عالية الدقة واستخرج النصوص مباشرة إلى ملف Word (.docx).
          </p>
        </div>

        {selectedFile && (
          <button
            type="button"
            onClick={handleReset}
            disabled={isProcessing}
            className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            <span>ملف جديد</span>
          </button>
        )}
      </div>

      {/* Extraction Settings */}
      <div className="grid grid-cols-1 gap-4 border-y border-white/[0.07] py-4 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-300">صيغة الصور:</span>
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {(['png', 'jpg'] as PdfImageFormat[]).map((fmt) => (
              <button
                key={fmt}
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  setFormat(fmt);
                  if (selectedFile) void runExtraction(selectedFile, fmt, scale);
                }}
                className={`min-h-[34px] whitespace-nowrap rounded-lg px-3.5 text-xs font-semibold uppercase transition-colors ${
                  format === fmt
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-300 hover:bg-white/[0.05]'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-300">دقة التصدير:</span>
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {[
              { value: 1.5, label: '1.5x' },
              { value: 2, label: '2x' },
              { value: 3, label: '3x' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  setScale(opt.value);
                  if (selectedFile) void runExtraction(selectedFile, format, opt.value);
                }}
                className={`font-mono-nums min-h-[34px] whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors ${
                  scale === opt.value
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-300 hover:bg-white/[0.05]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!selectedFile && !isProcessing && (
        <DropZone
          accept=".pdf,application/pdf"
          title="اسحب ملف PDF وأفلته هنا، أو انقر للاختيار"
          subtitle="تتم معالجة جميع الصفحات والنصوص محلياً داخل المتصفح"
          onFilesSelected={handleFilesSelected}
        />
      )}

      {isProcessing && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
          <p className="text-sm font-semibold text-slate-100">
            {progress
              ? `جاري معالجة الصفحة ${progress.current} من ${progress.total}...`
              : 'جاري قراءة بنية ملف PDF...'}
          </p>
          {progress && (
            <div className="mt-1 h-1.5 w-64 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-sky-400 transition-all duration-150"
                style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {result && !isProcessing && (
        <div className="space-y-6">
          {/* File Metadata & Primary Export Actions */}
          <div className="flex flex-col gap-4 border-b border-white/[0.07] pb-5">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
              <span className="font-semibold text-slate-100">{result.fileName}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono-nums text-slate-400">
                {selectedFile ? formatBytes(selectedFile.size) : ''}
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono-nums text-slate-400">{result.pageCount} صفحة</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={handleDownloadDocx}
                disabled={isExportingDocx}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-60"
              >
                {isExportingDocx ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                <span>تحميل ملف Word (.docx)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadAllZip}
                disabled={isExportingZip}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/[0.1] disabled:opacity-60"
              >
                {isExportingZip ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="h-4 w-4 text-sky-400" />
                )}
                <span>تحميل الصور ({format.toUpperCase()} ZIP)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadTxt}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/[0.1]"
              >
                <Download className="h-4 w-4 text-sky-400" />
                <span>تحميل النص (.txt)</span>
              </button>
            </div>
          </div>

          {/* Sub-view Switcher: Pages Grid vs Extracted Text */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
              <button
                type="button"
                onClick={() => setActiveView('pages')}
                className={`inline-flex min-h-[36px] items-center gap-2 whitespace-nowrap rounded-lg px-4 text-xs font-semibold transition-colors ${
                  activeView === 'pages'
                    ? 'bg-white/15 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                <span>معاينة الصفحات ({result.pageCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveView('text')}
                className={`inline-flex min-h-[36px] items-center gap-2 whitespace-nowrap rounded-lg px-4 text-xs font-semibold transition-colors ${
                  activeView === 'text'
                    ? 'bg-white/15 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>النص المستخرج</span>
              </button>
            </div>

            {activeView === 'text' && (
              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'تم النسخ' : 'نسخ النص'}</span>
              </button>
            )}
          </div>

          {activeView === 'pages' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {result.pages.map((page) => {
                const ext = format === 'jpg' ? 'jpg' : 'png';
                const pageFilename = `${stripExtension(result.fileName)}_page_${page.pageNumber}.${ext}`;
                return (
                  <div
                    key={page.pageNumber}
                    className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]"
                  >
                    <div className="flex aspect-[3/4] items-center justify-center overflow-hidden bg-slate-950/60 p-3">
                      <img
                        src={page.previewUrl}
                        alt={`صفحة ${page.pageNumber}`}
                        referrerPolicy="no-referrer"
                        className="max-h-full max-w-full rounded object-contain shadow-md"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] px-4 py-3">
                      <div className="text-xs text-slate-400">
                        <span className="font-semibold text-slate-200">صفحة {page.pageNumber}</span>
                        <span className="mx-1.5 text-slate-600">·</span>
                        <span className="font-mono-nums">
                          {page.width}×{page.height}
                        </span>
                        <span className="mx-1.5 text-slate-600">·</span>
                        <span className="font-mono-nums">{formatBytes(page.imageBlob.size)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadBlob(page.imageBlob, pageFilename)}
                        className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-500/15"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>{format.toUpperCase()}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <textarea
              readOnly
              value={result.fullText}
              rows={14}
              dir="auto"
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 p-4 text-sm leading-7 text-slate-200 focus:border-sky-400/50 focus:outline-none"
            />
          )}
        </div>
      )}
    </div>
  );
};
