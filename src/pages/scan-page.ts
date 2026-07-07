import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { scanDirectory, type ScanProgress, type NewDocInfo } from '../services/document-scanner.ts';
import { processQueue } from '../services/analysis-queue.ts';
import { addDocument, addAnalysisJob } from '../db/document-store.ts';
import { getDirectoryHandle, getDirectoryName } from '../utils/handle-store.ts';
import { v4 as uuid } from 'uuid';

@customElement('scan-page')
export class ScanPage extends LitElement {
  createRenderRoot() { return this; }
  @state() private scanning = false;
  @state() private analyzing = false;
  @state() private progress: ScanProgress | null = null;
  @state() private newDocs: NewDocInfo[] = [];
  @state() private noFolder = false;
  @state() private folderName: string | null = null;
  @state() private selected: Set<string> = new Set();
  @state() private fileStatus: Map<string, 'pending' | 'analyzing' | 'analyzed' | 'error'> = new Map();
  @state() private fileErrors: Map<string, string> = new Map();
  @state() private analysisDone = 0;
  @state() private analysisTotal = 0;
  @state() private hasScanned = false;

  private dirHandle: FileSystemDirectoryHandle | null = null;

  async connectedCallback() {
    super.connectedCallback();
    this.folderName = getDirectoryName();
    const handle = await getDirectoryHandle();
    if (!handle) {
      this.noFolder = true;
      return;
    }
    this.dirHandle = handle;
    await this.startScan();
  }

  async startScan() {
    if (!this.dirHandle) return;
    this.scanning = true;
    this.newDocs = [];
    this.selected = new Set();
    this.fileStatus = new Map();

    try {
      const result = await scanDirectory((p) => {
        this.progress = { ...p };
        this.requestUpdate();
      }, this.dirHandle);
      this.newDocs = result.newDocs;
      this.selected = new Set(result.newDocs.map(d => d.id));
      result.newDocs.forEach(d => this.fileStatus.set(d.id, 'pending'));
      this.hasScanned = true;
      this.scanning = false;
    } catch (err: any) {
      this.scanning = false;
      alert(err.message);
    }
  }

  async startAnalysis() {
    const selectedIds = Array.from(this.selected);
    if (selectedIds.length === 0) return;

    this.analyzing = true;
    this.analysisDone = 0;
    this.analysisTotal = selectedIds.length;

    const now = new Date().toISOString();
    for (const docId of selectedIds) {
      const info = this.newDocs.find(d => d.id === docId);
      if (!info) continue;

      await addDocument({
        id: docId,
        originalName: info.name,
        originalPath: info.name,
        storedPath: null,
        fileType: info.fileType,
        fileSize: info.size,
        fileHash: info.fileHash,
        extractedText: info.extractedText,
        summary: '',
        audience: '',
        urgency: 'medium',
        taxRelevant: false,
        category: '',
        year: new Date().getFullYear(),
        month: null,
        dateFrom: null,
        dateTo: null,
        suggestedFilename: null,
        tags: [],
        confidence: 0,
        status: 'pending',
        error: null,
        createdAt: now,
        updatedAt: now,
        syncedAt: null,
      });

      await addAnalysisJob({
        id: uuid(),
        documentId: docId,
        status: 'queued',
        provider: '',
        model: '',
        promptTokens: 0,
        completionTokens: 0,
        error: null,
        startedAt: null,
        completedAt: null,
        createdAt: now,
      });
    }

    try {
      await processQueue(this.dirHandle, selectedIds, (p) => {
        this.fileStatus.set(p.docId, p.status);
        if (p.error) this.fileErrors.set(p.docId, p.error);
        this.analysisDone = p.done;
        this.requestUpdate();
      });
    } catch (err: any) {
      alert(err.message);
    }
    this.analyzing = false;
  }

