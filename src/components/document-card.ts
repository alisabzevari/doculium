import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Document } from '../db/schema.ts';
import { db } from '../db/schema.ts';

@customElement('document-card')
export class DocumentCard extends LitElement {
  @property({ attribute: false }) document!: Document;
  @property({ type: Boolean }) selected = false;
  @state() private categoryIcon = '';

  private static _iconCache: Map<string, string> | null = null;

  createRenderRoot() { return this; }

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
              <p class="font-medium text-sm truncate">${d.originalName}</p>
            </div>
          </div>
          ${d.summary ? html`
            <p class="text-xs text-base-content/70 line-clamp-2">${d.summary}</p>
          ` : html`
            <div class="flex items-center gap-2">
              <span class="loading loading-spinner loading-xs"></span>
              <span class="text-xs text-base-content/50">Analyzing...</span>
            </div>
          `}
          <div class="flex items-center justify-between text-xs text-base-content/50">
            <span>${d.year}</span>
            <div class="flex items-center gap-2">
              ${d.fileType === 'application/pdf' ? html`
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              ` : d.fileType.startsWith('image/') ? html`
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
              ` : ''}
              ${d.storedPath ? html`<span>● Organized</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
