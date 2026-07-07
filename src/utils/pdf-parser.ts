import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let workerSrcSet = false;

function ensureWorker(): void {
  if (!workerSrcSet) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    workerSrcSet = true;
  }
}

interface Block {
  str: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
}

function pdfToMarkdown(content: { items: any[]; styles: Record<string, { fontFamily: string }> }): string {
  const blocks: Block[] = [];

  for (const item of content.items) {
    if ('str' in item && item.str.trim()) {
      const style = content.styles[item.fontName];
      blocks.push({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        fontSize: item.height || item.transform[0],
        fontFamily: style?.fontFamily || '',
      });
    }
  }

  if (blocks.length === 0) return '';

  const Y_TOL = 3;
  blocks.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: Block[][] = [];
  let curLine: Block[] = [blocks[0]];
  for (let i = 1; i < blocks.length; i++) {
    if (Math.abs(blocks[i].y - curLine[0].y) <= Y_TOL) {
      curLine.push(blocks[i]);
    } else {
      lines.push(curLine);
      curLine = [blocks[i]];
    }
  }
  lines.push(curLine);

  const fontSizes = blocks.map(b => b.fontSize).filter(s => s > 0);
  const medianSize = fontSizes.length > 0
    ? fontSizes.sort((a, b) => a - b)[Math.floor(fontSizes.length / 2)]
    : 12;

  const pageWidth = Math.max(...blocks.map(b => b.x + Math.abs(b.fontSize))) || 612;

  function isHeading(blocks: Block[]): number {
    if (blocks.length === 0) return 0;
    const avgSize = blocks.reduce((s, b) => s + b.fontSize, 0) / blocks.length;
    if (avgSize > medianSize * 1.35) return avgSize > medianSize * 1.8 ? 1 : 2;
    return 0;
  }

  function isListItem(blocks: Block[]): boolean {
    const text = blocks.map(b => b.str).join('').trim();
    return /^[\d]+[.)]\s|^[•▪●○■□➢➤▶◆◇–—]\s|^[-*+]\s|^\(\d+\)\s|^[a-zA-Z][.)]\s/.test(text);
  }

  function textOf(blocks: Block[]): string {
    return blocks.map(b => b.str).join('');
  }

  function boldFonts(blocks: Block[]): boolean {
    return blocks.some(b =>
      /bold|black|heavy|demi/i.test(b.fontFamily) &&
      !/light|thin|book/i.test(b.fontFamily)
    );
  }

  function detectTable(lines: Block[][]): string | null {
    if (lines.length < 2) return null;
    const colPositions = findColumns(lines);
    if (!colPositions || colPositions.length < 2) return null;
    return formatTable(lines, colPositions);
  }

  function findColumns(rows: Block[][]): number[] | null {
    const candidates = new Map<number, number>();
    for (const row of rows) {
      for (const b of row) {
        const cx = Math.round(b.x);
        candidates.set(cx, (candidates.get(cx) || 0) + 1);
      }
    }
    const sorted = [...candidates.entries()]
      .filter(([_, count]) => count >= Math.max(2, rows.length * 0.3))
      .sort((a, b) => a[0] - b[0]);
    if (sorted.length < 2) return null;
    if (sorted[0][0] > 20) sorted.unshift([0, rows.length]);
    return sorted.map(([x]) => x);
  }

  function formatTable(rows: Block[][], cols: number[]): string {
    const lines: string[] = [];
    for (let ri = 0; ri < rows.length; ri++) {
      const row = [...rows[ri]].sort((a, b) => a.x - b.x);
      const cells: string[] = [];
      for (let ci = 0; ci < cols.length; ci++) {
        const colX = cols[ci];
        const nextX = ci < cols.length - 1 ? cols[ci + 1] : Infinity;
        const cellBlocks = row.filter(b => b.x >= colX && b.x < nextX);
        cells.push(cellBlocks.map(b => b.str).join(' ').trim());
      }
      const last = cells.pop() || '';
      const rowStr = '| ' + cells.join(' | ') + ' | ' + last + ' |';
      lines.push(rowStr);
      if (ri === 0) {
        lines.push('| ' + cells.map(() => '---').join(' | ') + ' | ' + '---' + ' |');
      }
    }
    return lines.join('\n');
  }

  function isHorizontalRule(line: Block[]): boolean {
    const text = textOf(line).trim();
    return text.length >= 3 && /^[_\-\*=]{3,}$/.test(text.replace(/\s/g, ''));
  }

  const mdLines: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const h = isHeading(line);
    const raw = textOf(line).trim();

    if (isHorizontalRule(line)) {
      mdLines.push('---');
      i++;
      continue;
    }

    let processed = false;

    if (!processed && isListItem(line)) {
      const paraLines: Block[][] = [line];
      while (i + 1 < lines.length && isListItem(lines[i + 1])) {
        paraLines.push(lines[i + 1]);
        i++;
      }
      for (const pl of paraLines) {
        const txt = textOf(pl).trim();
        let prefix = '- ';
        if (/^\d+[.)]/.test(txt)) prefix = '1. ';
        mdLines.push(prefix + txt.replace(/^[\d]+[.)]\s|^[•▪●○■□➢➤▶◆◇–—]\s|^[-*+]\s|^\(\d+\)\s|^[a-zA-Z][.)]\s/, ''));
      }
      processed = true;
      i++;
      continue;
    }

    const paraLines: Block[][] = [line];
    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      const gap = line[0].y - next[0].y;
      const avgFont = line.reduce((s, b) => s + b.fontSize, 0) / line.length;
      if (gap > avgFont * 2.2) break;
      const nextHeading = isHeading(next);
      if (nextHeading > 0) break;
      if (isListItem(next)) break;
      if (next.some(b => Math.abs(b.x - line[0].x) > 10)) break;
      paraLines.push(next);
      i++;
    }

    if (paraLines.length >= 3) {
      const tableMd = detectTable(paraLines);
      if (tableMd) {
        mdLines.push(tableMd);
        i++;
        continue;
      }
    }

    const paraText = paraLines.map(l => {
      const sorted = [...l].sort((a, b) => a.x - b.x);
      let txt = sorted.map(b => b.str).join('');
      if (boldFonts(l) && !h) txt = `**${txt}**`;
      return txt;
    }).join('\n');

    if (h > 0) {
      const prefix = '#'.repeat(h);
      const title = paraText.replace(/\n/g, ' ');
      mdLines.push(`${prefix} ${title}`);
    } else {
      if (mdLines.length > 0 && mdLines[mdLines.length - 1] !== '') {
        mdLines.push('');
      }
      mdLines.push(paraText);
    }

    i++;
  }

  return mdLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function extractTextFromPDF(file: File): Promise<string> {
  ensureWorker();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const md = pdfToMarkdown(content);
    if (md) {
      pages.push(md);
    }
  }

  const result = pages.map((p, i) => {
    if (i === 0) return p;
    return `\n\n---\n\n${p}`;
  }).join('\n\n').trim();

  if (!result) {
    throw new Error(
      'No selectable text found in this PDF. It may be a scanned image without an OCR text layer.',
    );
  }
  return result;
}
