import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Check,
  Copy,
  Download,
  FileText,
  Images,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { DropZone } from './DropZone';
import {
  buildOfficeMediaZip,
  exportOfficeTextToPdf,
  OfficeUnpackResult,
  unpackOfficeFile,
} from '../utils/officeUnpacker';
import {
  copyTextToClipboard,
  downloadBlob,
  formatBytes,
  stripExtension,
} from '../utils/fileHelpers';

export const OfficeUnpackerTool: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<OfficeUnpackResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'text' | 'media'>('text');

  useEffect(() => {
    return () => {
      result?.media.forEach((m) => URL.revokeObjectURL(m.previewUrl));
    };
  }, [result]);

  const handleFilesSelected = async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    setSelectedFile(file);
    setError(null);
    setIsLoading(true);

    try {
      const unpacked = await unpackOfficeFile(file);
      setResult((prev) => {
        prev?.media.forEach((m) => URL.revokeObjectURL(m.previewUrl));
        return unpacked;
      });
      setActiveTab(unpacked.sections.length === 0 && unpacked.media.length > 0 ? 'media' : 'text');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'حدث خطأ أثناء قراءة الملف.'
      );
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadTxt = () => {
    if (!result) return;
    const blob = new Blob([result.fullText], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `${stripExtension(result.fileName)}_extracted.txt`);
  };

  const handleDownloadPdf = async () => {
    if (!result) return;
    setIsExportingPdf(true);
    setError(null);
    try {
      const pdfBlob = await exportOfficeTextToPdf(result);
      downloadBlob(pdfBlob, `${stripExtension(result.fileName)}_extracted.pdf`);
    } catch {
      setError('تعذر تحويل النصوص المستخرجة إلى PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadMediaZip = async () => {
    if (!result || result.media.length === 0) return;
    setIsExportingZip(true);
    setError(null);
    try {
      const zipBlob = await buildOfficeMediaZip(result.media, result.fileName);
      downloadBlob(zipBlob, `${stripExtension(result.fileName)}_media.zip`);
    } catch {
      setError('تعذر تجميع الصور في ملف ZIP.');
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    const ok = await copyTextToClipboard(result.fullText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleReset = () => {
    result?.media.forEach((m) => URL.revokeObjectURL(m.previewUrl));
    setResult(null);
    setSelectedFile(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100">تفكيك واستخراج ملفات Word و PowerPoint</h2>
          <p className="text-sm text-slate-400">
            استخرج جميع نصوص المستندات والشرائح والصور المضمنة من ملفات .docx و .pptx مباشرة.
          </p>
        </div>

        {selectedFile && (
          <button
            type="button"
            onClick={handleReset}
            disabled={isLoading}
            className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
          >
            <RotateCcw className="h-4 w-4" />
            <span>ملف جديد</span>
          </button>
        )}
      </div>

      {!selectedFile && !isLoading && (
        <DropZone
          accept=".docx,.pptx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          title="اسحب ملف Word (.docx) أو PowerPoint (.pptx) هنا"
          subtitle="يتم فحص بنية XML واستخراج الوسائط دون أي اتصال بخادم خارجي"
          onFilesSelected={handleFilesSelected}
        />
      )}

      {isLoading && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
          <p className="text-sm font-semibold text-slate-100">جاري فك ضغط وتحليل بنية الملف...</p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {result && !isLoading && (
        <div className="space-y-6">
          {/* Metadata & Export Controls */}
          <div className="flex flex-col gap-4 border-b border-white/[0.07] pb-5">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
              <span className="font-semibold text-slate-100">{result.fileName}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono-nums uppercase text-sky-400">{result.kind}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono-nums text-slate-400">
                {selectedFile ? formatBytes(selectedFile.size) : ''}
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono-nums text-slate-400">
                {result.kind === 'pptx' ? `${result.sections.length} شريحة` : `${result.sections.length} قسم`}
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono-nums text-slate-400">{result.media.length} صورة مضمنة</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isExportingPdf}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-60"
              >
                {isExportingPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                <span>تصدير النصوص كـ PDF</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadTxt}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/[0.1]"
              >
                <Download className="h-4 w-4 text-sky-400" />
                <span>تحميل النصوص (.txt)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadMediaZip}
                disabled={result.media.length === 0 || isExportingZip}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isExportingZip ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="h-4 w-4 text-sky-400" />
                )}
                <span>تحميل الصور ({result.media.length} ZIP)</span>
              </button>
            </div>
          </div>

          {/* View Switcher */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
              <button
                type="button"
                onClick={() => setActiveTab('text')}
                className={`inline-flex min-h-[36px] items-center gap-2 whitespace-nowrap rounded-lg px-4 text-xs font-semibold transition-colors ${
                  activeTab === 'text'
                    ? 'bg-white/15 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>النصوص والشرائح ({result.sections.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('media')}
                className={`inline-flex min-h-[36px] items-center gap-2 whitespace-nowrap rounded-lg px-4 text-xs font-semibold transition-colors ${
                  activeTab === 'media'
                    ? 'bg-white/15 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Images className="h-3.5 w-3.5" />
                <span>الصور المستخرجة ({result.media.length})</span>
              </button>
            </div>

            {activeTab === 'text' && (
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'تم النسخ' : 'نسخ الكل'}</span>
              </button>
            )}
          </div>

          {activeTab === 'text' ? (
            <div className="max-h-[460px] space-y-4 overflow-y-auto pl-1">
              {result.sections.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  لم يتم العثور على نصوص داخل هذا الملف.
                </p>
              ) : (
                result.sections.map((section, idx) => (
                  <div
                    key={`${section.label}-${idx}`}
                    className="rounded-xl border border-white/10 bg-slate-950/50 p-4"
                  >
                    <h3 className="mb-2 text-xs font-bold text-sky-400">{section.label}</h3>
                    <p
                      dir="auto"
                      className="whitespace-pre-wrap text-sm leading-7 text-slate-200"
                    >
                      {section.content}
                    </p>
                    {section.notes && (
                      <div className="mt-3 border-t border-white/[0.07] pt-3">
                        <p className="mb-1 text-xs font-semibold text-amber-300">ملاحظات المتحدث</p>
                        <p dir="auto" className="whitespace-pre-wrap text-xs leading-6 text-slate-300">
                          {section.notes}
                        </p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : result.media.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-6 py-10 text-center text-sm text-slate-400">
              لا توجد صور أو وسائط مضمنة داخل هذا الملف.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {result.media.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]"
                >
                  <div className="flex h-44 items-center justify-center bg-slate-950/60 p-3">
                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className="max-h-full max-w-full rounded object-contain"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-200">{item.name}</p>
                      <p className="font-mono-nums text-xs text-slate-400">{formatBytes(item.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadBlob(item.blob, item.name)}
                      className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-500/15"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>تحميل</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
