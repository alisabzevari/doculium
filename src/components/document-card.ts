import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Document } from '../db/schema.ts';
import { db } from '../db/schema.ts';
import { addAnalysisJob, resetDocumentForAnalysis } from '../db/document-store.ts';
import { processQueue } from '../services/analysis-queue.ts';
import { getDirectoryHandle } from '../utils/handle-store.ts';
import { v4 as uuid } from 'uuid';

@customElement('document-card')
export class DocumentCard extends LitElement {
  @property({ attribute: false }) document!: Document;
  @property({ type: Boolean }) selected = false;
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
    const dirHandle = await getDirectoryHandle();
    await processQueue(dirHandle, [this.document.id], (p) => {
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
    this.categoryIcon = DocumentCard._iconCache.get(this.document.category) || '📄';
  }

  render() {
    const d = this.document;
    return html`
      <div class="card card-compact bg-base-200 border border-base-300 cursor-pointer transition-shadow hover:shadow-lg ${this.selected ? 'ring-2 ring-primary' : ''}">
        <div class="card-body">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="urgency-dot ${d.urgency}"></span>
                <span class="badge badge-sm gap-1 px-2">
                  <span>${this.categoryIcon}</span>
                  <span>${d.category || 'Uncategorized'}</span>
                </span>
                ${d.taxRelevant ? html`<span class="badge badge-sm badge-warning">Tax</span>` : ''}
              </div>
              <p class="font-medium text-sm truncate" title="${d.originalName}">${d.originalName}</p>
            </div>
          </div>
          ${d.status === 'analyzed' && d.summary ? html`
            <div class="flex items-start gap-2">
              <p class="text-xs text-base-content/70 line-clamp-2 flex-1 min-w-0">${d.summary}</p>
              <button class="tooltip btn btn-xs btn-ghost shrink-0" data-tip="Re-analyze" @click=${this.analyze}>
                <icon-svg name="refresh" size="12"></icon-svg>
              </button>
            </div>
          ` : d.status === 'error' ? html`
            <div class="flex items-center gap-2">
              <icon-svg name="alertCircle" size="14" class="text-error shrink-0"></icon-svg>
              <span class="text-xs text-error truncate flex-1" title="${d.error || 'Analysis failed'}">${d.error || 'Analysis failed'}</span>
              <button class="tooltip btn btn-xs btn-ghost" data-tip="Retry analysis" @click=${this.analyze}>
                <icon-svg name="refresh" size="12"></icon-svg>
              </button>
            </div>
          ` : d.status === 'analyzing' || this.analyzing ? html`
            <div class="flex items-center gap-2">
              <span class="loading loading-spinner loading-xs"></span>
              <span class="text-xs text-base-content/50">Analyzing...</span>
            </div>
          ` : html`
            <div class="flex items-center gap-2">
              <button class="tooltip btn btn-xs btn-primary" data-tip="Analyze this document" @click=${this.analyze}>
                <icon-svg name="sparkles" size="12"></icon-svg>
                Analyze
              </button>
            </div>
          `}
          <div class="flex items-center justify-between text-xs text-base-content/50">
            <span>${d.year}</span>
            <div class="flex items-center gap-2">
              ${d.fileType === 'application/pdf' ? html`
                <icon-svg name="fileText" size="14"></icon-svg>
              ` : d.fileType.startsWith('image/') ? html`
                <icon-svg name="image" size="14"></icon-svg>
              ` : ''}
              ${d.storedPath ? html`<span>● Organized</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
