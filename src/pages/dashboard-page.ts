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
      <div class="stat-title text-xs opacity-60">Total Documents</div>
      <div class="stat-value text-2xl">${this.stats.docs}</div>
     </div>
     <div class="stat bg-base-200 p-4">
      <div class="stat-title text-xs opacity-60">Analyzed</div>
      <div class="stat-value text-2xl text-success">${this.stats.analyzed}</div>
     </div>
     <div class="stat bg-base-200 p-4">
      <div class="stat-title text-xs opacity-60">Pending Analysis</div>
      <div class="stat-value text-2xl text-warning">${this.stats.pending}</div>
     </div>
     <div class="stat bg-base-200 p-4">
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
