import React, { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

interface DropZoneProps {
  accept: string;
  multiple?: boolean;
  title: string;
  subtitle: string;
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({
  accept,
  multiple = false,
  title,
  subtitle,
  onFilesSelected,
  disabled = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || disabled) return;
    const files = Array.from(fileList);
    onFilesSelected(multiple ? files : [files[0]]);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`group relative flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
        disabled
          ? 'cursor-not-allowed border-white/10 bg-white/[0.02] opacity-50'
          : isDragging
            ? 'cursor-pointer border-sky-400 bg-sky-500/10'
            : 'cursor-pointer border-white/15 bg-white/[0.02] hover:border-sky-400/50 hover:bg-white/[0.04]'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-sky-400 transition-transform duration-150 group-hover:scale-105">
        <UploadCloud className="h-6 w-6" />
      </div>
      <p className="text-base font-semibold text-slate-100">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
    </div>
  );
};