  private _toggle(id: string) {
    const next = new Set(this.selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    this.selected = next;
  }

  private _toggleAll() {
    const pending = this.newDocs.filter(d => this.fileStatus.get(d.id) === 'pending');
    if (this.selected.size === pending.length) {
      this.selected = new Set();
    } else {
      this.selected = new Set(pending.map(d => d.id));
    }
  }

  private _statusIcon(id: string) {
    const s = this.fileStatus.get(id);
    if (s === 'analyzing') return html`<span class="loading loading-spinner loading-xs text-primary"></span>`;
    if (s === 'analyzed') return html`<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>`;
    if (s === 'error') return html`<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>`;
    return '';
  }

  render() {
    return html`
      <div class="p-6 flex flex-col h-full gap-6">
        <h1 class="text-2xl font-bold shrink-0">Scan Documents</h1>

        ${this.noFolder ? html`
          <div class="bg-base-200 p-6 text-center space-y-3">
            <p class="text-warning font-semibold">No folder selected</p>
            <p class="text-sm opacity-70">Go to <a href="/settings" class="link link-primary" @click=${(e: Event) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/settings' } })); }}>Settings → Storage</a> to select your document folder first.</p>
          </div>
        ` : ''}

        ${this.scanning && this.progress ? html`
          <div class="bg-base-200 p-6 text-center space-y-4">
            <h3 class="font-semibold">Scanning for new files...</h3>
            <progress class="progress progress-primary w-full" value="${this.progress.current}" max="${this.progress.total}"></progress>
            <p class="text-sm opacity-70">${this.progress.currentFile}</p>
            <p class="text-xs opacity-50">${this.progress.current}/${this.progress.total}</p>
          </div>
        ` : ''}

        ${this.hasScanned && !this.scanning ? html`
          ${this.newDocs.length === 0 ? html`
            <div class="bg-base-200 p-6 text-center space-y-3">
              <p class="opacity-70">No new files found.</p>
              <button class="tooltip btn btn-ghost btn-sm" data-tip="Rescan folder" @click=${this.startScan}>
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/><path d="M16 5l-4 4m0 0l-4-4m4 4V1"/></svg>
                Scan Again
              </button>
            </div>
          ` : html`
            <div class="bg-base-200 flex flex-col flex-1 min-h-0">
              <div class="flex items-center justify-between px-4 py-3 border-b border-base-300 shrink-0">
                <div class="flex items-center gap-3">
                  ${this.analyzing ? '' : html`
                    <input type="checkbox" class="checkbox checkbox-sm"
                      .checked=${this.selected.size > 0 && this.newDocs.filter(d => this.fileStatus.get(d.id) === 'pending').every(d => this.selected.has(d.id))}
                      .indeterminate=${this.selected.size > 0 && this.selected.size < this.newDocs.filter(d => this.fileStatus.get(d.id) === 'pending').length}
                      @change=${this._toggleAll} />
                  `}
                  <span class="font-semibold text-sm">
                    ${this.analyzing ? `Analyzing (${this.analysisDone}/${this.analysisTotal})` : `${this.newDocs.length} file${this.newDocs.length > 1 ? 's' : ''} found`}
                  </span>
                </div>
                ${!this.analyzing && this.selected.size > 0 ? html`
                  <button class="tooltip btn btn-primary btn-sm" data-tip="Analyze selected files" @click=${this.startAnalysis}>
                    Analyze Selected (${this.selected.size})
                  </button>
                ` : ''}
              </div>
              <div class="divide-y divide-base-300 flex-1 overflow-y-auto">
                ${this.newDocs.map(d => {
                  const status = this.fileStatus.get(d.id) || 'pending';
                  return html`
                    <label class="flex items-center gap-3 px-4 py-2.5 hover:bg-base-300 cursor-pointer">
                      <input type="checkbox" class="checkbox checkbox-sm"
                        .checked=${this.selected.has(d.id)}
                        .disabled=${status !== 'pending'}
                        @change=${() => this._toggle(d.id)} />
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          ${(() => {
                            const ext = d.name.split('.').pop()?.toLowerCase() || '';
                            if (ext === 'pdf') return html`<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0 text-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
                            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return html`<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`;
                            return html`<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
                          })()}
                          <p class="text-sm truncate ${status === 'analyzed' ? 'text-success' : ''}">${d.name}</p>
                          ${this._statusIcon(d.id)}
                          ${status === 'analyzed' ? html`<span class="badge badge-soft badge-success badge-xs shrink-0">Analyzed</span>` : ''}
                          ${status === 'error' ? html`<span class="badge badge-soft badge-error badge-xs shrink-0">Failed</span>` : ''}
                          ${status === 'analyzing' ? html`<span class="badge badge-soft badge-info badge-xs shrink-0">Analyzing...</span>` : ''}
                        </div>
                        ${status === 'error' ? html`<p class="text-xs text-error mt-0.5 truncate">${this.fileErrors.get(d.id) || 'Unknown error'}</p>` : ''}
                        <p class="text-xs opacity-50 mt-0.5">${(d.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </label>
                  `;
                })}
              </div>
            </div>
          `}
        ` : ''}
      </div>
    `;
  }
}
