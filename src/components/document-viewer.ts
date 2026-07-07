import { LitElement, html } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let workerSrcSet = false;

function ensureWorker(): void {
  if (!workerSrcSet) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    workerSrcSet = true;
  }
}

type FitMode = 'width' | 'page';

@customElement('document-viewer')
export class DocumentViewer extends LitElement {
  @property({ attribute: false }) file!: File;
  @state() private numPages = 0;
  @state() private currentPage = 1;
  @state() private loading = true;
  @state() private error = '';
  @state() private zoom = 1;
  @state() private fitMode: FitMode = 'width';

  @query('canvas') canvas!: HTMLCanvasElement;

  private pdf: pdfjsLib.PDFDocumentProxy | null = null;
  private ro: ResizeObserver | null = null;

  createRenderRoot() { return this; }

  async connectedCallback() {
    super.connectedCallback();
    await this._loadPdf();
    this.ro = new ResizeObserver(() => {
      if (this.fitMode === 'width' && this.pdf) {
        this._fitAndRender();
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.ro?.disconnect();
    this.pdf?.destroy();
    this.pdf = null;
  }

  private async _loadPdf() {
    ensureWorker();
    this.loading = true;
    this.error = '';
    this.currentPage = 1;
    this.numPages = 0;

    try {
      const arrayBuffer = await this.file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      this.pdf = pdf;
      this.numPages = pdf.numPages;
      this.loading = false;
      await new Promise(r => requestAnimationFrame(r));
      await this._render(true);
    } catch (err: any) {
      this.error = err.message || 'Failed to load PDF';
      this.loading = false;
    }
  }

  async refresh() {
    if (this.pdf) {
      await this._render(true);
    }
  }

  private async _fitAndRender() {
    if (!this.pdf) return;
    const page = await this.pdf.getPage(this.currentPage);
    const unscaled = page.getViewport({ scale: 1 });
    const parent = this.canvas?.parentElement;
    const w = parent?.clientWidth || unscaled.width;
    this.zoom = Math.max(0.25, Math.min(5, (w - 2) / unscaled.width));
    await this._render(false);
  }

  private async _render(resetObserver: boolean) {
    if (!this.pdf || !this.canvas) return;

    const canvas = this.canvas;
    const page = await this.pdf.getPage(this.currentPage);
    const container = canvas.parentElement!;
    const containerWidth = container.clientWidth - 2;
    const unscaled = page.getViewport({ scale: 1 });

    if (this.fitMode === 'width') {
      this.zoom = Math.max(0.25, Math.min(5, containerWidth / unscaled.width));
    }

    const viewport = page.getViewport({ scale: this.zoom });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    if (resetObserver && this.ro) {
      this.ro.disconnect();
      this.ro.observe(container);
    }
  }

  async updated(changed: Map<string, unknown>) {
    if (changed.has('currentPage') && this.pdf) {
      if (this.fitMode === 'width') {
        await this._fitAndRender();
      } else {
        await this._render(false);
      }
    }
  }

  private _prev() { if (this.currentPage > 1) this.currentPage--; }
  private _next() { if (this.currentPage < this.numPages) this.currentPage++; }

  private _zoomIn() {
    this.fitMode = 'page';
    this.zoom = Math.min(5, +(this.zoom * 1.25).toFixed(2));
    this._render(false);
  }

  private _zoomOut() {
    this.fitMode = 'page';
    this.zoom = Math.max(0.25, +(this.zoom / 1.25).toFixed(2));
    this._render(false);
  }

  private _fitWidth() {
    this.fitMode = 'width';
    this._fitAndRender();
  }

  render() {
    if (this.error) {
      return html`<div class="flex items-center justify-center p-8 text-error text-sm">${this.error}</div>`;
    }

    if (this.loading) {
      return html`<div class="flex items-center justify-center p-8"><span class="loading loading-spinner loading-lg"></span></div>`;
    }

    return html`
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between px-4 py-2 border-b border-base-300">
          <div class="flex items-center gap-1">
             <button class="tooltip btn btn-ghost btn-xs" data-tip="Zoom out" @click=${this._zoomOut} ?disabled=${this.zoom <= 0.25}>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M8 11h6"/></svg>
             </button>
             <span class="text-xs tabular-nums w-12 text-center opacity-60">${Math.round(this.zoom * 100)}%</span>
             <button class="tooltip btn btn-ghost btn-xs" data-tip="Zoom in" @click=${this._zoomIn} ?disabled=${this.zoom >= 5}>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M11 8v6m-3-3h6"/></svg>
             </button>
             <div class="w-px h-4 bg-base-300 mx-1"></div>
             <button class="tooltip btn btn-ghost btn-xs ${this.fitMode === 'width' ? 'btn-active' : ''}" data-tip="Fit width" @click=${this._fitWidth}>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M8 8l-4 4 4 4M16 8l4 4-4 4"/></svg>
            </button>
          </div>
          <div class="flex items-center gap-1">
             <button class="tooltip btn btn-ghost btn-xs" data-tip="Previous" @click=${this._prev} ?disabled=${this.currentPage <= 1}>
              ‹
             </button>
             <span class="text-xs tabular-nums opacity-60">${this.currentPage} / ${this.numPages}</span>
             <button class="tooltip btn btn-ghost btn-xs" data-tip="Next" @click=${this._next} ?disabled=${this.currentPage >= this.numPages}>
              ›
             </button>
          </div>
        </div>
        <div class="canvas-container overflow-auto max-w-full bg-base-100 flex justify-center p-2">
          <canvas class="block shadow-md"></canvas>
        </div>
      </div>
    `;
  }
}
