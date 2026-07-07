import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Document } from '../db/schema.ts';

@customElement('document-card')
export class DocumentCard extends LitElement {
  @property({ attribute: false }) document!: Document;
  @property({ type: Boolean }) selected = false;

  createRenderRoot() { return this; }

  render() {
    const d = this.document;
    return html`
      <div class="card bg-base-200 border border-base-300 p-4 cursor-pointer ${this.selected ? 'ring-2 ring-primary' : ''}">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="urgency-dot ${d.urgency}"></span>
              <span class="badge badge-sm">${d.category || 'Uncategorized'}</span>
              ${d.taxRelevant ? html`<span class="badge badge-sm badge-warning">Tax</span>` : ''}
            </div>
            <p class="font-medium text-sm truncate">${d.originalName}</p>
          </div>
        </div>
        ${d.summary ? html`
          <p class="text-xs text-base-content/70 mt-2 line-clamp-2">${d.summary}</p>
        ` : html`
          <div class="flex items-center gap-2 mt-2">
            <span class="loading loading-spinner loading-xs"></span>
            <span class="text-xs text-base-content/50">Analyzing...</span>
          </div>
        `}
        <div class="flex items-center gap-2 mt-3 text-xs text-base-content/50">
          <span>${d.year}</span>
          ${d.storedPath ? html`<span>● Organized</span>` : ''}
        </div>
      </div>
    `;
  }
}
