import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { renderTextToPdfPages } from './pdfCreator';
import { stripExtension } from './fileHelpers';

export type OfficeFileKind = 'docx' | 'pptx';

export interface ExtractedOfficeSection {
  label: string;
  content: string;
  notes?: string;
}

export interface ExtractedOfficeMedia {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
  blob: Blob;
  previewUrl: string;
}

export interface OfficeUnpackResult {
  fileName: string;
  kind: OfficeFileKind;
  sections: ExtractedOfficeSection[];
  fullText: string;
  media: ExtractedOfficeMedia[];
  totalFilesInArchive: number;
}

function guessMimeFromFilename(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.tiff') || lower.endsWith('.tif')) return 'image/tiff';
  if (lower.endsWith('.emf')) return 'image/emf';
  if (lower.endsWith('.wmf')) return 'image/wmf';
  return 'application/octet-stream';
}

function isPreviewableImage(name: string): boolean {
  const lower = name.toLowerCase();
  return /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(lower);
}

function extractTextFromXmlParagraphs(xmlText: string, paragraphTag: string, textTag: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const paragraphs = Array.from(doc.getElementsByTagNameNS('*', paragraphTag));

  if (paragraphs.length === 0) {
    // Fallback if namespace wildcard didn't match
    const textNodes = Array.from(doc.getElementsByTagNameNS('*', textTag));
    return textNodes.map((n) => n.textContent || '').join(' ').trim();
  }

  const lines: string[] = [];
  for (const p of paragraphs) {
    const runs = Array.from(p.getElementsByTagNameNS('*', textTag));
    const lineText = runs.map((r) => r.textContent || '').join('');
    const trimmed = lineText.trim();
    if (trimmed) {
      lines.push(trimmed);
    }
  }
  return lines.join('\n');
}

function extractNumericSuffix(path: string): number {
  const match = path.match(/(\d+)\.xml$/i);
  return match ? Number(match[1]) : 0;
}

export async function unpackOfficeFile(file: File): Promise<OfficeUnpackResult> {
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.docx') && !lowerName.endsWith('.pptx')) {
    throw new Error('الصيغة غير مدعومة. يرجى رفع ملف Word (.docx) أو PowerPoint (.pptx).');
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('تعذر فك ضغط الملف. تأكد من أن الملف غير تالف أو محمي بكلمة مرور.');
  }

  const allPaths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
  const isDocx = lowerName.endsWith('.docx') || allPaths.some((p) => p === 'word/document.xml');
  const kind: OfficeFileKind = isDocx ? 'docx' : 'pptx';

  const sections: ExtractedOfficeSection[] = [];

  if (kind === 'docx') {
    const docEntry = zip.file('word/document.xml');
    if (docEntry) {
      const xml = await docEntry.async('string');
      const text = extractTextFromXmlParagraphs(xml, 'p', 't');
      sections.push({
        label: 'محتوى المستند الرئيسي',
        content: text || '(لا يوجد نص في المستند الرئيسي)',
      });
    }

    const headerPaths = allPaths
      .filter((p) => /^word\/header\d*\.xml$/i.test(p))
      .sort((a, b) => extractNumericSuffix(a) - extractNumericSuffix(b));
    for (const hp of headerPaths) {
      const xml = await zip.file(hp)!.async('string');
      const text = extractTextFromXmlParagraphs(xml, 'p', 't');
      if (text) {
        sections.push({ label: `رأس الصفحة (${hp.split('/').pop()})`, content: text });
      }
    }

    const footerPaths = allPaths
      .filter((p) => /^word\/footer\d*\.xml$/i.test(p))
      .sort((a, b) => extractNumericSuffix(a) - extractNumericSuffix(b));
    for (const fp of footerPaths) {
      const xml = await zip.file(fp)!.async('string');
      const text = extractTextFromXmlParagraphs(xml, 'p', 't');
      if (text) {
        sections.push({ label: `تذييل الصفحة (${fp.split('/').pop()})`, content: text });
      }
    }
  } else {
    const slidePaths = allPaths
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
      .sort((a, b) => extractNumericSuffix(a) - extractNumericSuffix(b));

    for (const sp of slidePaths) {
      const slideNum = extractNumericSuffix(sp);
      const xml = await zip.file(sp)!.async('string');
      const slideText = extractTextFromXmlParagraphs(xml, 'p', 't');

      let notesText = '';
      const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`;
      const notesEntry = zip.file(notesPath);
      if (notesEntry) {
        const notesXml = await notesEntry.async('string');
        notesText = extractTextFromXmlParagraphs(notesXml, 'p', 't');
      }

      sections.push({
        label: `الشريحة ${slideNum}`,
        content: slideText || '(شريحة بدون نص)',
        notes: notesText || undefined,
      });
    }
  }

  // Extract embedded media images
  const mediaPrefix = kind === 'docx' ? 'word/media/' : 'ppt/media/';
  const mediaPaths = allPaths
    .filter((p) => p.startsWith(mediaPrefix) || p.includes('/media/'))
    .sort((a, b) => a.localeCompare(b));

  const media: ExtractedOfficeMedia[] = [];
  for (let i = 0; i < mediaPaths.length; i++) {
    const path = mediaPaths[i];
    const entry = zip.file(path);
    if (!entry) continue;
    const rawName = path.split('/').pop() || `media_${i + 1}`;
    if (!isPreviewableImage(rawName)) continue;

    const mimeType = guessMimeFromFilename(rawName);
    const arrayBuffer = await entry.async('arraybuffer');
    const blob = new Blob([arrayBuffer], { type: mimeType });
    const previewUrl = URL.createObjectURL(blob);

    media.push({
      id: `${path}-${i}`,
      name: rawName,
      path,
      mimeType,
      size: blob.size,
      blob,
      previewUrl,
    });
  }

  const fullText =
    sections.length > 0
      ? sections
          .map((sec) => {
            const base = `## ${sec.label}\n${sec.content}`;
            return sec.notes ? `${base}\n\n[ملاحظات المتحدث]\n${sec.notes}` : base;
          })
          .join('\n\n')
      : 'لم يتم العثور على نصوص قابلة للاستخراج داخل الملف.';

  return {
    fileName: file.name,
    kind,
    sections,
    fullText,
    media,
    totalFilesInArchive: allPaths.length,
  };
}

export async function exportOfficeTextToPdf(result: OfficeUnpackResult): Promise<Blob> {
  const title = stripExtension(result.fileName);
  const markdownBody = result.sections
    .map((sec) => {
      const lines = sec.content
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('\n\n');
      const notesPart = sec.notes ? `\n\n> **ملاحظات:** ${sec.notes}` : '';
      return `## ${sec.label}\n\n${lines}${notesPart}`;
    })
    .join('\n\n---\n\n');

  const pdf = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  await renderTextToPdfPages(pdf, {
    title,
    markdownText: markdownBody,
    direction: 'auto',
    pageSize: 'a4',
    hasExistingFirstPage: false,
  });

  return pdf.output('blob');
}

export async function buildOfficeMediaZip(
  media: ExtractedOfficeMedia[],
  fileName: string
): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder(`${stripExtension(fileName)}_media`);
  for (const item of media) {
    folder?.file(item.name, item.blob);
  }
  return zip.generateAsync({ type: 'blob' });
}
