import { LitElement, html } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { getAllDocuments, getDocument, searchDocuments, getDocumentsByYear, getYearCounts, getCategoryNames, getCategoryCountsForYear, getStats, deleteAllDocuments, addAnalysisJob, resetDocumentForAnalysis } from '../db/document-store.ts';
import { processQueue } from '../services/analysis-queue.ts';
import { db } from '../db/schema.ts';
import type { Document } from '../db/schema.ts';
import type { ConfirmDialog } from '../components/confirm-dialog.ts';
import { v4 as uuid } from 'uuid';

const PAGE_SIZE = 20;

@customElement('library-page')
export class LibraryPage extends LitElement {
  createRenderRoot() { return this; }
  @state() private filtered: Document[] = [];
  @state() private searchQuery = '';
  @state() private selectedCategory = '';
  @state() private selectedYear = 0;
  @state() private years: { year: number; count: number }[] = [];
  @state() private categories: string[] = [];
  @state() private totalResultCount = 0;
  @state() private totalDocCount = 0;
  @state() private page = 1;
  @query('confirm-dialog') confirmDialog!: ConfirmDialog;
  @state() private analyzing = false;
  @state() private localPendingCount = 0;
  @state() private catCounts: Record<string, number> = {};
  @state() private selectMode = false;
  @state() private selectedIds: Set<string> = new Set();

  async connectedCallback() {
    super.connectedCallback();
    await this._loadMeta();
    this.addEventListener('document-analyzed', this._onDocAnalyzed);
    this.addEventListener('toggle-select', this._onToggleSelect as EventListener);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('document-analyzed', this._onDocAnalyzed);
    this.removeEventListener('toggle-select', this._onToggleSelect as EventListener);
  }

  private async _onDocAnalyzed() {
    await this._loadMeta();
  }

  private _onToggleSelect(e: CustomEvent) {
    const id = e.detail.id;
    this.selectedIds = new Set(this.selectedIds);
    if (this.selectedIds.has(id)) this.selectedIds.delete(id); else this.selectedIds.add(id);
  }

  private async _loadMeta() {
    const [yearCounts, catNames, stats] = await Promise.all([
      getYearCounts(),
      getCategoryNames(),
      getStats(),
    ]);
    this.totalDocCount = stats.docs;
    this.localPendingCount = await db.documents.where("status").anyOf("pending", "error", "analyzed").count();
    this.years = yearCounts
      .filter(y => y.year !== null)
      .map(y => ({ year: y.year as number, count: y.count }))
      .sort((a, b) => b.year - a.year);
    const unknownCount = yearCounts.find(y => y.year === null)?.count || 0;
    if (unknownCount > 0) this.years.push({ year: -1, count: unknownCount });
    this.categories = catNames;

    if (!this.selectedYear && this.years.length > 0) {
      const firstRealYear = this.years.find(y => y.year > 0);
      this.selectedYear = firstRealYear ? firstRealYear.year : this.years[0].year;
    }
    await this._computeCatCounts();
    await this._loadPage();
  }

  private async _loadPage() {
    let collection: Document[];
    const yearFilter = this.selectedYear === -1 ? null : this.selectedYear || null;

    if (this.searchQuery && this.searchQuery.length >= 2) {
      collection = await searchDocuments(this.searchQuery);
      if (yearFilter !== null) {
        collection = collection.filter(d => d.year === yearFilter);
      }
    } else if (yearFilter !== null) {
      collection = await getDocumentsByYear(yearFilter);
    } else {
      collection = await getAllDocuments();
    }

    if (this.selectedCategory) {
      collection = collection.filter(d => d.category === this.selectedCategory);
    }

    collection.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    this.totalResultCount = collection.length;
    const offset = (this.page - 1) * PAGE_SIZE;
    this.filtered = collection.slice(offset, offset + PAGE_SIZE);
  }

  private async _computeCatCounts() {
    const yearFilter = this.selectedYear === -1 ? null : this.selectedYear || null;
    this.catCounts = await getCategoryCountsForYear(yearFilter);
  }

  private async _refresh() {
    await this._loadMeta();
  }

  private get totalPages() {
    return Math.ceil(this.totalResultCount / PAGE_SIZE) || 1;
  }

  private get pendingCount() {
    return this.localPendingCount;
  }

