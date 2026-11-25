import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { hasArabicText } from './fileHelpers';

export type PdfPageSize = 'a4' | 'letter' | 'fit';
export type PdfOrientation = 'auto' | 'portrait' | 'landscape';
export type TextDirectionMode = 'auto' | 'rtl' | 'ltr';

export interface CreatorImageItem {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}

export interface CreatePdfOptions {
  title: string;
  markdownText: string;
  textDirection: TextDirectionMode;
  images: CreatorImageItem[];
  pageSize: PdfPageSize;
  orientation: PdfOrientation;
  marginMm: number;
  onProgress?: (status: string) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`تعذر قراءة الصورة: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function getImageFormatForJsPdf(file: File): 'PNG' | 'JPEG' | 'WEBP' {
  const type = file.type.toLowerCase();
  if (type.includes('png')) return 'PNG';
  if (type.includes('webp')) return 'WEBP';
  return 'JPEG';
}

function resolvePageDimensionsMm(
  pageSize: PdfPageSize,
  orientation: PdfOrientation,
  imgWidthPx?: number,
  imgHeightPx?: number
): { width: number; height: number; pdfOrientation: 'p' | 'l' } {
  if (pageSize === 'fit' && imgWidthPx && imgHeightPx) {
    const pxToMm = 25.4 / 96;
    const w = Math.max(40, imgWidthPx * pxToMm);
    const h = Math.max(40, imgHeightPx * pxToMm);
    return {
      width: w,
      height: h,
      pdfOrientation: w > h ? 'l' : 'p',
    };
  }

  const base = pageSize === 'letter' ? { w: 215.9, h: 279.4 } : { w: 210, h: 297 };
  let isLandscape = orientation === 'landscape';
  if (orientation === 'auto' && imgWidthPx && imgHeightPx) {
    isLandscape = imgWidthPx > imgHeightPx;
  }

  return isLandscape
    ? { width: base.h, height: base.w, pdfOrientation: 'l' }
    : { width: base.w, height: base.h, pdfOrientation: 'p' };
}

function renderCleanMarkdownHtml(markdown: string): string {
  const rawHtml = marked.parse(markdown, {
    async: false,
    breaks: true,
    gfm: true,
  }) as string;

  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
  });
}

function createIsolatedRenderHost(isRtl: boolean, title: string): HTMLDivElement {
  const host = document.createElement('div');
  host.setAttribute('data-pdf-render-host', 'true');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = '794px'; // A4 width at 96 DPI
  host.style.backgroundColor = '#ffffff';
  host.style.color = '#0f172a';
  host.style.fontFamily = "'Cairo', system-ui, -apple-system, sans-serif";
  host.style.direction = isRtl ? 'rtl' : 'ltr';
  host.style.textAlign = isRtl ? 'right' : 'left';
  host.style.padding = '56px 56px 64px 56px';
  host.style.boxSizing = 'border-box';
  host.style.lineHeight = '1.8';
  host.style.fontSize = '15px';

  if (title.trim()) {
    const h1 = document.createElement('h1');
    h1.textContent = title.trim();
    h1.style.fontSize = '24px';
    h1.style.fontWeight = '700';
    h1.style.color = '#0f172a';
    h1.style.margin = '0 0 18px 0';
    h1.style.paddingBottom = '12px';
    h1.style.borderBottom = '2px solid #e2e8f0';
    host.appendChild(h1);
  }

  return host;
}

function styleProseNodes(container: HTMLElement, isRtl: boolean): void {
  const headings = container.querySelectorAll('h1, h2, h3, h4');
  headings.forEach((el) => {
    const node = el as HTMLElement;
    node.style.color = '#0f172a';
    node.style.fontWeight = '700';
    node.style.marginTop = '18px';
    node.style.marginBottom = '8px';
    node.style.lineHeight = '1.45';
    if (node.tagName === 'H1') node.style.fontSize = '22px';
    else if (node.tagName === 'H2') node.style.fontSize = '18px';
    else node.style.fontSize = '16px';
  });

  container.querySelectorAll('p').forEach((el) => {
    const node = el as HTMLElement;
    node.style.margin = '0 0 10px 0';
    node.style.color = '#1e293b';
  });

  container.querySelectorAll('ul, ol').forEach((el) => {
    const node = el as HTMLElement;
    node.style.margin = '0 0 12px 0';
    node.style.paddingInlineStart = '24px';
    node.style.color = '#1e293b';
  });

  container.querySelectorAll('li').forEach((el) => {
    const node = el as HTMLElement;
    node.style.marginBottom = '4px';
  });

  container.querySelectorAll('blockquote').forEach((el) => {
    const node = el as HTMLElement;
    node.style.margin = '12px 0';
    node.style.padding = '10px 14px';
    node.style.backgroundColor = '#f8fafc';
    node.style.border = '1px solid #e2e8f0';
    node.style.borderRadius = '6px';
    node.style.color = '#334155';
  });

  container.querySelectorAll('code').forEach((el) => {
    const node = el as HTMLElement;
    node.style.fontFamily = "'JetBrains Mono', monospace";
    node.style.backgroundColor = '#f1f5f9';
    node.style.color = '#0f172a';
    node.style.padding = '1px 5px';
    node.style.borderRadius = '4px';
    node.style.fontSize = '13px';
    node.style.direction = 'ltr';
    node.style.unicodeBidi = 'isolate';
  });

  container.querySelectorAll('pre').forEach((el) => {
    const node = el as HTMLElement;
    node.style.backgroundColor = '#f8fafc';
    node.style.border = '1px solid #e2e8f0';
    node.style.padding = '12px';
    node.style.borderRadius = '8px';
    node.style.overflow = 'hidden';
    node.style.whiteSpace = 'pre-wrap';
    node.style.direction = 'ltr';
    node.style.textAlign = 'left';
    node.style.margin = '12px 0';
  });

  container.querySelectorAll('table').forEach((el) => {
    const node = el as HTMLElement;
    node.style.width = '100%';
    node.style.borderCollapse = 'collapse';
    node.style.margin = '12px 0';
    node.style.fontSize = '13px';
  });

  container.querySelectorAll('th, td').forEach((el) => {
    const node = el as HTMLElement;
    node.style.border = '1px solid #cbd5e1';
    node.style.padding = '6px 10px';
    node.style.textAlign = isRtl ? 'right' : 'left';
    node.style.color = '#0f172a';
  });

  container.querySelectorAll('th').forEach((el) => {
    const node = el as HTMLElement;
    node.style.backgroundColor = '#f1f5f9';
    node.style.fontWeight = '700';
  });

  container.querySelectorAll('a').forEach((el) => {
    const node = el as HTMLElement;
    node.style.color = '#0284c7';
    node.style.textDecoration = 'underline';
  });

  container.querySelectorAll('hr').forEach((el) => {
    const node = el as HTMLElement;
    node.style.border = 'none';
    node.style.borderTop = '1px solid #cbd5e1';
    node.style.margin = '16px 0';
  });
}

async function captureElementCleanly(element: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    onclone: (clonedDoc) => {
      // Remove Tailwind v4 stylesheets containing oklch() in the cloned document
      // so html2canvas never fails parsing modern CSS color functions.
      clonedDoc.querySelectorAll('style, link[rel="stylesheet"]').forEach((sheet) => {
        const href = sheet.getAttribute('href') || '';
        if (href.includes('fonts.googleapis.com')) return;
        sheet.remove();
      });
      const fontStyle = clonedDoc.createElement('style');
      fontStyle.textContent = `
        * { box-sizing: border-box; }
        body { margin: 0; background: #ffffff; color: #0f172a; font-family: 'Cairo', system-ui, sans-serif; }
      `;
      clonedDoc.head.appendChild(fontStyle);
    },
  });
}

export async function renderTextToPdfPages(
  pdf: jsPDF,
  options: {
    title: string;
    markdownText: string;
    direction: TextDirectionMode;
    pageSize: 'a4' | 'letter';
    hasExistingFirstPage: boolean;
  }
): Promise<boolean> {
  const trimmed = options.markdownText.trim();
  const titleTrimmed = options.title.trim();
  if (!trimmed && !titleTrimmed) return false;

  const isRtl =
    options.direction === 'rtl'
      ? true
      : options.direction === 'ltr'
        ? false
        : hasArabicText(`${titleTrimmed}\n${trimmed}`);

  const host = createIsolatedRenderHost(isRtl, titleTrimmed);
  const bodyDiv = document.createElement('div');
  bodyDiv.innerHTML = trimmed ? renderCleanMarkdownHtml(trimmed) : '';
  styleProseNodes(bodyDiv, isRtl);
  host.appendChild(bodyDiv);
  document.body.appendChild(host);

  try {
    // Wait for Cairo font readiness if supported
    if ('fonts' in document) {
      await document.fonts.ready;
    }

    // Group child blocks into clean A4-height page containers so text lines never split mid-line
    const pageWidthPx = 794;
    const targetPageHeightPx = options.pageSize === 'letter' ? 1026 : 1123;
    const maxContentHeightPx = targetPageHeightPx - 120;

    const blocks = Array.from(host.children) as HTMLElement[];
    const pagesBlocks: HTMLElement[][] = [[]];
    let currentHeight = 0;

    for (const block of blocks) {
      // Unwrap bodyDiv children so paragraphs paginate cleanly
      if (block === bodyDiv) {
        const innerBlocks = Array.from(bodyDiv.children) as HTMLElement[];
        for (const inner of innerBlocks) {
          const h = inner.offsetHeight + 10;
          if (currentHeight > 0 && currentHeight + h > maxContentHeightPx) {
            pagesBlocks.push([]);
            currentHeight = 0;
          }
          pagesBlocks[pagesBlocks.length - 1].push(inner);
          currentHeight += h;
        }
      } else {
        const h = block.offsetHeight + 18;
        if (currentHeight > 0 && currentHeight + h > maxContentHeightPx) {
          pagesBlocks.push([]);
          currentHeight = 0;
        }
        pagesBlocks[pagesBlocks.length - 1].push(block);
        currentHeight += h;
      }
    }

    const pdfPageWidthMm = options.pageSize === 'letter' ? 215.9 : 210;
    const pdfPageHeightMm = options.pageSize === 'letter' ? 279.4 : 297;

    let addedAny = false;
    for (let i = 0; i < pagesBlocks.length; i++) {
      const pageGroup = pagesBlocks[i];
      if (pageGroup.length === 0) continue;

      const pageHost = document.createElement('div');
      pageHost.style.position = 'fixed';
      pageHost.style.left = '-10000px';
      pageHost.style.top = '0';
      pageHost.style.width = `${pageWidthPx}px`;
      pageHost.style.minHeight = `${targetPageHeightPx}px`;
      pageHost.style.backgroundColor = '#ffffff';
      pageHost.style.color = '#0f172a';
      pageHost.style.fontFamily = "'Cairo', system-ui, -apple-system, sans-serif";
      pageHost.style.direction = isRtl ? 'rtl' : 'ltr';
      pageHost.style.textAlign = isRtl ? 'right' : 'left';
      pageHost.style.padding = '56px';
      pageHost.style.boxSizing = 'border-box';
      pageHost.style.lineHeight = '1.8';
      pageHost.style.fontSize = '15px';

      for (const node of pageGroup) {
        pageHost.appendChild(node.cloneNode(true));
      }

      document.body.appendChild(pageHost);
      try {
        const canvas = await captureElementCleanly(pageHost);
        const imgData = canvas.toDataURL('image/jpeg', 0.94);

        if (options.hasExistingFirstPage || addedAny) {
          pdf.addPage([pdfPageWidthMm, pdfPageHeightMm], 'p');
        }
        const renderedHeightMm = (canvas.height * pdfPageWidthMm) / canvas.width;
        pdf.addImage(
          imgData,
          'JPEG',
          0,
          0,
          pdfPageWidthMm,
          Math.min(renderedHeightMm, pdfPageHeightMm),
          undefined,
          'FAST'
        );
        addedAny = true;
      } finally {
        document.body.removeChild(pageHost);
      }
    }

    return addedAny;
  } finally {
    document.body.removeChild(host);
  }
}

export async function createPdfFromContent(options: CreatePdfOptions): Promise<Blob> {
  const hasText = Boolean(options.markdownText.trim() || options.title.trim());
  const hasImages = options.images.length > 0;

  if (!hasText && !hasImages) {
    throw new Error('الرجاء إضافة صور أو كتابة نص عربي / Markdown أولاً.');
  }

  const textPageFormat: 'a4' | 'letter' = options.pageSize === 'letter' ? 'letter' : 'a4';
  const firstPageDims = hasText
    ? resolvePageDimensionsMm(textPageFormat, 'portrait')
    : resolvePageDimensionsMm(
        options.pageSize,
        options.orientation,
        options.images[0].width,
        options.images[0].height
      );

  const pdf = new jsPDF({
    orientation: firstPageDims.pdfOrientation,
    unit: 'mm',
    format: [firstPageDims.width, firstPageDims.height],
    compress: true,
  });

  let pageInitialized = false;

  if (hasText) {
    options.onProgress?.('جاري تنسيق وتحويل النصوص العربية إلى صفحات PDF...');
    const addedText = await renderTextToPdfPages(pdf, {
      title: options.title,
      markdownText: options.markdownText,
      direction: options.textDirection,
      pageSize: textPageFormat,
      hasExistingFirstPage: false,
    });
    if (addedText) {
      pageInitialized = true;
    }
  }

  for (let i = 0; i < options.images.length; i++) {
    const imgItem = options.images[i];
    options.onProgress?.(`جاري معالجة الصورة ${i + 1} من ${options.images.length}...`);

    const dims = resolvePageDimensionsMm(
      options.pageSize,
      options.orientation,
      imgItem.width,
      imgItem.height
    );

    if (pageInitialized) {
      pdf.addPage([dims.width, dims.height], dims.pdfOrientation);
    } else {
      pageInitialized = true;
    }

    const dataUrl = await readFileAsDataUrl(imgItem.file);
    const margin = options.pageSize === 'fit' ? 0 : options.marginMm;
    const availW = Math.max(10, dims.width - margin * 2);
    const availH = Math.max(10, dims.height - margin * 2);

    const imgRatio = imgItem.width / Math.max(1, imgItem.height);
    const boxRatio = availW / availH;

    let drawW = availW;
    let drawH = availH;
    if (imgRatio > boxRatio) {
      drawW = availW;
      drawH = availW / imgRatio;
    } else {
      drawH = availH;
      drawW = availH * imgRatio;
    }

    const x = margin + (availW - drawW) / 2;
    const y = margin + (availH - drawH) / 2;

    pdf.addImage(dataUrl, getImageFormatForJsPdf(imgItem.file), x, y, drawW, drawH, undefined, 'FAST');
  }

  return pdf.output('blob');
}
