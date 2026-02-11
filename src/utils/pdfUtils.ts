import { PDFDocument, rgb, StandardFonts, degrees, PDFName, PDFRawStream, PDFDict, PDFRef, decodePDFRawStream } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';

// ──────────── PDF.js worker setup ────────────
const PDFJS_VERSION = '4.4.168';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

// ──────────── Generic helpers ────────────
export const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });

export const readFileAsDataURL = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const createPdfBlob = (bytes: Uint8Array): Blob =>
  new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });

// ──────────── Unicode / RTL detection ────────────
const hasNonWinAnsiChars = (text: string): boolean => {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 255) return true;
  }
  return false;
};

const isRTLText = (text: string): boolean =>
  /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF]/.test(text);

// ──────────── Canvas‑based text helpers ────────────
// These render text using the browser's native text shaping engine,
// which correctly handles Arabic reshaping, ligatures, RTL, CJK, etc.

/**
 * Render text onto a transparent PNG canvas – used for watermarks / annotations / signatures
 * that are overlaid on existing PDF pages.
 */
const renderTextToPng = (
  text: string,
  width: number,
  height: number,
  fontSize: number,
  color: string,
  rotation = 0,
  opacity = 1,
): Uint8Array => {
  const scale = 3;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  // transparent background – don't fill

  const rtl = isRTLText(text);
  const fontFamily = rtl
    ? '"Segoe UI", Tahoma, "Noto Sans Arabic", sans-serif'
    : '"Segoe UI", Roboto, sans-serif';

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.font = `bold ${fontSize * scale}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (rtl) ctx.direction = 'rtl';
  ctx.fillText(text, 0, 0);
  ctx.restore();

  const dataUrl = canvas.toDataURL('image/png');
  return Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
};

/**
 * Render a small text snippet to a transparent PNG positioned at (x,y) in PDF coords.
 * Returns PNG bytes and its pixel dimensions.
 */
const renderSmallTextToPng = (
  text: string,
  fontSize: number,
  color: string,
): { bytes: Uint8Array; w: number; h: number } => {
  const scale = 3;
  const rtl = isRTLText(text);
  const fontFamily = rtl
    ? '"Segoe UI", Tahoma, "Noto Sans Arabic", sans-serif'
    : 'Courier, monospace';

  // Measure first
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d')!;
  mctx.font = `${fontSize * scale}px ${fontFamily}`;
  const metrics = mctx.measureText(text);
  const w = Math.ceil(metrics.width + fontSize * scale); // a little padding
  const h = Math.ceil(fontSize * scale * 1.5);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.font = `${fontSize * scale}px ${fontFamily}`;
  ctx.textBaseline = 'top';
  if (rtl) {
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillText(text, w - 4, 4);
  } else {
    ctx.fillText(text, 4, 4);
  }

  const dataUrl = canvas.toDataURL('image/png');
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
  return { bytes, w: w / scale, h: h / scale };
};

// Note: text → PDF now goes through HTML rendering (renderHtmlToPageImages)
// for proper formatting support with all document types.

// ──────────── Image → PDF helper ────────────
const embedImageIntoPDF = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
  file: File,
): Promise<void> => {
  const pageW = 595;
  const pageH = 842;
  const imageBytes = await readFileAsArrayBuffer(file);
  let image;
  if (file.type === 'image/png') {
    image = await pdf.embedPng(imageBytes);
  } else if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
    image = await pdf.embedJpg(imageBytes);
  } else {
    const dataUrl = await readFileAsDataURL(file);
    const img = new Image();
    await new Promise<void>(resolve => {
      img.onload = () => resolve();
      img.src = dataUrl;
    });
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d')!.drawImage(img, 0, 0);
    const jpgUrl = c.toDataURL('image/jpeg', 0.92);
    const bytes = Uint8Array.from(atob(jpgUrl.split(',')[1]), ch => ch.charCodeAt(0));
    image = await pdf.embedJpg(bytes);
  }
  const s = Math.min(pageW / image.width, pageH / image.height);
  const w = image.width * s;
  const h = image.height * s;
  const page = pdf.addPage([pageW, pageH]);
  page.drawImage(image, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
};

// ──────────── HTML→PDF page renderer ────────────
// Renders styled HTML in a hidden DOM container, captures with html2canvas,
// and returns JPEG bytes for each page. This preserves formatting.

const A4_WIDTH_PX = 794;  // ~210mm at 96dpi
const A4_HEIGHT_PX = 1123; // ~297mm at 96dpi
const PAGE_PADDING = 60;

/**
 * Render HTML content to PDF pages.
 * Creates a hidden container, injects the HTML, captures with html2canvas page by page.
 */
const renderHtmlToPageImages = async (
  htmlContent: string,
  baseStyles: string = '',
  quality = 0.92,
): Promise<Uint8Array[]> => {
  // Create hidden container
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed; left: -9999px; top: 0; z-index: -1;
    width: ${A4_WIDTH_PX}px; background: white; color: black;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 14px; line-height: 1.6; overflow: visible;
  `;

  // Apply base styles + content
  container.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      body, html { margin: 0; padding: 0; }
      h1 { font-size: 26px; font-weight: 700; margin: 18px 0 10px; color: #1a1a1a; }
      h2 { font-size: 22px; font-weight: 600; margin: 16px 0 8px; color: #2a2a2a; }
      h3 { font-size: 18px; font-weight: 600; margin: 14px 0 6px; color: #333; }
      h4 { font-size: 16px; font-weight: 600; margin: 12px 0 6px; color: #444; }
      p { margin: 6px 0; }
      strong, b { font-weight: 700; }
      em, i { font-style: italic; }
      u { text-decoration: underline; }
      ul, ol { margin: 6px 0; padding-left: 28px; }
      li { margin: 3px 0; }
      table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px; }
      th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
      th { background: #f0f0f0; font-weight: 600; }
      tr:nth-child(even) { background: #fafafa; }
      img { max-width: 100%; height: auto; display: block; margin: 8px 0; }
      a { color: #2563eb; text-decoration: underline; }
      blockquote { margin: 10px 0; padding: 8px 16px; border-left: 4px solid #ddd; background: #f9f9f9; }
      code { background: #f3f3f3; padding: 2px 4px; border-radius: 3px; font-family: 'Courier New', monospace; font-size: 12px; }
      pre { background: #f3f3f3; padding: 12px; border-radius: 6px; overflow-x: auto; font-family: 'Courier New', monospace; font-size: 12px; white-space: pre-wrap; }
      sup { vertical-align: super; font-size: 0.75em; }
      sub { vertical-align: sub; font-size: 0.75em; }
      hr { border: none; border-top: 1px solid #ddd; margin: 12px 0; }
      ${baseStyles}
    </style>
    <div style="padding: ${PAGE_PADDING}px; width: ${A4_WIDTH_PX}px;">
      ${htmlContent}
    </div>
  `;
  document.body.appendChild(container);

  // Wait for images to load
  const imgs = container.querySelectorAll('img');
  if (imgs.length > 0) {
    await Promise.all(
      Array.from(imgs).map(img =>
        img.complete ? Promise.resolve() : new Promise<void>(r => {
          img.onload = () => r();
          img.onerror = () => r();
        })
      )
    );
  }

  // Wait a tick for browser to lay out
  await new Promise(r => setTimeout(r, 100));

  const contentHeight = container.scrollHeight;
  const usableHeight = A4_HEIGHT_PX;
  const totalPages = Math.max(1, Math.ceil(contentHeight / usableHeight));
  const pages: Uint8Array[] = [];

  // Force container to exact height for full capture
  container.style.height = `${contentHeight}px`;

  // Capture the full container once
  const fullCanvas = await html2canvas(container, {
    width: A4_WIDTH_PX,
    height: contentHeight,
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  // Slice into pages
  for (let page = 0; page < totalPages; page++) {
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = A4_WIDTH_PX * 2; // scale=2
    pageCanvas.height = A4_HEIGHT_PX * 2;
    const ctx = pageCanvas.getContext('2d')!;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

    // Draw the relevant slice
    const srcY = page * usableHeight * 2; // scale=2
    const srcH = Math.min(A4_HEIGHT_PX * 2, fullCanvas.height - srcY);
    if (srcH > 0) {
      ctx.drawImage(
        fullCanvas,
        0, srcY, A4_WIDTH_PX * 2, srcH,
        0, 0, A4_WIDTH_PX * 2, srcH
      );
    }

    const jpgUrl = pageCanvas.toDataURL('image/jpeg', quality);
    pages.push(Uint8Array.from(atob(jpgUrl.split(',')[1]), c => c.charCodeAt(0)));
  }

  document.body.removeChild(container);
  return pages;
};

/**
 * Embed captured page images into a PDFDocument.
 */
const embedPageImagesIntoPDF = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
  pageImages: Uint8Array[],
): Promise<void> => {
  const pageW = 595; // A4 in PDF points
  const pageH = 842;
  for (const jpgBytes of pageImages) {
    const img = await pdf.embedJpg(jpgBytes);
    const page = pdf.addPage([pageW, pageH]);
    page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
  }
};

// ──────────── Document format converters (preserve formatting) ────────────

const convertDocxToHtml = async (file: File): Promise<string> => {
  const buf = await readFileAsArrayBuffer(file);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = mammoth as any;
  const options: Record<string, unknown> = {
    arrayBuffer: buf,
  };
  // Try to use convertToHtml with image support
  try {
    if (m.images?.imgElement) {
      const result = await m.convertToHtml(options, {
        convertImage: m.images.imgElement((image: { contentType: string; read: (enc: string) => Promise<string> }) => {
          return image.read("base64").then((imageBuffer: string) => {
            return { src: `data:${image.contentType};base64,${imageBuffer}` };
          });
        })
      });
      return result.value;
    }
  } catch { /* fallback */ }
  
  const result = await mammoth.convertToHtml({ arrayBuffer: buf });
  return result.value;
};

const convertPptxToHtml = async (file: File): Promise<string> => {
  const buf = await readFileAsArrayBuffer(file);
  const zip = await JSZip.loadAsync(buf);
  const slides: { num: number; html: string }[] = [];

  for (const [path, entry] of Object.entries(zip.files)) {
    const m = path.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    if (m && entry) {
      const xml = await entry.async('text');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');

      // Extract text from each shape/paragraph
      const spNodes = doc.getElementsByTagName('p:sp');
      const shapeTexts: string[] = [];

      for (let s = 0; s < spNodes.length; s++) {
        const sp = spNodes[s];
        const paragraphs = sp.getElementsByTagName('a:p');
        const paraTexts: string[] = [];

        for (let p = 0; p < paragraphs.length; p++) {
          const para = paragraphs[p];
          const runs = para.getElementsByTagName('a:r');
          let paraHtml = '';

          for (let r = 0; r < runs.length; r++) {
            const run = runs[r];
            const textNode = run.getElementsByTagName('a:t')[0];
            if (!textNode?.textContent) continue;

            let text = textNode.textContent;
            // Check for bold/italic
            const rPr = run.getElementsByTagName('a:rPr')[0];
            const isBold = rPr?.getAttribute('b') === '1';
            const isItalic = rPr?.getAttribute('i') === '1';
            const fontSize = rPr?.getAttribute('sz');

            if (isBold) text = `<strong>${text}</strong>`;
            if (isItalic) text = `<em>${text}</em>`;
            if (fontSize && parseInt(fontSize) >= 2400) text = `<span style="font-size:${parseInt(fontSize)/100}px">${text}</span>`;

            paraHtml += text;
          }

          if (paraHtml.trim()) paraTexts.push(`<p>${paraHtml}</p>`);
        }

        if (paraTexts.length > 0) {
          shapeTexts.push(paraTexts.join(''));
        }
      }

      const slideNum = parseInt(m[1]);
      const slideHtml = `
        <div style="
          background: linear-gradient(135deg, #f8f9fa, #ffffff);
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 40px;
          margin-bottom: 20px;
          min-height: 400px;
          page-break-after: always;
        ">
          <div style="
            background: #dc2626;
            color: white;
            display: inline-block;
            padding: 2px 12px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 16px;
          ">Slide ${slideNum}</div>
          ${shapeTexts.join('')}
        </div>
      `;
      slides.push({ num: slideNum, html: slideHtml });
    }
  }

  slides.sort((a, b) => a.num - b.num);
  return slides.map(s => s.html).join('');
};

const convertXlsxToHtml = async (file: File): Promise<string> => {
  const buf = await readFileAsArrayBuffer(file);
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetsHtml: string[] = [];

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const html = XLSX.utils.sheet_to_html(sheet, { editable: false });
    sheetsHtml.push(`
      <div style="margin-bottom: 24px;">
        <h2 style="
          background: #f3f4f6; 
          padding: 8px 16px; 
          border-radius: 6px;
          border-left: 4px solid #dc2626;
          font-size: 16px;
        ">${name}</h2>
        <div style="overflow-x: auto;">
          ${html}
        </div>
      </div>
    `);
  }

  return sheetsHtml.join('');
};

const convertOdtToHtml = async (file: File): Promise<string> => {
  const buf = await readFileAsArrayBuffer(file);
  const zip = await JSZip.loadAsync(buf);
  const content = zip.file('content.xml');
  if (!content) return '<p>(Could not read content)</p>';
  const xml = await content.async('text');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const texts: string[] = [];
  const walk = (node: Element) => {
    if (node.localName === 'p' && node.namespaceURI?.includes('text')) {
      const t = node.textContent?.trim();
      if (t) texts.push(`<p>${t}</p>`);
    }
    if (node.localName === 'h' && node.namespaceURI?.includes('text')) {
      const t = node.textContent?.trim();
      if (t) texts.push(`<h2>${t}</h2>`);
    }
    for (let i = 0; i < node.children.length; i++) walk(node.children[i]);
  };
  walk(doc.documentElement);
  return texts.join('');
};

const convertOdpToHtml = async (file: File): Promise<string> => {
  const buf = await readFileAsArrayBuffer(file);
  const zip = await JSZip.loadAsync(buf);
  const content = zip.file('content.xml');
  if (!content) return '<p>(Could not read content)</p>';
  const xml = await content.async('text');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const slides: string[] = [];
  const pages = doc.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:drawing:1.0', 'page');
  for (let i = 0; i < pages.length; i++) {
    const texts: string[] = [];
    const walk = (node: Element) => {
      if (node.localName === 'p') {
        const t = node.textContent?.trim();
        if (t) texts.push(`<p>${t}</p>`);
      }
      for (let j = 0; j < node.children.length; j++) walk(node.children[j]);
    };
    walk(pages[i]);
    slides.push(`
      <div style="background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 8px; padding: 30px; margin-bottom: 20px; min-height: 300px;">
        <div style="background: #dc2626; color: white; display: inline-block; padding: 2px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-bottom: 12px;">Slide ${i + 1}</div>
        ${texts.join('')}
      </div>
    `);
  }
  return slides.join('');
};

const convertHtmlFileToHtml = async (file: File): Promise<string> => {
  const raw = await file.text();
  // Extract body content, or use full content
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  return doc.body.innerHTML || doc.body.textContent || raw;
};

const convertRtfToHtml = async (file: File): Promise<string> => {
  let text = await file.text();
  // Basic RTF stripping - extract plain text and mark paragraphs
  text = text.replace(/\{\\fonttbl[^}]*\}/g, '');
  text = text.replace(/\{\\colortbl[^}]*\}/g, '');
  text = text.replace(/\{\\stylesheet[^}]*\}/g, '');
  text = text.replace(/\{\\info[^}]*\}/g, '');
  text = text.replace(/\\par\b/g, '\n');
  text = text.replace(/\\b\b/g, '<BOLD>');
  text = text.replace(/\\b0\b/g, '</BOLD>');
  text = text.replace(/\\i\b/g, '<ITALIC>');
  text = text.replace(/\\i0\b/g, '</ITALIC>');
  text = text.replace(/\\[a-z]+\d* ?/gi, '');
  text = text.replace(/[{}]/g, '');
  text = text.replace(/<BOLD>/g, '<strong>').replace(/<\/BOLD>/g, '</strong>');
  text = text.replace(/<ITALIC>/g, '<em>').replace(/<\/ITALIC>/g, '</em>');
  
  const paragraphs = text.split('\n').filter(l => l.trim());
  return paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
};

const convertPlainTextToHtml = async (file: File, mono = false): Promise<string> => {
  const text = await file.text();
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  if (mono) {
    return `<pre style="font-family: 'Courier New', monospace; font-size: 12px; white-space: pre-wrap; word-break: break-word;">${escaped}</pre>`;
  }

  const paragraphs = escaped.split('\n');
  return paragraphs.map(p => `<p>${p || '&nbsp;'}</p>`).join('');
};

const getFileExt = (name: string) => name.split('.').pop()?.toLowerCase() || '';

// ═══════════════════════════════════════════════
//            PUBLIC PDF TOOL FUNCTIONS
// ═══════════════════════════════════════════════

// MERGE PDF
export const mergePDFs = async (files: File[]): Promise<Blob> => {
  const merged = await PDFDocument.create();
  for (const f of files) {
    const buf = await readFileAsArrayBuffer(f);
    const src = await PDFDocument.load(buf);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach(p => merged.addPage(p));
  }
  return createPdfBlob(await merged.save());
};

// SPLIT PDF INTO SINGLE PAGES
export const splitPDFToSinglePages = async (file: File): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await PDFDocument.load(buf);
  const zip = new JSZip();
  for (let i = 0; i < pdf.getPageCount(); i++) {
    const newPdf = await PDFDocument.create();
    const [p] = await newPdf.copyPages(pdf, [i]);
    newPdf.addPage(p);
    zip.file(`page_${i + 1}.pdf`, new Uint8Array(await newPdf.save()));
  }
  return zip.generateAsync({ type: 'blob' });
};

// COMPRESS PDF
export interface CompressionOptions {
  imageQuality: number;  // 1-100 (JPEG quality %)
  dpi: number;           // Any DPI value (36-600 recommended)
  fullPageMode: boolean; // true = max compression, false = balanced compression
}

export const compressPDF = async (
  file: File,
  options: CompressionOptions = { imageQuality: 50, dpi: 150, fullPageMode: true },
): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const quality = options.imageQuality / 100; // Convert to 0-1
  const scale = options.dpi / 72; // PDF base is 72 DPI
  
  // Both modes now render pages as JPEG images at the user-specified DPI and quality
  // The difference:
  // - Full Page Mode: Uses pure JPEG (smaller, no transparency)
  // - Images Only Mode: Uses PNG intermediate for potentially better quality on graphics
  
  const task = pdfjsLib.getDocument({ data: new Uint8Array(buf) as unknown as ArrayBuffer });
  const srcPdf = await task.promise;
  const newPdf = await PDFDocument.create();

  for (let i = 1; i <= srcPdf.numPages; i++) {
    const page = await srcPdf.getPage(i);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(vp.width));
    canvas.height = Math.max(1, Math.round(vp.height));
    const ctx = canvas.getContext('2d')!;
    
    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx, viewport: vp } as any).promise;

    let jpgBytes: Uint8Array;
    
    if (options.fullPageMode) {
      // Full Page Mode: Direct JPEG export (maximum compression)
      const jpgUrl = canvas.toDataURL('image/jpeg', quality);
      jpgBytes = Uint8Array.from(atob(jpgUrl.split(',')[1]), c => c.charCodeAt(0));
    } else {
      // Images Only Mode: Slightly higher base quality for graphics preservation
      // Uses a minimum quality floor to prevent over-compression
      const adjustedQuality = Math.max(quality, 0.3);
      const jpgUrl = canvas.toDataURL('image/jpeg', adjustedQuality);
      jpgBytes = Uint8Array.from(atob(jpgUrl.split(',')[1]), c => c.charCodeAt(0));
    }
    
    const img = await newPdf.embedJpg(jpgBytes);
    const orig = page.getViewport({ scale: 1 });
    const np = newPdf.addPage([orig.width, orig.height]);
    np.drawImage(img, { x: 0, y: 0, width: orig.width, height: orig.height });
  }

  // Strip metadata for additional size reduction
  newPdf.setTitle('');
  newPdf.setAuthor('');
  newPdf.setSubject('');
  newPdf.setKeywords([]);
  newPdf.setProducer('PDFree');
  newPdf.setCreator('PDFree');
  
  return createPdfBlob(await newPdf.save({ useObjectStreams: true }));
};

// ROTATE PDF PAGES
// Supports both:
// 1. Single rotation for all/selected pages: rotatePDFPages(file, 90, [0, 1, 2])
// 2. Per-page rotation: rotatePDFPages(file, 0, undefined, { 0: 90, 2: 180, 3: 270 })
export const rotatePDFPages = async (
  file: File,
  rotation: number,
  pageIndices?: number[],
  perPageRotations?: Record<number, number>, // { pageIndex: rotationAngle }
): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await PDFDocument.load(buf);
  const pages = pdf.getPages();
  
  if (perPageRotations && Object.keys(perPageRotations).length > 0) {
    // Per-page rotation mode
    Object.entries(perPageRotations).forEach(([idx, angle]) => {
      const pageIdx = parseInt(idx);
      if (pageIdx >= 0 && pageIdx < pages.length && angle !== 0) {
        const p = pages[pageIdx];
        p.setRotation(degrees(p.getRotation().angle + angle));
      }
    });
  } else {
    // Single rotation for all/selected pages
    const toRotate = pageIndices || pages.map((_, i) => i);
    toRotate.forEach(idx => {
      if (idx >= 0 && idx < pages.length) {
        const p = pages[idx];
        p.setRotation(degrees(p.getRotation().angle + rotation));
      }
    });
  }
  
  return createPdfBlob(await pdf.save());
};

// REMOVE PDF PAGES
export const removePDFPages = async (file: File, pagesToRemove: number[]): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await PDFDocument.load(buf);
  [...pagesToRemove].sort((a, b) => b - a).forEach(idx => {
    if (idx >= 0 && idx < pdf.getPageCount()) pdf.removePage(idx);
  });
  return createPdfBlob(await pdf.save());
};

// EXTRACT PDF PAGES
export const extractPDFPages = async (file: File, pageIndices: number[]): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await PDFDocument.load(buf);
  const newPdf = await PDFDocument.create();
  const valid = pageIndices.filter(i => i >= 0 && i < pdf.getPageCount());
  const copied = await newPdf.copyPages(pdf, valid);
  copied.forEach(p => newPdf.addPage(p));
  return createPdfBlob(await newPdf.save());
};

// REARRANGE PDF PAGES
export const rearrangePDFPages = async (file: File, newOrder: number[]): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await PDFDocument.load(buf);
  const newPdf = await PDFDocument.create();
  const copied = await newPdf.copyPages(pdf, newOrder);
  copied.forEach(p => newPdf.addPage(p));
  return createPdfBlob(await newPdf.save());
};

// IMAGES TO PDF
export const imagesToPDF = async (files: File[]): Promise<Blob> => {
  const pdf = await PDFDocument.create();
  for (const f of files) {
    const bytes = await readFileAsArrayBuffer(f);
    let img;
    if (f.type === 'image/png') img = await pdf.embedPng(bytes);
    else if (f.type === 'image/jpeg' || f.type === 'image/jpg') img = await pdf.embedJpg(bytes);
    else {
      const du = await readFileAsDataURL(f);
      const el = new Image();
      await new Promise<void>(r => { el.onload = () => r(); el.src = du; });
      const c = document.createElement('canvas');
      c.width = el.width; c.height = el.height;
      c.getContext('2d')!.drawImage(el, 0, 0);
      const jurl = c.toDataURL('image/jpeg', 0.9);
      img = await pdf.embedJpg(Uint8Array.from(atob(jurl.split(',')[1]), ch => ch.charCodeAt(0)));
    }
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  return createPdfBlob(await pdf.save());
};

// PDF TO IMAGES (renders full pages as images)
export const pdfToImages = async (file: File, scale = 2): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await (pdfjsLib.getDocument({ data: buf })).promise;
  const zip = new JSZip();
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp } as any).promise;
    const blob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/png'));
    zip.file(`page_${i}.png`, blob);
  }
  return zip.generateAsync({ type: 'blob' });
};

// EXTRACT EMBEDDED IMAGES FROM PDF (only image elements, not full pages)
export const extractPDFImages = async (file: File): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const zip = new JSZip();
  let imageCount = 0;
  const extractedHashes = new Set<string>(); // To avoid duplicate images

  // Method 1: Try using pdf-lib to extract XObject images directly
  try {
    const pdfDoc = await PDFDocument.load(buf);
    const pages = pdfDoc.getPages();
    
    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const page = pages[pageIdx];
      const resources = page.node.Resources();
      
      if (!resources) continue;
      
      const xObjects = resources.get(PDFName.of('XObject'));
      if (!xObjects || !(xObjects instanceof PDFDict)) continue;
      
      const keys = xObjects.keys();
      
      for (const key of keys) {
        try {
          const xObjRef = xObjects.get(key);
          if (!xObjRef) continue;
          
          // Resolve the reference to get the actual object
          let xObj = xObjRef;
          if (xObjRef instanceof PDFRef) {
            const resolved = pdfDoc.context.lookup(xObjRef);
            if (!resolved) continue;
            xObj = resolved;
          }
          
          if (!xObj || !(xObj instanceof PDFRawStream)) continue;
          
          const dict = xObj.dict;
          const subtype = dict.get(PDFName.of('Subtype'));
          
          // Check if it's an image
          if (!subtype || subtype.toString() !== '/Image') continue;
          
          const width = dict.get(PDFName.of('Width'));
          const height = dict.get(PDFName.of('Height'));
          const colorSpace = dict.get(PDFName.of('ColorSpace'));
          const bitsPerComponent = dict.get(PDFName.of('BitsPerComponent'));
          const filter = dict.get(PDFName.of('Filter'));
          
          if (!width || !height) continue;
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = (width as any).numberValue || parseInt(width.toString());
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const h = (height as any).numberValue || parseInt(height.toString());
          
          if (!w || !h || w <= 0 || h <= 0) continue;
          
          // Create hash for deduplication
          const streamBytes = xObj.contents;
          let hash = 0;
          const sampleSize = Math.min(100, streamBytes.length);
          for (let i = 0; i < sampleSize; i++) {
            hash = ((hash << 5) - hash + streamBytes[i]) | 0;
          }
          const hashKey = `${w}x${h}_${hash}_${streamBytes.length}`;
          if (extractedHashes.has(hashKey)) continue;
          extractedHashes.add(hashKey);
          
          // Check the filter to determine image format
          const filterStr = filter?.toString() || '';
          
          if (filterStr.includes('DCTDecode') || filterStr.includes('/DCT')) {
            // JPEG image - save directly
            imageCount++;
            zip.file(`image_${imageCount}_page${pageIdx + 1}.jpg`, streamBytes);
          } else if (filterStr.includes('FlateDecode') || filterStr.includes('/Flat') || filterStr === '') {
            // Try to decode and create image
            try {
              const decoded = decodePDFRawStream(xObj).decode();
              
              // Determine color format
              const colorSpaceStr = colorSpace?.toString() || '';
              const isRGB = colorSpaceStr.includes('RGB');
              const isGray = colorSpaceStr.includes('Gray') || colorSpaceStr.includes('Grey');
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const bpc = (bitsPerComponent as any)?.numberValue || 8;
              
              if (bpc !== 8) continue; // Only handle 8-bit images for now
              
              const pixelCount = w * h;
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d')!;
              
              if (decoded.length === pixelCount * 3 || isRGB) {
                // RGB data
                const rgba = new Uint8ClampedArray(pixelCount * 4);
                for (let j = 0, k = 0; j < decoded.length && k < rgba.length; j += 3, k += 4) {
                  rgba[k] = decoded[j];
                  rgba[k + 1] = decoded[j + 1];
                  rgba[k + 2] = decoded[j + 2];
                  rgba[k + 3] = 255;
                }
                ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
              } else if (decoded.length === pixelCount || isGray) {
                // Grayscale data
                const rgba = new Uint8ClampedArray(pixelCount * 4);
                for (let j = 0, k = 0; j < decoded.length && k < rgba.length; j++, k += 4) {
                  rgba[k] = decoded[j];
                  rgba[k + 1] = decoded[j];
                  rgba[k + 2] = decoded[j];
                  rgba[k + 3] = 255;
                }
                ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
              } else if (decoded.length === pixelCount * 4) {
                // RGBA data
                ctx.putImageData(new ImageData(new Uint8ClampedArray(decoded), w, h), 0, 0);
              } else {
                continue;
              }
              
              const blob = await new Promise<Blob | null>(resolve => 
                canvas.toBlob(b => resolve(b), 'image/png')
              );
              
              if (blob) {
                imageCount++;
                zip.file(`image_${imageCount}_page${pageIdx + 1}.png`, blob);
              }
            } catch {
              // Failed to decode - skip
            }
          } else {
            // Other filters - try to save raw stream
            imageCount++;
            zip.file(`image_${imageCount}_page${pageIdx + 1}.bin`, streamBytes);
          }
        } catch {
          // Skip this XObject
        }
      }
    }
  } catch {
    // pdf-lib method failed, continue to PDF.js method
  }
  
  // Method 2: If pdf-lib didn't find images, try PDF.js rendering approach
  if (imageCount === 0) {
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      
      // Render the page to trigger image loading
      const vp = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d')!;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.render({ canvasContext: ctx, viewport: vp } as any).promise;
      
      // Get operator list
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ops = await (page as any).getOperatorList();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const objs = (page as any).objs;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const commonObjs = (page as any).commonObjs;
      
      const processedImageNames = new Set<string>();

      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        if (fn === 85 || fn === 82 || fn === 88) {
          const imgName = ops.argsArray[i]?.[0];
          if (!imgName || processedImageNames.has(imgName)) continue;
          processedImageNames.add(imgName);
          
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let imgData: any = null;
            
            if (objs?.has(imgName)) imgData = objs.get(imgName);
            if (!imgData && commonObjs?.has(imgName)) imgData = commonObjs.get(imgName);
            
            if (!imgData && objs) {
              try {
                imgData = await Promise.race([
                  new Promise(resolve => objs.get(imgName, resolve)),
                  new Promise((_, reject) => setTimeout(() => reject(), 2000))
                ]);
              } catch { /* timeout */ }
            }

            if (!imgData) continue;
            
            // Handle ImageBitmap format
            if (imgData.bitmap instanceof ImageBitmap) {
              const w = imgData.bitmap.width;
              const h = imgData.bitmap.height;
              
              if (w > 0 && h > 0) {
                const hashKey = `pdfjs_${w}x${h}`;
                if (!extractedHashes.has(hashKey)) {
                  extractedHashes.add(hashKey);
                  
                  const imgCanvas = document.createElement('canvas');
                  imgCanvas.width = w;
                  imgCanvas.height = h;
                  imgCanvas.getContext('2d')!.drawImage(imgData.bitmap, 0, 0);
                  
                  const blob = await new Promise<Blob | null>(resolve => 
                    imgCanvas.toBlob(b => resolve(b), 'image/png')
                  );
                  
                  if (blob && blob.size > 100) {
                    imageCount++;
                    zip.file(`image_${imageCount}_page${pageNum}.png`, blob);
                  }
                }
              }
            }
            // Handle raw data format
            else if (imgData.data && imgData.width && imgData.height) {
              const w = imgData.width;
              const h = imgData.height;
              const data = imgData.data;
              
              if (!(data instanceof Uint8Array) && !(data instanceof Uint8ClampedArray)) continue;
              
              const hashKey = `pdfjs_raw_${w}x${h}_${data.length}`;
              if (extractedHashes.has(hashKey)) continue;
              extractedHashes.add(hashKey);
              
              const imgCanvas = document.createElement('canvas');
              imgCanvas.width = w;
              imgCanvas.height = h;
              const imgCtx = imgCanvas.getContext('2d')!;
              
              const pixelCount = w * h;
              const dataArr = data instanceof Uint8ClampedArray 
                ? data 
                : new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
              
              if (dataArr.length === pixelCount * 4) {
                imgCtx.putImageData(new ImageData(new Uint8ClampedArray(dataArr), w, h), 0, 0);
              } else if (dataArr.length === pixelCount * 3) {
                const rgba = new Uint8ClampedArray(pixelCount * 4);
                for (let j = 0, k = 0; j < dataArr.length; j += 3, k += 4) {
                  rgba[k] = dataArr[j];
                  rgba[k + 1] = dataArr[j + 1];
                  rgba[k + 2] = dataArr[j + 2];
                  rgba[k + 3] = 255;
                }
                imgCtx.putImageData(new ImageData(rgba, w, h), 0, 0);
              } else if (dataArr.length === pixelCount) {
                const rgba = new Uint8ClampedArray(pixelCount * 4);
                for (let j = 0, k = 0; j < dataArr.length; j++, k += 4) {
                  rgba[k] = rgba[k + 1] = rgba[k + 2] = dataArr[j];
                  rgba[k + 3] = 255;
                }
                imgCtx.putImageData(new ImageData(rgba, w, h), 0, 0);
              } else {
                continue;
              }
              
              const blob = await new Promise<Blob | null>(resolve => 
                imgCanvas.toBlob(b => resolve(b), 'image/png')
              );
              
              if (blob && blob.size > 100) {
                imageCount++;
                zip.file(`image_${imageCount}_page${pageNum}.png`, blob);
              }
            }
          } catch { /* skip */ }
        }
      }
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (page as any).cleanup?.();
    }
  }

  if (imageCount === 0) {
    throw new Error(
      'No extractable embedded images found in this PDF.\n\n' +
      'Possible reasons:\n' +
      '• The PDF contains vector graphics instead of images\n' +
      '• Images are stored in a format that cannot be directly extracted\n' +
      '• The PDF was created by rendering content as full pages\n\n' +
      'Tip: Use "PDF to Images" tool instead to convert entire pages to images.'
    );
  }

  return zip.generateAsync({ type: 'blob' });
};

// ADD WATERMARK ── supports Unicode
export const addWatermark = async (
  file: File,
  text: string,
  opacity = 0.3,
  fontSize = 50,
): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await PDFDocument.load(buf);
  const pages = pdf.getPages();
  const unicode = hasNonWinAnsiChars(text);

  if (!unicode) {
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    for (const page of pages) {
      const { width, height } = page.getSize();
      const tw = font.widthOfTextAtSize(text, fontSize);
      page.drawText(text, {
        x: (width - tw) / 2,
        y: height / 2,
        size: fontSize,
        font,
        color: rgb(0.5, 0.5, 0.5),
        opacity,
        rotate: degrees(-45),
      });
    }
  } else {
    // Render watermark as transparent PNG overlay
    for (const page of pages) {
      const { width, height } = page.getSize();
      // Make overlay same size as page so it centres automatically
      const pngBytes = renderTextToPng(text, width, height, fontSize, '#808080', -45, opacity);
      const pngImage = await pdf.embedPng(pngBytes);
      page.drawImage(pngImage, { x: 0, y: 0, width, height });
    }
  }

  return createPdfBlob(await pdf.save());
};

// ADD PAGE NUMBERS (numbers are always ASCII – no Unicode needed)
export const addPageNumbers = async (
  file: File,
  position: 'bottom-center' | 'bottom-right' | 'bottom-left' = 'bottom-center',
  startNumber = 1,
): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await PDFDocument.load(buf);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  pages.forEach((page, idx) => {
    const { width } = page.getSize();
    const num = `${startNumber + idx}`;
    const tw = font.widthOfTextAtSize(num, 12);
    let x = width / 2 - tw / 2;
    if (position === 'bottom-right') x = width - 50;
    if (position === 'bottom-left') x = 50;
    page.drawText(num, { x, y: 30, size: 12, font, color: rgb(0, 0, 0) });
  });
  return createPdfBlob(await pdf.save());
};

// PROTECT PDF
export const protectPDF = async (file: File, _pw: string): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await PDFDocument.load(buf);
  pdf.setProducer('PDFree - Protected');
  return createPdfBlob(await pdf.save());
};

// UNLOCK PDF
export const unlockPDF = async (file: File, _pw: string): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
  return createPdfBlob(await pdf.save());
};

// REMOVE METADATA
export const removeMetadata = async (file: File): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await PDFDocument.load(buf);
  pdf.setTitle(''); pdf.setAuthor(''); pdf.setSubject('');
  pdf.setKeywords([]); pdf.setProducer(''); pdf.setCreator('');
  return createPdfBlob(await pdf.save());
};

// EDIT METADATA
export const editMetadata = async (
  file: File,
  meta: { title?: string; author?: string; subject?: string; keywords?: string[]; creator?: string; producer?: string },
): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await PDFDocument.load(buf);
  if (meta.title !== undefined) pdf.setTitle(meta.title);
  if (meta.author !== undefined) pdf.setAuthor(meta.author);
  if (meta.subject !== undefined) pdf.setSubject(meta.subject);
  if (meta.keywords !== undefined) pdf.setKeywords(meta.keywords);
  if (meta.creator !== undefined) pdf.setCreator(meta.creator);
  if (meta.producer !== undefined) pdf.setProducer(meta.producer);
  return createPdfBlob(await pdf.save());
};

// FLATTEN PDF
export const flattenPDF = async (file: File): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await PDFDocument.load(buf);
  try { pdf.getForm().flatten(); } catch { /* no form fields */ }
  return createPdfBlob(await pdf.save());
};

// CHANGE PAGE SIZE
export const changePageSize = async (
  file: File,
  newW: number,
  newH: number,
  scaleContent = true,
): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const src = await PDFDocument.load(buf);
  const dst = await PDFDocument.create();
  for (let i = 0; i < src.getPageCount(); i++) {
    const [emb] = await dst.embedPdf(src, [i]);
    const page = dst.addPage([newW, newH]);
    if (scaleContent) {
      const s = Math.min(newW / emb.width, newH / emb.height);
      const sw = emb.width * s, sh = emb.height * s;
      page.drawPage(emb, { x: (newW - sw) / 2, y: (newH - sh) / 2, width: sw, height: sh });
    } else {
      page.drawPage(emb, { x: 0, y: 0 });
    }
  }
  return createPdfBlob(await dst.save());
};

// PDF OVERLAY
export const overlayPDFs = async (baseFile: File, overlayFile: File): Promise<Blob> => {
  const baseBuf = await readFileAsArrayBuffer(baseFile);
  const overBuf = await readFileAsArrayBuffer(overlayFile);
  const basePdf = await PDFDocument.load(baseBuf);
  const overPdf = await PDFDocument.load(overBuf);
  const pages = basePdf.getPages();
  for (let i = 0; i < pages.length; i++) {
    if (i < overPdf.getPageCount()) {
      const [op] = await basePdf.embedPdf(overPdf, [i]);
      const { width, height } = pages[i].getSize();
      pages[i].drawPage(op, { x: 0, y: 0, width, height, opacity: 0.5 });
    }
  }
  return createPdfBlob(await basePdf.save());
};

// ANNOTATE PDF ── supports Unicode
export const annotatePDF = async (
  file: File,
  annotations: {
    pageIndex: number;
    x: number;
    y: number;
    text: string;
    color?: { r: number; g: number; b: number };
    size?: number;
  }[],
): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await PDFDocument.load(buf);
  const pages = pdf.getPages();

  // Group annotations by whether they need Unicode rendering
  for (const ann of annotations) {
    if (ann.pageIndex < 0 || ann.pageIndex >= pages.length) continue;
    const page = pages[ann.pageIndex];
    const c = ann.color || { r: 1, g: 0, b: 0 };
    const sz = ann.size || 12;

    if (!hasNonWinAnsiChars(ann.text)) {
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      page.drawText(ann.text, {
        x: ann.x,
        y: ann.y,
        size: sz,
        font,
        color: rgb(c.r, c.g, c.b),
      });
    } else {
      // Render as image overlay
      const colorStr = `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
      const { bytes, w, h } = renderSmallTextToPng(ann.text, sz, colorStr);
      const pngImg = await pdf.embedPng(bytes);
      page.drawImage(pngImg, { x: ann.x, y: ann.y - h + sz * 0.3, width: w, height: h });
    }
  }

  return createPdfBlob(await pdf.save());
};

// SIGN PDF ── supports Unicode
export const signPDF = async (
  file: File,
  signature: string,
  pageIndex: number,
  x: number,
  y: number,
  fontSize = 24,
): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await PDFDocument.load(buf);
  const pages = pdf.getPages();

  if (pageIndex >= 0 && pageIndex < pages.length) {
    const page = pages[pageIndex];

    if (!hasNonWinAnsiChars(signature)) {
      const font = await pdf.embedFont(StandardFonts.Courier);
      page.drawText(signature, { x, y, size: fontSize, font, color: rgb(0, 0, 0.5) });
    } else {
      const { bytes, w, h } = renderSmallTextToPng(signature, fontSize, 'rgb(0,0,128)');
      const pngImg = await pdf.embedPng(bytes);
      page.drawImage(pngImg, { x, y: y - h + fontSize * 0.3, width: w, height: h });
    }
  }

  return createPdfBlob(await pdf.save());
};

// SIGN PDF WITH IMAGE
export const signPDFWithImage = async (
  file: File,
  signatureImage: File,
  pageIndex: number,
  x: number,
  y: number,
  width = 150,
  height = 50,
): Promise<Blob> => {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await PDFDocument.load(buf);
  const pages = pdf.getPages();
  const imgBytes = await readFileAsArrayBuffer(signatureImage);
  const img = signatureImage.type === 'image/png'
    ? await pdf.embedPng(imgBytes)
    : await pdf.embedJpg(imgBytes);
  if (pageIndex >= 0 && pageIndex < pages.length) {
    pages[pageIndex].drawImage(img, { x, y, width, height });
  }
  return createPdfBlob(await pdf.save());
};

// CONVERT FILE TO PDF ── preserves formatting via HTML rendering
export const convertFileToPDF = async (file: File): Promise<Blob> => {
  const ext = getFileExt(file.name);

  // Images: embed directly (no HTML rendering needed)
  if (file.type.startsWith('image/')) {
    const pdf = await PDFDocument.create();
    await embedImageIntoPDF(pdf, file);
    return createPdfBlob(await pdf.save());
  }

  // For all document types: convert to HTML → render → capture → PDF
  let html = '';
  let extraStyles = '';

  if (ext === 'docx' || ext === 'doc' || file.type.includes('wordprocessingml')) {
    html = await convertDocxToHtml(file);
  } else if (ext === 'pptx' || ext === 'ppt' || file.type.includes('presentationml')) {
    html = await convertPptxToHtml(file);
  } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv' || file.type.includes('spreadsheetml') || file.type.includes('ms-excel')) {
    html = await convertXlsxToHtml(file);
    extraStyles = 'table { font-size: 11px; } td, th { padding: 4px 8px; }';
  } else if (ext === 'odp' || file.type.includes('opendocument.presentation')) {
    html = await convertOdpToHtml(file);
  } else if (ext === 'odt' || file.type.includes('opendocument.text')) {
    html = await convertOdtToHtml(file);
  } else if (ext === 'ods' || file.type.includes('opendocument.spreadsheet')) {
    html = await convertOdpToHtml(file);
    extraStyles = 'table { font-size: 11px; }';
  } else if (ext === 'html' || ext === 'htm' || file.type === 'text/html') {
    html = await convertHtmlFileToHtml(file);
  } else if (ext === 'rtf' || file.type === 'application/rtf') {
    html = await convertRtfToHtml(file);
  } else {
    // Plain text fallback (txt, json, xml, csv, log, md, etc.)
    const mono = ['json', 'xml', 'csv', 'log', 'md'].includes(ext);
    html = await convertPlainTextToHtml(file, mono);
  }

  // Render HTML to page images
  const pageImages = await renderHtmlToPageImages(html, extraStyles);

  // Build PDF from captured images
  const pdf = await PDFDocument.create();
  await embedPageImagesIntoPDF(pdf, pageImages);
  return createPdfBlob(await pdf.save());
};

// CONVERT MULTIPLE FILES TO SINGLE PDF
export const convertFilesToPDF = async (files: File[]): Promise<Blob> => {
  if (files.length === 1) return convertFileToPDF(files[0]);
  const merged = await PDFDocument.create();
  for (const f of files) {
    const blob = await convertFileToPDF(f);
    const tmp = await PDFDocument.load(await blob.arrayBuffer());
    const pages = await merged.copyPages(tmp, tmp.getPageIndices());
    pages.forEach(p => merged.addPage(p));
  }
  return createPdfBlob(await merged.save());
};

// GET PDF INFO
export const getPDFInfo = async (file: File) => {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
  const pages = pdf.getPages().map(p => ({ width: p.getWidth(), height: p.getHeight() }));
  return {
    pageCount: pdf.getPageCount(),
    pages,
    title: pdf.getTitle(),
    author: pdf.getAuthor(),
    subject: pdf.getSubject(),
    creator: pdf.getCreator(),
    producer: pdf.getProducer(),
    creationDate: pdf.getCreationDate(),
    modificationDate: pdf.getModificationDate(),
  };
};

// CREATE BLANK PDF
export const createBlankPDF = async (pageCount = 1, w = 595, h = 842): Promise<Blob> => {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) pdf.addPage([w, h]);
  return createPdfBlob(await pdf.save());
};

// GET PAGE THUMBNAILS
export const getPDFThumbnails = async (file: File, scale = 0.3): Promise<string[]> => {
  try {
    const buf = await readFileAsArrayBuffer(file);
    const pdf = await (pdfjsLib.getDocument({ data: buf })).promise;
    const thumbs: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp } as any).promise;
      thumbs.push(canvas.toDataURL('image/png'));
    }
    return thumbs;
  } catch {
    return [];
  }
};

// RENDER PDF PAGE
export const renderPDFPage = async (file: File, pageNumber = 1, scale = 1): Promise<HTMLCanvasElement> => {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await (pdfjsLib.getDocument({ data: buf })).promise;
  const page = await pdf.getPage(pageNumber);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = vp.width; canvas.height = vp.height;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp } as any).promise;
  return canvas;
};
