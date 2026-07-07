import { LitElement, html } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { marked } from 'marked';
import { getDocument, getActionItemsByDocument, deleteDocument, addAnalysisJob, updateDocument, resetDocumentForAnalysis } from '../db/document-store.ts';
import { processQueue } from '../services/analysis-queue.ts';
import { getDirectoryHandle, getDocumentFile, hasDirectoryHandle } from '../utils/handle-store.ts';
import type { Document, ActionItem } from '../db/schema.ts';
import { v4 as uuid } from 'uuid';

marked.setOptions({ breaks: true, gfm: true });

@customElement('document-detail')
export class DocumentDetail extends LitElement {
 createRenderRoot() { return this; }
 @state() private doc: Document | null = null;
 @state() private actionItems: ActionItem[] = [];
 @state() private docFile: File | null = null;
 @state() private fileError = '';
  @state() private activeTab = 'summary';
  @state() private noHandle = false;
  @state() private analyzing = false;

 @query('confirm-dialog') confirmDialog!: import('../components/confirm-dialog.ts').ConfirmDialog;

 async updated(changed: Map<string, unknown>) {
  if (changed.has('activeTab') && this.activeTab === 'file') {
   await (this.renderRoot.querySelector('document-viewer') as any)?.refresh();
  }
  if (changed.has('activeTab') && this.activeTab === 'chat') {
   await this.updateComplete;
   const el = this.renderRoot.querySelector('.chat-scroll');
   if (el) el.scrollTop = el.scrollHeight;
  }
 }

 async connectedCallback() {
  super.connectedCallback();
  const path = window.location.pathname;
  const id = path.split('/library/')[1];
  if (id) {
   this.doc = await getDocument(id) ?? null;
   if (this.doc) {
    await this._loadActionItems();
    this.noHandle = !(await hasDirectoryHandle());
    if (!this.noHandle) {
      await this._loadFile();
    }
   }
  }
  this.addEventListener('action-items-changed', this._loadActionItems);
 }

 disconnectedCallback() {
  super.disconnectedCallback();
  this.removeEventListener('action-items-changed', this._loadActionItems);
 }

 private async _loadActionItems() {
  if (this.doc) {
   this.actionItems = await getActionItemsByDocument(this.doc.id);
  }
 }

 private async _loadFile() {
  if (!this.doc) return;
  try {
   this.docFile = await getDocumentFile(this.doc);
   if (!this.docFile) {
    this.fileError = 'File not found in the selected folder. It may have been moved or deleted.';
   }
  } catch {
   this.fileError = 'Could not read the file. The folder may no longer be accessible.';
  }
 }

  private async _deleteDoc() {
    if (!this.doc) return;
    const ok = await this.confirmDialog.confirm(`Delete "${this.doc.originalName}"? This cannot be undone.`);
    if (!ok) return;
    await deleteDocument(this.doc.id);
    window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/library' } }));
  }

