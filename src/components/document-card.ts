import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Document } from '../db/schema.ts';
import { db } from '../db/schema.ts';
import { addAnalysisJob, resetDocumentForAnalysis } from '../db/document-store.ts';
import { processQueue } from '../services/analysis-queue.ts';
import { v4 as uuid } from 'uuid';

@customElement('document-card')
export class DocumentCard extends LitElement {
  @property({ attribute: false }) document!: Document;
  @property({ type: Boolean }) selected = false;
  @property({ type: Boolean }) selectable = false;
  @state() private categoryIcon = '';
  @state() private analyzing = false;

  private static _iconCache: Map<string, string> | null = null;

  createRenderRoot() { return this; }

  async analyze(e: Event) {
    e.stopPropagation();
    if (this.analyzing) return;
    this.analyzing = true;
    const now = new Date().toISOString();
    if (this.document.status === 'analyzed') {
      await resetDocumentForAnalysis(this.document.id);
    }
    await addAnalysisJob({
      id: uuid(),
      documentId: this.document.id,
      status: 'queued',
      provider: '',
      model: '',
      promptTokens: 0,
      completionTokens: 0,
      error: null,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await processQueue([this.document.id], (p) => {
      if (p.status === 'analyzed') {
        this.document.status = 'analyzed';
        this.analyzing = false;
        this.requestUpdate();
        this.dispatchEvent(new CustomEvent('document-analyzed', { bubbles: true, composed: true, detail: { id: this.document.id } }));
      } else if (p.status === 'error') {
        this.document.status = 'error';
        this.document.error = p.error || 'Analysis failed';
        this.analyzing = false;
        this.requestUpdate();
      }
    });
  }

  async connectedCallback() {
    super.connectedCallback();
    if (!DocumentCard._iconCache) {
      const cats = await db.categories.toArray();
      DocumentCard._iconCache = new Map(cats.map(c => [c.name, c.icon]));
    }
    this.categoryIcon = DocumentCard._iconCache.get(this.document.category) || '';
  }

  private _urgencyBorder(d: Document) {
    if (d.urgency === 'critical') return 'border-l-4 border-l-error';
    if (d.urgency === 'high') return 'border-l-4 border-l-warning';
    return 'border-l-4 border-l-base-300';
  }

  render() {
    const d = this.document;
    const ext = d.originalName.split('.').pop()?.toLowerCase() || '';

    return html`
      <div class="card card-compact bg-base-200 border border-base-300 cursor-pointer transition-shadow hover:shadow-md ${this._urgencyBorder(d)} ${this.selected ? 'ring-2 ring-primary' : ''}">
        <div class="card-body p-3 gap-2">
          <div class="flex items-start justify-between gap-2 min-w-0">
            <div class="flex items-start gap-2 min-w-0 flex-1">
              ${this.selectable ? html`
                <input type="checkbox" class="checkbox checkbox-xs mt-0.5 shrink-0" .checked=${this.selected}
                  @click=${(e: Event) => { e.stopPropagation(); this.dispatchEvent(new CustomEvent('toggle-select', { bubbles: true, composed: true, detail: { id: this.document.id } })); }}>
              ` : ''}
              <p class="font-medium text-sm leading-tight truncate" title="${d.originalName}">${d.originalName}</p>
            </div>
            ${d.status === 'analyzed' ? html`
              <span class="badge badge-xs badge-success shrink-0">Done</span>
            ` : d.status === 'error' ? html`
              <span class="badge badge-xs badge-error shrink-0">Failed</span>
            ` : d.status === 'analyzing' || this.analyzing ? html`
              <span class="loading loading-spinner loading-xs shrink-0"></span>
            ` : html`
              <span class="badge badge-xs badge-ghost shrink-0">Pending</span>
            `}
          </div>

          ${d.status === 'analyzed' && d.summary ? html`
            <div class="group relative">
              <p class="text-xs text-base-content/70 line-clamp-2 leading-relaxed">${d.summary}</p>
              <button class="tooltip btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 transition-opacity absolute top-0 right-0" data-tip="Re-analyze" @click=${this.analyze}>
                <icon-svg name="refresh" size="12"></icon-svg>
              </button>
            </div>
          ` : d.status === 'error' ? html`
            <div class="flex items-center gap-2">
              <p class="text-xs text-error/70 truncate flex-1" title="${d.error || 'Analysis failed'}">${d.error || 'Analysis failed'}</p>
              <button class="tooltip btn btn-ghost btn-xs shrink-0" data-tip="Retry" @click=${this.analyze}>
                <icon-svg name="refresh" size="12"></icon-svg>
              </button>
            </div>
          ` : d.status === 'analyzing' || this.analyzing ? html`
            <p class="text-xs text-base-content/40 italic">Analyzing...</p>
          ` : html`
            <button class="tooltip btn btn-ghost btn-xs justify-start w-fit" data-tip="Analyze this document" @click=${this.analyze}>
              <icon-svg name="sparkles" size="12"></icon-svg>
              Analyze
            </button>
          `}

          <div class="flex items-center gap-1.5 flex-wrap">
            ${d.category ? html`<span class="badge badge-xs badge-soft">${this.categoryIcon || '📄'} ${d.category}</span>` : ''}
            ${d.year ? html`<span class="text-xs opacity-40">${d.year}</span>` : ''}
            ${ext === 'pdf' ? html`<icon-svg name="fileText" size="12" class="opacity-30 shrink-0"></icon-svg>`
            : ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext) ? html`<icon-svg name="image" size="12" class="opacity-30 shrink-0"></icon-svg>`
            : ''}
            ${d.taxRelevant ? html`<span class="badge badge-xs badge-warning">Tax</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }
}
