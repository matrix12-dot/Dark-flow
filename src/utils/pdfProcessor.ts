import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  TextRun,
} from 'docx';
import JSZip from 'jszip';
import { hasArabicText, stripExtension } from './fileHelpers';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type PdfImageFormat = 'png' | 'jpg';

export interface ExtractedPdfPage {
  pageNumber: number;
  width: number;
  height: number;
  imageBlob: Blob;
  previewUrl: string;
  text: string;
  lines: string[];
}

export interface PdfExtractionResult {
  fileName: string;
  pageCount: number;
  pages: ExtractedPdfPage[];
  fullText: string;
}

interface PositionedTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  hasEOL: boolean;
}

function groupTextItemsIntoLines(items: PositionedTextItem[]): string[] {
  if (items.length === 0) return [];

  // Sort top-to-bottom (descending PDF y), then preserve line grouping
  const rows: { y: number; items: PositionedTextItem[] }[] = [];
  const yTolerance = 4.5;

  for (const item of items) {
    if (!item.str) continue;
    let targetRow = rows.find((row) => Math.abs(row.y - item.y) <= yTolerance);
    if (!targetRow) {
      targetRow = { y: item.y, items: [] };
      rows.push(targetRow);
    }
    targetRow.items.push(item);
  }

  rows.sort((a, b) => b.y - a.y);

  const lines: string[] = [];
  for (const row of rows) {
    const rawLine = row.items.map((i) => i.str).join('');
    const lineIsArabic = hasArabicText(rawLine);

    // Sort items within line: RTL runs right-to-left (descending X), LTR left-to-right (ascending X)
    const sorted = [...row.items].sort((a, b) =>
      lineIsArabic ? b.x - a.x : a.x - b.x
    );

    let built = '';
    for (let i = 0; i < sorted.length; i++) {
      const curr = sorted[i];
      if (i > 0) {
        const prev = sorted[i - 1];
        const gap = lineIsArabic
          ? prev.x - (curr.x + curr.width)
          : curr.x - (prev.x + prev.width);
        if (gap > 2.5 && !built.endsWith(' ') && !curr.str.startsWith(' ')) {
          built += ' ';
        }
      }
      built += curr.str;
    }

    const cleaned = built.replace(/\s+/g, ' ').trim();
    if (cleaned) {
      lines.push(cleaned);
    }
  }

  return lines;
}

export async function extractPdfPagesAndText(
  file: File,
  options: {
    format: PdfImageFormat;
    scale: number;
    onProgress?: (current: number, total: number) => void;
  }
): Promise<PdfExtractionResult> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  const pageCount = pdfDoc.numPages;
  const pages: ExtractedPdfPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: options.scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('تعذر إنشاء سياق الرسم (Canvas 2D) في المتصفح.');
      }

      // White page background so transparent PDFs render cleanly in JPG/PNG
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvas,
        canvasContext: context,
        viewport,
      }).promise;

      const mimeType = options.format === 'jpg' ? 'image/jpeg' : 'image/png';
      const quality = options.format === 'jpg' ? 0.92 : undefined;

      const imageBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error(`تعذر تصدير صورة الصفحة رقم ${pageNumber}.`));
          },
          mimeType,
          quality
        );
      });

      const previewUrl = URL.createObjectURL(imageBlob);

      // Extract structured text
      const textContent = await page.getTextContent();
      const positioned: PositionedTextItem[] = [];
      for (const item of textContent.items) {
        if ('str' in item && typeof item.str === 'string') {
          const transform = item.transform as number[];
          positioned.push({
            str: item.str,
            x: transform[4] ?? 0,
            y: transform[5] ?? 0,
            width: item.width ?? 0,
            hasEOL: Boolean(item.hasEOL),
          });
        }
      }

      const lines = groupTextItemsIntoLines(positioned);
      const text = lines.join('\n');

      pages.push({
        pageNumber,
        width: canvas.width,
        height: canvas.height,
        imageBlob,
        previewUrl,
        text,
        lines,
      });

      page.cleanup();
      options.onProgress?.(pageNumber, pageCount);
    }
  } finally {
    await pdfDoc.cleanup();
    await loadingTask.destroy();
  }

  const fullText = pages
    .map((p) => `--- الصفحة ${p.pageNumber} ---\n${p.text || '(لا يوجد نص قابل للاستخراج في هذه الصفحة)'}`)
    .join('\n\n');

  return {
    fileName: file.name,
    pageCount,
    pages,
    fullText,
  };
}

export async function buildDocxFromExtractedPdf(result: PdfExtractionResult): Promise<Blob> {
  const baseName = stripExtension(result.fileName);
  const children: Paragraph[] = [];

  const titleIsArabic = hasArabicText(baseName) || hasArabicText(result.fullText);

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: titleIsArabic ? AlignmentType.RIGHT : AlignmentType.LEFT,
      bidirectional: titleIsArabic,
      spacing: { after: 280 },
      children: [
        new TextRun({
          text: baseName,
          bold: true,
          size: 32,
          rightToLeft: titleIsArabic,
        }),
      ],
    })
  );

  result.pages.forEach((page, index) => {
    const pageHasArabic = hasArabicText(page.text);

    children.push(
      new Paragraph({
        alignment: pageHasArabic ? AlignmentType.RIGHT : AlignmentType.LEFT,
        bidirectional: pageHasArabic,
        spacing: { before: 120, after: 140 },
        children: [
          new TextRun({
            text: `صفحة ${page.pageNumber} من ${result.pageCount}`,
            bold: true,
            color: '0284C7',
            size: 20,
            rightToLeft: true,
          }),
        ],
      })
    );

    if (page.lines.length === 0) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          spacing: { after: 160 },
          children: [
            new TextRun({
              text: '(صفحة مصورة أو خالية من النصوص القابلة للتحديد)',
              italics: true,
              color: '64748B',
              size: 22,
              rightToLeft: true,
            }),
          ],
        })
      );
    } else {
      for (const line of page.lines) {
        const lineRtl = hasArabicText(line);
        children.push(
          new Paragraph({
            alignment: lineRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            bidirectional: lineRtl,
            spacing: { after: 120, line: 320 },
            children: [
              new TextRun({
                text: line,
                size: 24,
                rightToLeft: lineRtl,
              }),
            ],
          })
        );
      }
    }

    if (index < result.pages.length - 1) {
      children.push(
        new Paragraph({
          children: [new PageBreak()],
        })
      );
    }
  });

  const doc = new Document({
    creator: 'Stark DocsFlow',
    title: baseName,
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

export async function buildPagesZipBlob(
  pages: ExtractedPdfPage[],
  format: PdfImageFormat,
  baseName: string
): Promise<Blob> {
  const zip = new JSZip();
  const safeBase = stripExtension(baseName);
  const ext = format === 'jpg' ? 'jpg' : 'png';

  for (const page of pages) {
    const padded = String(page.pageNumber).padStart(3, '0');
    zip.file(`${safeBase}_page_${padded}.${ext}`, page.imageBlob);
  }

  return zip.generateAsync({ type: 'blob' });
}
