import { LitElement, html } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { getSettings, saveSettings, type AppSettings } from '../db/config-store.ts';
import { db } from '../db/schema.ts';
import { resetProvider, testConnection } from '../ai/analyzer.ts';
import { initTurso, syncDocuments, getLastError } from '../db/turso-sync.ts';
import type { Category } from '../db/schema.ts';
import { v4 as uuid } from 'uuid';
import { pickAndSaveDirectory, getDirectoryName } from '../utils/handle-store.ts';
import { type ToastNotification } from '../components/toast-notification.ts';

@customElement('settings-page')
export class SettingsPage extends LitElement {
  createRenderRoot() { return this; }
  @state() private settings: AppSettings | null = null;
  @state() private categories: Category[] = [];
  @state() private connectionStatus = '';
  @state() private syncStatus = '';
  @state() private newCategoryName = '';
  @state() private activeTab = 'ai';
  @state() private folderName: string | null = null;
  @query('toast-notification') toast!: ToastNotification;

  async connectedCallback() {
    super.connectedCallback();
    this.settings = await getSettings();
    document.documentElement.setAttribute('data-theme', this.settings.theme);
    this.categories = await db.categories.toArray();
    this.folderName = getDirectoryName();
  }

  private async save() {
    if (!this.settings) return;
    await saveSettings(this.settings);
    resetProvider();
    this.toast?.show('Settings saved');
  }

  private async testAI() {
    this.connectionStatus = 'Testing...';
    await this.save();
    const ok = await testConnection();
    this.connectionStatus = ok ? '✅ Connection successful!' : '❌ Connection failed';
  }

  private async testTurso() {
    if (!this.settings) return;
    this.syncStatus = 'Connecting...';
    await this.save();
    const ok = await initTurso(this.settings.tursoUrl, this.settings.tursoToken);
    this.syncStatus = ok ? '✅ Turso connected' : `❌ ${getLastError()}`;
  }

  private async sync() {
    if (!this.settings) return;
    this.syncStatus = 'Syncing...';
    await this.save();
    const ok = await initTurso(this.settings.tursoUrl, this.settings.tursoToken);
    if (!ok) {
      this.syncStatus = `❌ ${getLastError()}`;
      return;
    }
    const result = await syncDocuments();
    const err = getLastError();
    if (err) {
      this.syncStatus = `❌ ${err}`;
    } else {
      this.syncStatus = `✅ Synced! Pushed: ${result.pushed}`;
    }
  }

  private async addCategory() {
    const name = this.newCategoryName.trim();
    if (!name) return;
    const cat: Category = {
      id: uuid(),
      name,
      icon: '📄',
      color: '#6b7280',
      isBuiltIn: false,
      order: this.categories.length,
      createdAt: new Date().toISOString(),
    };
    await db.categories.add(cat);
    this.categories = [...this.categories, cat];
    this.newCategoryName = '';
  }

  private async removeCategory(id: string) {
    await db.categories.delete(id);
    this.categories = this.categories.filter(c => c.id !== id);
  }

  private async _selectFolder() {
    const result = await pickAndSaveDirectory();
    if (result) {
      this.folderName = result.name;
    }
  }

