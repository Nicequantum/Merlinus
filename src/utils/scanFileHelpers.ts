import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const MAX_PDF_PAGES = 12;
const PDF_RENDER_SCALE = 2;

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

async function pdfPageToFile(pdf: pdfjs.PDFDocumentProxy, pageNum: number, sourceName: string): Promise<File> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available for PDF rendering');

  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to render PDF page'))),
      'image/jpeg',
      0.92
    );
  });

  const base = sourceName.replace(/\.pdf$/i, '') || 'document';
  return new File([blob], `${base}-page-${pageNum}.jpg`, { type: 'image/jpeg' });
}

export async function expandPdfToImageFiles(file: File): Promise<File[]> {
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const pages: File[] = [];

  for (let i = 1; i <= pageCount; i++) {
    pages.push(await pdfPageToFile(pdf, i, file.name));
  }

  return pages;
}

/** Flatten a mixed batch of images and PDFs into image files ready for upload/OCR. */
export async function normalizeScanFiles(files: File[]): Promise<File[]> {
  const normalized: File[] = [];

  for (const file of files) {
    if (isPdfFile(file)) {
      const pages = await expandPdfToImageFiles(file);
      normalized.push(...pages);
      continue;
    }
    if (file.type.startsWith('image/')) {
      normalized.push(file);
    }
  }

  return normalized;
}