import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { getPendingActionItems, getStats, getAllDocuments } from '../db/document-store.ts';
import type { ActionItem, Document } from '../db/schema.ts';

@customElement('dashboard-page')
export class DashboardPage extends LitElement {
 createRenderRoot() { return this; }
 @state() private stats = { docs: 0, analyzed: 0, pending: 0, urgent: 0 };
 @state() private actionItems: ActionItem[] = [];
 @state() private recentDocs: Document[] = [];

 async connectedCallback() {
  super.connectedCallback();
  this.stats = await getStats();
  this.actionItems = await getPendingActionItems();
  const docs = await getAllDocuments();
  this.recentDocs = docs.slice(0, 6);
 }

 render() {
  return html`
   <div class="p-6 space-y-6">
    <h1 class="text-2xl font-bold">Dashboard</h1>

     <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="stat bg-base-200 p-4">
       <div class="stat-figure text-primary">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
       </div>
       <div class="stat-title text-xs opacity-60">Total Documents</div>
       <div class="stat-value text-2xl">${this.stats.docs}</div>
      </div>
      <div class="stat bg-base-200 p-4">
       <div class="stat-figure text-success">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
       </div>
       <div class="stat-title text-xs opacity-60">Analyzed</div>
       <div class="stat-value text-2xl text-success">${this.stats.analyzed}</div>
      </div>
      <div class="stat bg-base-200 p-4">
       <div class="stat-figure text-warning">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
       </div>
       <div class="stat-title text-xs opacity-60">Pending Analysis</div>
       <div class="stat-value text-2xl text-warning">${this.stats.pending}</div>
      </div>
      <div class="stat bg-base-200 p-4">
       <div class="stat-figure text-error">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
       </div>
       <div class="stat-title text-xs opacity-60">Urgent Items</div>
       <div class="stat-value text-2xl text-error">${this.stats.urgent}</div>
      </div>
     </div>

    ${this.stats.urgent > 0 ? html`
     <section class="bg-base-200 p-4">
      <h2 class="text-lg font-semibold mb-3 flex items-center gap-2">
       <span class="badge badge-error">${this.stats.urgent}</span>
       Action Items
      </h2>
      <action-item-list .items=${this.actionItems}></action-item-list>
     </section>
    ` : ''}

    <section>
     <h2 class="text-lg font-semibold mb-3">Recent Documents</h2>
     <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${this.recentDocs.map(doc => html`
       <document-card .document=${doc} @click=${() => this._openDoc(doc.id)}></document-card>
      `)}
      ${this.recentDocs.length === 0 ? html`
       <p class="col-span-full text-sm opacity-50 text-center py-8">
        No documents yet. Go to <a href="/scan" class="link link-primary">Scan</a> to import documents.
       </p>
      ` : ''}
     </div>
    </section>
   </div>
  `;
 }

 private _openDoc(id: string) {
  window.dispatchEvent(new CustomEvent('navigate', { detail: { path: `/library/${id}` } }));
 }
}
