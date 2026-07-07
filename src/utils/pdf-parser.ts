import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let workerSrcSet = false;

function ensureWorker(): void {
  if (!workerSrcSet) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    workerSrcSet = true;
  }
}

export async function extractTextFromPDF(file: File): Promise<string> {
  ensureWorker();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str).join(' ');
    pages.push(text);
  }

  const result = pages.join('\n\n').trim();
  if (!result) {
    throw new Error(
      'No selectable text found in this PDF. It may be a scanned image without an OCR text layer.',
    );
  }
  return result;
}
