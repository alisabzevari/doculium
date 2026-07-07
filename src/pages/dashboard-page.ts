import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { getPendingActionItems, getStats, getRecentDocuments } from '../db/document-store.ts';
import type { ActionItem, Document } from '../db/schema.ts';
import { getDirectoryHandle, getDirectoryName } from '../utils/handle-store.ts';
import { scanAndImport, type ScanProgress } from '../services/bulk-import.ts';

@customElement('dashboard-page')
export class DashboardPage extends LitElement {
 createRenderRoot() { return this; }
 @state() private stats = { docs: 0, analyzed: 0, pending: 0, urgent: 0 };
 @state() private actionItems: ActionItem[] = [];
 @state() private recentDocs: Document[] = [];
 @state() private scanning = false;
 @state() private scanProgress: ScanProgress | null = null;
 @state() private noFolder = false;
 @state() private folderName: string | null = null;

 async connectedCallback() {
  super.connectedCallback();
  this.folderName = getDirectoryName();
  const handle = await getDirectoryHandle();
  this.noFolder = !handle;
  await this._refresh();
 }

 private async _refresh() {
  this.stats = await getStats();
  this.actionItems = await getPendingActionItems();
  this.recentDocs = await getRecentDocuments(6);
 }

 async startScan() {
  const handle = await getDirectoryHandle();
  if (!handle) {
   this.noFolder = true;
   return;
  }
  this.scanning = true;
  this.scanProgress = null;
  try {
   const result = await scanAndImport(handle, (p) => {
    this.scanProgress = { ...p };
    this.requestUpdate();
   });
   await this._refresh();
  } catch {}
  this.scanning = false;
  this.scanProgress = null;
 }

  render() {
   const incompleteItems = this.actionItems.filter(i => !i.completed);

   return html`
    <div class="p-6 space-y-6 max-w-full">
     <div class="flex items-center justify-between flex-wrap gap-2">
      <h1 class="text-2xl font-bold">Dashboard</h1>
      ${!this.scanning ? html`
       <button class="tooltip btn btn-primary btn-sm" data-tip="Scan document folder for new files" @click=${this.startScan} ?disabled=${this.noFolder}>
        <icon-svg name="scan" size="16"></icon-svg>
        ${this.noFolder ? 'No folder set' : 'Scan for new files'}
       </button>
      ` : ''}
     </div>

     ${this.noFolder ? html`
      <div class="bg-base-200 p-6 rounded-box text-center space-y-3">
       <p class="text-warning font-semibold">No folder selected</p>
       <p class="text-sm opacity-70">Go to <a href="/settings" class="link link-primary" @click=${(e: Event) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/settings' } })); }}>Settings → Storage</a> to select your document folder first.</p>
      </div>
     ` : ''}

     ${this.scanning ? html`
      <div class="bg-base-200 p-6 rounded-box text-center space-y-4">
       <h3 class="font-semibold">Scanning for new files...</h3>
       ${this.scanProgress ? html`
        <progress class="progress progress-primary w-full" value="${this.scanProgress.current}" max="${Math.max(this.scanProgress.total, 1)}"></progress>
        <p class="text-sm opacity-70 truncate" title="${this.scanProgress.currentFile}">${this.scanProgress.currentFile}</p>
        <p class="text-xs opacity-50">${this.scanProgress.imported} imported · ${this.scanProgress.skipped} skipped</p>
       ` : html`
        <span class="loading loading-spinner loading-lg"></span>
       `}
      </div>
     ` : ''}

     ${!this.scanning ? html`
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
       <div class="bg-base-200 p-4 rounded-box text-center">
         <p class="text-2xl font-bold text-primary">${this.stats.docs}</p>
         <p class="text-xs opacity-60">Total</p>
       </div>
       <div class="bg-base-200 p-4 rounded-box text-center">
         <p class="text-2xl font-bold text-success">${this.stats.analyzed}</p>
         <p class="text-xs opacity-60">Analyzed</p>
       </div>
       <div class="bg-base-200 p-4 rounded-box text-center">
         <p class="text-2xl font-bold text-warning">${this.stats.pending}</p>
         <p class="text-xs opacity-60">Pending</p>
       </div>
       <div class="bg-base-200 p-4 rounded-box text-center">
         <p class="text-2xl font-bold text-error">${this.stats.urgent}</p>
         <p class="text-xs opacity-60">Urgent</p>
       </div>
      </div>

     ${incompleteItems.length > 0 ? html`
      <section class="bg-base-200 p-4 rounded-box">
       <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold opacity-70 uppercase tracking-wide">Open Action Items</h2>
        <span class="badge badge-sm">${incompleteItems.length}</span>
       </div>
       <action-item-list .items=${this.actionItems}></action-item-list>
      </section>
     ` : this.stats.docs > 0 ? html`
      <div class="bg-base-200 p-4 rounded-box text-center text-sm opacity-50">
       No pending action items.
      </div>
     ` : ''}

      <section>
       <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold opacity-70 uppercase tracking-wide">Recent Documents</h2>
        ${this.recentDocs.length > 0 ? html`
         <a class="text-xs link link-hover" @click=${() => window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/library' } }))}>View all</a>
        ` : ''}
       </div>
       ${this.recentDocs.length > 0 ? html`
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
         ${this.recentDocs.map(doc => html`
          <document-card .document=${doc} @click=${() => this._openDoc(doc.id)}></document-card>
         `)}
        </div>
       ` : html`
        <div class="bg-base-200 p-8 rounded-box text-center space-y-3">
         <p class="text-sm opacity-50">No documents yet</p>
         <button class="btn btn-primary btn-sm" @click=${this.startScan}>
          <icon-svg name="scan" size="16"></icon-svg>
          Start Scanning
         </button>
        </div>
       `}
      </section>
     ` : ''}
    </div>
   `;
  }

 private _openDoc(id: string) {
  window.dispatchEvent(new CustomEvent('navigate', { detail: { path: `/library/${id}` } }));
 }
}