  render() {
    if (!this.settings) return html`<div class="p-6"><span class="loading loading-spinner"></span></div>`;

    return html`
      <div class="p-6 max-w-2xl mx-auto space-y-6">
        <h1 class="text-2xl font-bold">Settings</h1>

        <div role="tablist" class="tabs">
          <button role="tab" class="tab ${this.activeTab === 'ai' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'ai'}>AI Provider</button>
          <button role="tab" class="tab ${this.activeTab === 'prompts' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'prompts'}>AI Prompts</button>
          <button role="tab" class="tab ${this.activeTab === 'categories' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'categories'}>Categories</button>
          <button role="tab" class="tab ${this.activeTab === 'storage' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'storage'}>Storage</button>
          <button role="tab" class="tab ${this.activeTab === 'theme' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'theme'}>Theme</button>
        </div>

        ${this.activeTab === 'ai' ? html`
          <div class="bg-base-200 p-4 space-y-4">
            <div>
              <label class="label">Provider Type</label>
              <select class="select w-full" .value=${this.settings.aiProvider.type}
                @change=${(e: Event) => {
                  this.settings = this.settings ? { ...this.settings, aiProvider: { ...this.settings.aiProvider, type: (e.target as HTMLSelectElement).value as any } } : null;
                }}>
                <option value="openai-compatible">OpenAI Compatible</option>
                <option value="anthropic">Anthropic Claude</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </div>
            <div>
              <label class="label">Base URL</label>
              <input class="input w-full" type="url" .value=${this.settings.aiProvider.baseUrl}
                @change=${(e: Event) => { const v = (e.target as HTMLInputElement).value; this.settings = this.settings ? { ...this.settings, aiProvider: { ...this.settings.aiProvider, baseUrl: v } } : null; }}
                placeholder="https://api.openai.com" />
              <p class="text-xs opacity-50 mt-1">For Ollama: http://localhost:11434</p>
            </div>
            <div>
              <label class="label">API Key</label>
              <input class="input w-full" type="password" .value=${this.settings.aiProvider.apiKey}
                @change=${(e: Event) => { const v = (e.target as HTMLInputElement).value; this.settings = this.settings ? { ...this.settings, aiProvider: { ...this.settings.aiProvider, apiKey: v } } : null; }} />
            </div>
            <div>
              <label class="label">Model</label>
              <input class="input w-full" .value=${this.settings.aiProvider.model}
                @change=${(e: Event) => { const v = (e.target as HTMLInputElement).value; this.settings = this.settings ? { ...this.settings, aiProvider: { ...this.settings.aiProvider, model: v } } : null; }}
                placeholder="gpt-4o" />
            </div>
            <div class="flex gap-2">
              <button class="btn btn-primary" @click=${this.save}>Save</button>
              <button class="btn btn-ghost" @click=${this.testAI}>Test Connection</button>
            </div>
            ${this.connectionStatus ? html`<p class="text-sm">${this.connectionStatus}</p>` : ''}
          </div>
        ` : ''}

        ${this.activeTab === 'prompts' ? html`
          <div class="bg-base-200 p-4 space-y-4">
            <div>
              <label class="label">Analysis Prompt</label>
              <p class="text-xs opacity-50 mb-2">Used when analyzing documents. The list of valid categories is appended automatically.</p>
              <textarea class="textarea w-full font-mono text-xs leading-relaxed" rows="14" .value=${this.settings.analysisPrompt}
                @change=${(e: Event) => { const v = (e.target as HTMLTextAreaElement).value; this.settings = this.settings ? { ...this.settings, analysisPrompt: v } : null; }}>
              </textarea>
            </div>
            <div>
              <label class="label">Search Prompt</label>
              <p class="text-xs opacity-50 mb-2">Used when searching documents by relevance.</p>
              <textarea class="textarea w-full font-mono text-xs leading-relaxed" rows="6" .value=${this.settings.searchPrompt}
                @change=${(e: Event) => { const v = (e.target as HTMLTextAreaElement).value; this.settings = this.settings ? { ...this.settings, searchPrompt: v } : null; }}>
              </textarea>
            </div>
            <div>
              <label class="label">Chat Prompt</label>
              <p class="text-xs opacity-50 mb-2">Used when chatting with a document. The document content is appended automatically.</p>
              <textarea class="textarea w-full font-mono text-xs leading-relaxed" rows="6" .value=${this.settings.chatPrompt}
                @change=${(e: Event) => { const v = (e.target as HTMLTextAreaElement).value; this.settings = this.settings ? { ...this.settings, chatPrompt: v } : null; }}>
              </textarea>
            </div>
            <button class="btn btn-primary" @click=${this.save}>Save Prompts</button>
          </div>
        ` : ''}

        ${this.activeTab === 'categories' ? html`
          <div class="bg-base-200 p-4 space-y-4">
            <div class="space-y-2">
              ${this.categories.map(cat => html`
                <div class="flex items-center justify-between p-2 bg-base-300">
                  <div class="flex items-center gap-2">
                    <span>${cat.icon}</span>
                    <span>${cat.name}</span>
                    ${cat.isBuiltIn ? html`<span class="badge badge-xs badge-ghost">built-in</span>` : ''}
                  </div>
                  ${!cat.isBuiltIn ? html`
                    <button class="btn btn-ghost btn-xs text-error" @click=${() => this.removeCategory(cat.id)}>Remove</button>
                  ` : ''}
                </div>
              `)}
            </div>
            <div class="join w-full">
              <input class="input join-item flex-1" .value=${this.newCategoryName}
                @input=${(e: Event) => this.newCategoryName = (e.target as HTMLInputElement).value}
                placeholder="New category name" />
              <button class="btn btn-primary join-item" @click=${this.addCategory}>Add</button>
            </div>
          </div>
        ` : ''}

        ${this.activeTab === 'storage' ? html`
          <div class="bg-base-200 p-4 space-y-4">
            <div>
              <label class="label">Document Folder</label>
              <div class="flex items-center gap-3">
                <button class="btn btn-primary" @click=${this._selectFolder}>
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                  </svg>
                  ${this.folderName ? 'Change Folder' : 'Select Folder'}
                </button>
                ${this.folderName ? html`
                  <span class="text-sm opacity-70">${this.folderName}</span>
                ` : html`
                  <span class="text-sm text-warning">No folder selected</span>
                `}
              </div>
              <p class="text-xs opacity-50 mt-2">The selected folder is used across the app for scanning and viewing documents.</p>
            </div>
            <hr class="border-base-300">
            <div>
              <label class="label">Turso Database URL</label>
              <input class="input w-full" type="url" .value=${this.settings.tursoUrl}
                @change=${(e: Event) => { const v = (e.target as HTMLInputElement).value; this.settings = this.settings ? { ...this.settings, tursoUrl: v } : null; }}
                placeholder="libsql://your-db.turso.io" />
            </div>
            <div>
              <label class="label">Turso Auth Token</label>
              <input class="input w-full" type="password" .value=${this.settings.tursoToken}
                @change=${(e: Event) => { const v = (e.target as HTMLInputElement).value; this.settings = this.settings ? { ...this.settings, tursoToken: v } : null; }} />
            </div>
            <div class="flex gap-2">
              <button class="btn btn-primary" @click=${this.save}>Save</button>
              <button class="btn btn-ghost" @click=${this.testTurso}>Test Connection</button>
              <button class="btn btn-ghost" @click=${this.sync}>Sync Now</button>
            </div>
            ${this.syncStatus ? html`<p class="text-sm">${this.syncStatus}</p>` : ''}
          </div>
        ` : ''}

        ${this.activeTab === 'theme' ? html`
          <div class="bg-base-200 p-4 space-y-4">
            <div class="flex items-center justify-between">
              <label class="label">Dark Mode</label>
              <input type="checkbox" class="toggle" ?checked=${this.settings.theme === 'dark'}
                @change=${(e: Event) => {
                  const dark = (e.target as HTMLInputElement).checked;
                  const theme = dark ? 'dark' : 'cupcake';
                  document.documentElement.setAttribute('data-theme', theme);
                  this.settings = this.settings ? { ...this.settings, theme } : null;
                  this.save();
                }} />
            </div>
          </div>
        ` : ''}
      </div>
      <toast-notification></toast-notification>
    `;
  }
}
