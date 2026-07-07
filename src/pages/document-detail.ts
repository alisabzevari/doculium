import { LitElement, html } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { getDocument, getActionItemsByDocument, deleteDocument } from '../db/document-store.ts';
import type { Document, ActionItem } from '../db/schema.ts';
import { getDocumentFile, hasDirectoryHandle } from '../utils/handle-store.ts';

@customElement('document-detail')
export class DocumentDetail extends LitElement {
 createRenderRoot() { return this; }
 @state() private doc: Document | null = null;
 @state() private actionItems: ActionItem[] = [];
 @state() private docFile: File | null = null;
 @state() private fileError = '';
 @state() private activeTab = 'summary';
 @state() private noHandle = false;

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
    this.actionItems = await getActionItemsByDocument(this.doc.id);
    this.noHandle = !(await hasDirectoryHandle());
    if (!this.noHandle) {
      await this._loadFile();
    }
   }
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

  render() {
   if (!this.doc) return html`<div class="p-6"><span class="loading loading-spinner loading-lg"></span></div>`;

   const d = this.doc;
   return html`
    <div class="p-6 max-w-4xl mx-auto space-y-6">
     <button class="btn btn-ghost btn-sm" @click=${() => window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/library' } }))}>
      ← Back to Library
     </button>

     <div class="bg-base-200 p-4">
      <div class="flex items-start justify-between">
       <div>
        <h1 class="text-xl font-bold">${d.originalName}</h1>
        <p class="text-sm opacity-50 mt-1">${d.originalPath}</p>
       </div>
       <div class="flex items-center gap-2">
        <span class="badge ${d.urgency === 'critical' ? 'badge-error' : d.urgency === 'high' ? 'badge-warning' : 'badge-ghost'}">${d.urgency}</span>
        ${d.taxRelevant ? html`<span class="badge badge-warning">Tax Relevant</span>` : ''}
        <button class="btn btn-error btn-sm" @click=${this._deleteDoc}>
         <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
         </svg>
         Delete
        </button>
       </div>
      </div>
     </div>

      <div role="tablist" class="tabs tabs-box bg-base-200">
       <button role="tab" class="tab ${this.activeTab === 'summary' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'summary'}>Summary</button>
       <button role="tab" class="tab ${this.activeTab === 'file' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'file'}>File</button>
       <button role="tab" class="tab ${this.activeTab === 'chat' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'chat'}>Chat</button>
      </div>

     ${this.activeTab === 'summary' ? html`
      <div class="space-y-6">

       <div class="bg-base-200 p-4 space-y-3">
        <div class="flex flex-wrap gap-3 text-sm">
         <div><span class="opacity-50">Category:</span> <strong>${d.category}</strong></div>
         <div><span class="opacity-50">Year:</span> <strong>${d.year}</strong></div>
         ${d.month ? html`<div><span class="opacity-50">Month:</span> <strong>${d.month}</strong></div>` : ''}
         ${d.storedPath ? html`<div><span class="opacity-50">Location:</span> <strong>${d.storedPath}</strong></div>` : ''}
        </div>

        ${d.status === 'error' ? html`
         <div class="alert alert-error text-sm">
          <span>${d.error || 'Analysis failed'}</span>
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
         <action-item-list .items=${this.actionItems}></action-item-list>
        </div>
       ` : ''}

       ${d.tags.length > 0 ? html`
        <div class="flex flex-wrap gap-2">
         ${d.tags.map(t => html`<span class="badge badge-outline">${t}</span>`)}
        </div>
       ` : ''}

       ${d.extractedText ? html`
        <details class="bg-base-200 p-4">
         <summary class="cursor-pointer font-semibold text-sm">View Extracted Text (${d.extractedText.length} chars)</summary>
         <pre class="mt-3 text-xs overflow-auto max-h-96 whitespace-pre-wrap font-mono">${d.extractedText}</pre>
        </details>
       ` : ''}
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
