import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { getAllDocuments, searchDocuments, getDocumentsByCategory, getDocumentsByYear } from '../db/document-store.ts';
import type { Document } from '../db/schema.ts';

@customElement('library-page')
export class LibraryPage extends LitElement {
  createRenderRoot() { return this; }
  @state() private documents: Document[] = [];
  @state() private filtered: Document[] = [];
  @state() private searchQuery = '';
  @state() private selectedCategory = '';
  @state() private selectedYear = 0;
  @state() private years: number[] = [];
  @state() private categories: string[] = [];

  async connectedCallback() {
    super.connectedCallback();
    const docs = await getAllDocuments();
    this.documents = docs;
    this.filtered = docs;
    this.years = [...new Set(docs.map(d => d.year))].sort((a, b) => b - a);
    this.categories = [...new Set(docs.map(d => d.category).filter(Boolean))];
  }

  private async onSearch(e: CustomEvent) {
    this.searchQuery = e.detail.query;
    await this.applyFilters();
  }

  private async applyFilters() {
    let result = this.documents;

    if (this.searchQuery) {
      result = await searchDocuments(this.searchQuery);
    }
    if (this.selectedCategory) {
      result = result.filter(d => d.category === this.selectedCategory);
    }
    if (this.selectedYear) {
      result = result.filter(d => d.year === this.selectedYear);
    }

    this.filtered = result;
  }

  private async filterByCategory(cat: string) {
    this.selectedCategory = this.selectedCategory === cat ? '' : cat;
    const docs = this.selectedCategory
      ? await getDocumentsByCategory(this.selectedCategory)
      : this.documents;
    this.filtered = docs;
  }

  private async filterByYear(year: number) {
    this.selectedYear = this.selectedYear === year ? 0 : year;
    const docs = this.selectedYear
      ? await getDocumentsByYear(this.selectedYear)
      : this.documents;
    this.filtered = docs;
  }

  render() {
    const catCounts = this.categories.reduce((acc, c) => ({ ...acc, [c]: this.documents.filter(d => d.category === c).length }), {} as Record<string, number>);

    return html`
      <div class="p-6 space-y-6">
        <h1 class="text-2xl font-bold">Library</h1>

        <search-bar @search=${this.onSearch}></search-bar>

        <div class="flex flex-wrap gap-2">
          ${this.categories.map(cat => html`
            <button
              class="btn btn-xs ${this.selectedCategory === cat ? 'btn-primary' : 'btn-ghost'}"
              @click=${() => this.filterByCategory(cat)}
            >${cat} (${catCounts[cat] || 0})</button>
          `)}
        </div>

        <div class="flex flex-wrap gap-2">
          ${this.years.map(y => html`
            <button
              class="btn btn-xs ${this.selectedYear === y ? 'btn-primary' : 'btn-ghost'}"
              @click=${() => this.filterByYear(y)}
            >${y}</button>
          `)}
        </div>

        ${this.filtered.length > 0 ? html`
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            ${this.filtered.map(doc => html`
              <document-card
                .document=${doc}
                @click=${() => this._openDoc(doc.id)}
              ></document-card>
            `)}
          </div>
        ` : html`
          <p class="text-sm opacity-50 text-center py-8">
            ${this.documents.length === 0
              ? 'No documents yet. Go to Scan to import documents.'
              : 'No documents match your filters.'}
          </p>
        `}
      </div>
    `;
  }

  private _openDoc(id: string) {
    window.dispatchEvent(new CustomEvent('navigate', { detail: { path: `/library/${id}` } }));
  }
}