  async analyzePending() {
    const pending = await db.documents.where("status").anyOf("pending", "error", "analyzed").toArray();
    if (pending.length === 0) return;
    this.analyzing = true;
    const now = new Date().toISOString();
    for (const doc of pending) {
      if (doc.status === 'analyzed') {
        await resetDocumentForAnalysis(doc.id);
      }
      await addAnalysisJob({
        id: uuid(),
        documentId: doc.id,
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
    }
    try {
      await processQueue(pending.map(d => d.id), () => {
        this.requestUpdate();
      });
    } catch {}
    this.analyzing = false;
    await this._refresh();
  }

  private async _deleteAll() {
    const ok = await this.confirmDialog.confirm(`Delete all ${this.totalDocCount} documents? This cannot be undone and will also remove all analysis data.`);
    if (!ok) return;
    await deleteAllDocuments();
    this.selectedYear = 0;
    await this._refresh();
  }

  private onSearch(e: CustomEvent) {
    this.searchQuery = e.detail.query;
    this.page = 1;
    this.selectedIds = new Set();
    if (this.searchQuery) {
      this.selectedYear = 0;
    }
    this._loadPage();
  }

  private _toggleSelectMode() {
    this.selectMode = !this.selectMode;
    if (!this.selectMode) this.selectedIds = new Set();
  }

  private _selectAll() {
    const allIds = new Set(this.filtered.map(d => d.id));
    if (this.selectedIds.size === allIds.size && allIds.size > 0) {
      this.selectedIds = new Set();
    } else {
      this.selectedIds = allIds;
    }
  }

  private _clearSelection() {
    this.selectedIds = new Set();
    this.selectMode = false;
  }

  private async _analyzeSelected() {
    const ids = Array.from(this.selectedIds);
    if (ids.length === 0) return;
    const docs = (await Promise.all(ids.map(id => getDocument(id)))).filter((d): d is Document =>
      d !== undefined && (d.status === 'pending' || d.status === 'error' || d.status === 'analyzed')
    );
    if (docs.length === 0) return;
    this.analyzing = true;
    const now = new Date().toISOString();
    for (const doc of docs) {
      if (doc.status === 'analyzed') {
        await resetDocumentForAnalysis(doc.id);
      }
      await addAnalysisJob({
        id: uuid(),
        documentId: doc.id,
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
    }
    try {
      await processQueue(docs.map(d => d.id), () => {
        this.requestUpdate();
      });
    } catch {}
    this.analyzing = false;
    this.selectedIds = new Set();
    this.selectMode = false;
    await this._refresh();
  }

  private _setYear(year: number) {
    this.selectedYear = year;
    this.page = 1;
    this.searchQuery = '';
    this.selectedIds = new Set();
    this._computeCatCounts();
    this._loadPage();
  }

  private _setPage(p: number) {
    this.page = Math.max(1, Math.min(p, this.totalPages));
    this.selectedIds = new Set();
    this._loadPage();
  }

  private _filterByCategory(cat: string) {
    this.selectedCategory = this.selectedCategory === cat ? '' : cat;
    this.page = 1;
    this.selectedIds = new Set();
    this._loadPage();
  }

  render() {
    const hasFilters = this.selectedCategory || this.searchQuery;

    return html`
      <div class="p-6 space-y-4">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <h1 class="text-2xl font-bold flex items-center gap-2">
              Library
              ${!this.selectMode ? html`<span class="badge badge-sm opacity-50">${this.totalDocCount}</span>` : ''}
              ${this.selectMode ? html`<span class="text-sm font-normal opacity-60 ml-1">${this.selectedIds.size} selected</span>` : ''}
            </h1>
            <div class="flex items-center gap-2">
              ${this.selectMode ? html`
                <button class="tooltip btn btn-xs" data-tip="Select/Deselect all filtered documents" @click=${this._selectAll}>${this.selectedIds.size === this.filtered.length ? 'Deselect All' : 'Select All'}</button>
                <button class="tooltip btn btn-primary btn-sm" data-tip="Analyze selected" @click=${this._analyzeSelected} ?disabled=${this.selectedIds.size === 0 || this.analyzing}>
                  ${this.analyzing ? html`<span class="loading loading-spinner loading-xs"></span>` : html`<icon-svg name="sparkles" size="14"></icon-svg>`}
                  Analyze (${this.selectedIds.size})
                </button>
                <button class="tooltip btn btn-ghost btn-sm" data-tip="Cancel selection" @click=${this._clearSelection}>Done</button>
              ` : html`
                ${this.pendingCount > 0 ? html`
                  <button class="tooltip btn btn-primary btn-sm" data-tip="Analyze or re-analyze all unanalyzed" @click=${this.analyzePending} ?disabled=${this.analyzing}>
                    ${this.analyzing ? html`<span class="loading loading-spinner loading-xs"></span>` : html`<icon-svg name="sparkles" size="14"></icon-svg>`}
                    Analyze All (${this.pendingCount})
                  </button>
                ` : ''}
                ${this.totalDocCount > 0 ? html`
                  <button class="tooltip btn btn-square btn-ghost btn-sm" data-tip="Select documents" @click=${this._toggleSelectMode}>
                    <icon-svg name="checkSquare" size="16"></icon-svg>
                  </button>
                  <button class="tooltip btn btn-square btn-ghost btn-sm" data-tip="Delete all" @click=${this._deleteAll}>
                    <icon-svg name="trash" size="16"></icon-svg>
                  </button>
                ` : ''}
              `}
            </div>
          </div>

          <search-bar @search=${this.onSearch}></search-bar>

        ${!this.searchQuery ? html`
          <div class="flex items-center gap-1 overflow-x-auto pb-1">
            ${this.years.map(({ year, count }) => html`
              <button
                class="btn btn-xs shrink-0 ${this.selectedYear === year ? 'btn-primary' : 'btn-ghost'}"
                @click=${() => this._setYear(year)}
              >${year === -1 ? 'Unknown' : year} <span class="opacity-50 ml-0.5">${count}</span></button>
            `)}
          </div>
        ` : html`
          <div class="text-xs opacity-50">Search results — ${this.totalResultCount} found</div>
        `}

        ${this.categories.length > 0 ? html`
          <div class="bg-base-200 p-3 rounded-box">
            <div class="flex flex-wrap gap-1">
              ${this.categories.map(cat => html`
                <button
                  class="btn btn-xs ${this.selectedCategory === cat ? 'btn-primary' : 'btn-ghost'}"
                  @click=${() => this._filterByCategory(cat)}
                >${cat} <span class="opacity-50">${this.catCounts[cat] || 0}</span></button>
              `)}
            </div>
          </div>
        ` : ''}

        ${this.filtered.length > 0 ? html`
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            ${this.filtered.map(doc => html`
              <document-card
                .document=${doc}
                .selectable=${this.selectMode}
                .selected=${this.selectedIds.has(doc.id)}
                @click=${this.selectMode ? (e: Event) => { e.stopPropagation(); this._onToggleSelect(new CustomEvent('toggle-select', { detail: { id: doc.id } })); } : () => this._openDoc(doc.id)}
              ></document-card>
            `)}
          </div>

          ${this.totalPages > 1 ? html`
            <div class="flex items-center justify-center gap-1">
              <button class="btn btn-sm btn-ghost" ?disabled=${this.page <= 1} @click=${() => this._setPage(this.page - 1)}>‹</button>
              ${Array.from({ length: Math.min(this.totalPages, 7) }, (_, i) => {
                let p: number;
                if (this.totalPages <= 7) {
                  p = i + 1;
                } else if (this.page <= 4) {
                  p = i + 1;
                } else if (this.page >= this.totalPages - 3) {
                  p = this.totalPages - 6 + i;
                } else {
                  p = this.page - 3 + i;
                }
                return html`
                  <button
                    class="btn btn-sm ${p === this.page ? 'btn-primary' : 'btn-ghost'}"
                    @click=${() => this._setPage(p)}
                  >${p}</button>
                `;
              })}
              <button class="btn btn-sm btn-ghost" ?disabled=${this.page >= this.totalPages} @click=${() => this._setPage(this.page + 1)}>›</button>
            </div>
          ` : ''}
        ` : html`
          <div class="bg-base-200 p-8 rounded-box text-center space-y-3">
            ${this.totalDocCount === 0 ? html`
              <p class="text-sm opacity-50">No documents yet</p>
              <button class="btn btn-primary btn-sm" @click=${() => window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/' } }))}>
                <icon-svg name="scan" size="16"></icon-svg>
                Start Scanning
              </button>
            ` : html`
              <p class="text-sm opacity-50">No documents match your filters</p>
              <button class="btn btn-ghost btn-sm" @click=${() => { this.selectedCategory = ''; this.searchQuery = ''; this._refresh(); }}>
                Clear filters
              </button>
            `}
          </div>
        `}
      </div>
      <confirm-dialog></confirm-dialog>
    `;
  }

  private _openDoc(id: string) {
    window.dispatchEvent(new CustomEvent('navigate', { detail: { path: `/library/${id}` } }));
  }
}
