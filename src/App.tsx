import React, { useState } from 'react';
import { MotionConfig, motion } from 'motion/react';
import { FileOutput, FilePlus, FolderOpen, Image as ImageIcon, ShieldCheck } from 'lucide-react';
import { PdfExtractorTool } from './components/PdfExtractorTool';
import { PdfCreatorTool } from './components/PdfCreatorTool';
import { OfficeUnpackerTool } from './components/OfficeUnpackerTool';
import { ImageOptimizerTool } from './components/ImageOptimizerTool';

type StudioTab = 'pdf-extract' | 'pdf-create' | 'office-unpack' | 'image-optimize';

interface TabItem {
  id: StudioTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabItem[] = [
  { id: 'pdf-extract', label: 'PDF إلى Word وصور', icon: FileOutput },
  { id: 'pdf-create', label: 'صور ونصوص إلى PDF', icon: FilePlus },
  { id: 'office-unpack', label: 'استخراج من Word & PPTX', icon: FolderOpen },
  { id: 'image-optimize', label: 'ضغط وتحويل الصور', icon: ImageIcon },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<StudioTab>('pdf-extract');

  return (
    <MotionConfig reducedMotion="user">
      <div dir="rtl" className="min-h-screen px-4 py-8 text-slate-100 sm:px-6 sm:py-12">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          {/* Clean Brand Header */}
          <header className="flex flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-right">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-50 sm:text-3xl">
                Stark DocsFlow
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                استوديو معالجة المستندات والصور بالكامل داخل المتصفح
              </p>
            </div>
            <div className="inline-flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="h-4 w-4 text-sky-400" />
              <span>معالجة محلية 100% دون رفع الملفات</span>
            </div>
          </header>

          {/* Symmetrical 4-Tab Navigation */}
          <nav
            aria-label="أدوات المستوديو"
            className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-2 backdrop-blur-xl sm:grid-cols-4"
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 sm:text-[13px] ${
                    isActive
                      ? 'bg-sky-500 text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-slate-100'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate whitespace-nowrap">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Main Liquid Glass Workspace Card */}
          <main className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-7">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeTab === 'pdf-extract' && <PdfExtractorTool />}
              {activeTab === 'pdf-create' && <PdfCreatorTool />}
              {activeTab === 'office-unpack' && <OfficeUnpackerTool />}
              {activeTab === 'image-optimize' && <ImageOptimizerTool />}
            </motion.div>
          </main>

          {/* Quiet Footer */}
          <footer className="flex flex-col items-center justify-between gap-2 pt-1 text-xs text-slate-500 sm:flex-row">
            <span>Stark DocsFlow</span>
            <span>تتم جميع العمليات داخل جهازك فقط عبر محرك المتصفح</span>
          </footer>
        </div>
      </div>
    </MotionConfig>
  );
}