  private async _analyze() {
    if (!this.doc || this.analyzing) return;
    this.analyzing = true;
    const now = new Date().toISOString();
    if (this.doc.status === 'analyzed') {
      await resetDocumentForAnalysis(this.doc.id);
    } else {
      await updateDocument(this.doc.id, { status: 'pending', error: null });
    }
    await addAnalysisJob({
      id: uuid(),
      documentId: this.doc.id,
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
    try {
      await processQueue(dirHandle, [this.doc.id], (p) => {
        this.requestUpdate();
      });
    } catch {}
    this.doc = (await getDocument(this.doc.id)) ?? null;
    this.analyzing = false;
    if (this.doc) {
      this._loadActionItems();
    }
  }

  render() {
   if (!this.doc) return html`<div class="p-6"><span class="loading loading-spinner loading-lg"></span></div>`;

   const d = this.doc;
   return html`
    <div class="p-6 max-w-4xl mx-auto space-y-6">
     <button class="tooltip btn btn-ghost btn-sm" data-tip="Back to Library" @click=${() => window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/library' } }))}>
      Back to Library
     </button>

     <div class="bg-base-200 p-4">
      <div class="flex items-start justify-between flex-wrap gap-2">
        <div class="min-w-0">
         <h1 class="text-xl font-bold truncate" title="${d.originalName}">${d.originalName}</h1>
         <p class="text-sm opacity-50 mt-1 truncate" title="${d.originalPath}">${d.originalPath}</p>
       </div>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="badge gap-1 ${d.urgency === 'critical' ? 'badge-error' : d.urgency === 'high' ? 'badge-warning' : 'badge-ghost'}">
           ${d.urgency === 'critical' ? html`<icon-svg name="alertTriangle" size="12"></icon-svg>` : d.urgency === 'high' ? html`<icon-svg name="arrowUp" size="12"></icon-svg>` : d.urgency === 'medium' ? html`<icon-svg name="minus" size="12"></icon-svg>` : html`<icon-svg name="arrowDown" size="12"></icon-svg>`}
           ${d.urgency}</span>
         ${d.taxRelevant ? html`<span class="badge badge-warning">Tax Relevant</span>` : ''}
         ${!this.analyzing ? html`
          <button class="tooltip btn btn-primary btn-sm" data-tip="${d.status === 'analyzed' ? 'Re-analyze this document' : 'Analyze this document'}" @click=${this._analyze}>
           <icon-svg name="sparkles" size="16"></icon-svg>
           ${d.status === 'analyzed' ? 'Re-analyze' : 'Analyze'}
          </button>
         ` : ''}
         ${this.analyzing ? html`<span class="loading loading-spinner loading-sm"></span>` : ''}
        <button class="tooltip btn btn-error btn-sm" data-tip="Delete document" @click=${this._deleteDoc}>
         <icon-svg name="trash" size="16"></icon-svg>
         Delete
        </button>
        </div>
      </div>
     </div>

      <div role="tablist" class="tabs tabs-box bg-base-200 overflow-x-auto">
        <button role="tab" class="tab ${this.activeTab === 'summary' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'summary'}>
         <icon-svg name="clipboardCheck" size="16"></icon-svg>
         Summary
        </button>
        <button role="tab" class="tab ${this.activeTab === 'text' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'text'}>
         <icon-svg name="fileText" size="16"></icon-svg>
         Text
        </button>
        <button role="tab" class="tab ${this.activeTab === 'file' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'file'}>
         <icon-svg name="fileSearch" size="16"></icon-svg>
         File
        </button>
        <button role="tab" class="tab ${this.activeTab === 'chat' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'chat'}>
         <icon-svg name="chatBubble" size="16"></icon-svg>
         Chat
        </button>
      </div>

     ${this.activeTab === 'summary' ? html`
      <div class="space-y-6">

       <div class="bg-base-200 p-4 space-y-3">
        <div class="flex flex-wrap gap-3 text-sm">
         <div><span class="opacity-50">Category:</span> <strong>${d.category}</strong></div>
         <div><span class="opacity-50">Year:</span> <strong>${d.year}</strong></div>
         ${d.month ? html`<div><span class="opacity-50">Month:</span> <strong>${d.month}</strong></div>` : ''}
         ${d.storedPath ? html`<div class="flex min-w-0 gap-1"><span class="opacity-50 shrink-0">Location:</span> <span class="truncate min-w-0 font-bold" title="${d.storedPath}">${d.storedPath}</span></div>` : ''}
        </div>

        ${d.status === 'error' ? html`
         <div class="alert alert-error text-sm">
          <span>${d.error || 'Analysis failed'}</span>
         </div>
        ` : d.status === 'pending' ? html`
         <div class="alert alert-info text-sm">
          <span>Pending analysis</span>
         </div>
        ` : d.status === 'analyzing' ? html`
         <div class="alert alert-info text-sm">
          <span class="loading loading-spinner loading-xs mr-2"></span>
          Analyzing...
         </div>
        ` : ''}

        ${d.confidence > 0 ? html`
         <div class="text-xs opacity-50">AI Confidence: ${Math.round(d.confidence * 100)}%</div>
        ` : ''}
       </div>

       ${d.summary ? html`
        <div class="bg-base-200 p-4">
         <h2 class="font-semibold mb-2">Summary</h2>
         <p class="text-sm">${d.summary}</p>
        </div>
       ` : ''}

       ${d.audience ? html`
        <div class="bg-base-200 p-4">
         <h2 class="font-semibold mb-2">Audience</h2>
         <p class="text-sm">${d.audience}</p>
        </div>
       ` : ''}

       ${this.actionItems.length > 0 ? html`
        <div class="bg-base-200 p-4">
         <h2 class="font-semibold mb-2">Action Items</h2>
         <action-item-list .items=${this.actionItems} showCompleted></action-item-list>
        </div>
       ` : ''}

       ${d.tags.length > 0 ? html`
        <div class="flex flex-wrap gap-2">
         ${d.tags.map(t => html`<span class="badge badge-outline">${t}</span>`)}
        </div>
       ` : ''}

       </div>
      ` : ''}

      ${this.activeTab === 'text' ? html`
       <div class="bg-base-200 p-4">
        ${d.extractedText ? html`
         <div class="markdown-body text-sm overflow-auto max-h-[70vh] leading-relaxed">
          ${unsafeHTML(marked.parse(d.extractedText) as string)}
         </div>
        ` : html`
         <p class="text-sm opacity-50 text-center py-8">No extracted text available.</p>
        `}
       </div>
      ` : ''}

      ${this.activeTab === 'file' ? html`
      ${this.noHandle ? html`
       <div class="bg-base-200 p-6 text-center">
        <p class="text-warning font-semibold">No folder selected</p>
        <p class="text-sm opacity-70 mt-2">Go to <a href="/settings" class="link link-primary" @click=${(e: Event) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/settings' } })); }}>Settings → Storage</a> to select your document folder.</p>
       </div>
      ` : this.fileError ? html`
       <div class="bg-base-200 p-6 text-center">
        <p class="text-error font-semibold">${this.fileError}</p>
       </div>
      ` : !this.docFile ? html`
       <div class="bg-base-200 p-6 text-center text-sm opacity-50">
        <span class="loading loading-spinner loading-xs mr-2"></span>
        Loading file...
       </div>
      ` : d.fileType === 'application/pdf' ? html`
       <div class="bg-base-200">
        <document-viewer .file=${this.docFile}></document-viewer>
       </div>
      ` : d.fileType.startsWith('image/') ? html`
       <div class="bg-base-200 p-4 flex justify-center">
        <img src=${URL.createObjectURL(this.docFile)} class="max-w-full max-h-[80vh] object-contain" />
       </div>
      ` : html`
       <div class="bg-base-200 p-6 text-center text-sm opacity-50">
        Preview not available for this file type.
       </div>
      `}
      ` : ''}

     ${this.activeTab === 'chat' ? html`
      <div class="bg-base-200">
        <document-chat .extractedText=${d.extractedText} .documentId=${d.id}></document-chat>
      </div>
     ` : ''}
     </div>

    </div>
    <confirm-dialog></confirm-dialog>
   `;
  }
 }
