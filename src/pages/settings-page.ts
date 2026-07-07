import { LitElement, html } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { getSettings, saveSettings, type AppSettings } from '../db/config-store.ts';
import { db } from '../db/schema.ts';
import { resetProvider, testConnection, getAIProvider } from '../ai/analyzer.ts';
import { initTurso, syncDocuments, getLastError } from '../db/turso-sync.ts';
import type { Category } from '../db/schema.ts';
import type { LocalProvider } from '../ai/local.ts';
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
  @state() private downloadProgress = '';
  @state() private downloadPercent = 0;
  @state() private downloadStatus: '' | 'downloading' | 'done' | 'error' = '';
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
      this.syncStatus = `✅ Synced! Pushed: ${result.pushed}, Pulled: ${result.pulled}, Deleted: ${result.deleted}`;
    }
  }

  private async addCategory() {
    const name = this.newCategoryName.trim();
    if (!name) return;
    const cat: Category = {
      id: uuid(),
      name,
      icon: '📄',
      color: 'ghost',
      isBuiltIn: false,
      order: this.categories.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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

  private async _downloadLocalModel() {
    if (!this.settings) return;
    this.downloadStatus = 'downloading';
    this.downloadProgress = 'Starting download...';
    this.requestUpdate();

    await this.save();

    try {
      const provider = await getAIProvider() as LocalProvider;
      const modelId = this.settings.aiProvider.model || 'qwen2.5-1.5b';
      await provider.downloadModel(modelId, (progress) => {
        this.downloadPercent = progress;
        this.downloadProgress = `${(progress * 100).toFixed(1)}%`;
        this.requestUpdate();
      });
      this.downloadStatus = 'done';
      this.downloadPercent = 1;
      this.downloadProgress = 'Model ready!';
    } catch (err: any) {
      this.downloadStatus = 'error';
      this.downloadProgress = err.message || 'Download failed';
    }
  }

  private async _clearModelCache() {
    if (!this.settings) return;
    const cacheName = 'webllm';
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('webllm') || k.includes('mlc') || k.includes('web-llm')).map(k => caches.delete(k)));
    const provider = await getAIProvider() as LocalProvider | null;
    if (provider && 'unload' in provider) {
      await (provider as any).unload?.();
    }
    resetProvider();
    this.downloadStatus = '';
    this.downloadProgress = 'Cache cleared.';
    this.toast?.show('Model cache cleared');
  }

  render() {
    if (!this.settings) return html`<div class="p-6"><span class="loading loading-spinner"></span></div>`;

    return html`
      <div class="p-6 max-w-2xl mx-auto space-y-6">
        <h1 class="text-2xl font-bold">Settings</h1>

        <div role="tablist" class="tabs tabs-box bg-base-200">
          <button role="tab" class="tab ${this.activeTab === 'ai' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'ai'}>
           <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M17 10.4A7 7 0 0 1 5 14"/><path d="M12 14v8"/><path d="M8 18h8"/></svg>
           AI Provider
          </button>
          <button role="tab" class="tab ${this.activeTab === 'prompts' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'prompts'}>
           <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
           AI Prompts
          </button>
          <button role="tab" class="tab ${this.activeTab === 'categories' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'categories'}>
           <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
           Categories
          </button>
          <button role="tab" class="tab ${this.activeTab === 'storage' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'storage'}>
           <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
           Storage
          </button>
          <button role="tab" class="tab ${this.activeTab === 'theme' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'theme'}>
           <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
           Theme
          </button>
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
                <option value="local">Local AI (WebLLM)</option>
              </select>
            </div>

            ${this.settings.aiProvider.type === 'local' ? html`
              <div>
                <label class="label">Local Model</label>
                <select class="select w-full" .value=${this.settings.aiProvider.model}
                  @change=${(e: Event) => {
                    const v = (e.target as HTMLSelectElement).value;
                    this.settings = this.settings ? { ...this.settings, aiProvider: { ...this.settings.aiProvider, model: v } } : null;
                  }}>
                  <optgroup label="Fast (low VRAM)">
                    <option value="SmolLM2-360M-Instruct-q4f16_1-MLC">SmolLM2 360M (~376 MB VRAM)</option>
                    <option value="Llama-3.2-1B-Instruct-q4f16_1-MLC">Llama 3.2 1B (~879 MB VRAM)</option>
                    <option value="Qwen2.5-0.5B-Instruct-q4f16_1-MLC">Qwen 2.5 0.5B (~945 MB VRAM)</option>
                  </optgroup>
                  <optgroup label="Balanced">
                    <option value="Qwen2.5-1.5B-Instruct-q4f16_1-MLC">Qwen 2.5 1.5B (~1.6 GB VRAM)</option>
                    <option value="Llama-3.2-3B-Instruct-q4f16_1-MLC">Llama 3.2 3B (~2.3 GB VRAM)</option>
                    <option value="Qwen2.5-3B-Instruct-q4f16_1-MLC">Qwen 2.5 3B (~2.5 GB VRAM)</option>
                  </optgroup>
                  <optgroup label="High-end (8GB+ VRAM)">
                    <option value="Qwen2.5-7B-Instruct-q4f16_1-MLC">Qwen 2.5 7B (~5.1 GB VRAM)</option>
                    <option value="Llama-3.1-8B-Instruct-q4f16_1-MLC">Llama 3.1 8B (~5 GB VRAM)</option>
                  </optgroup>
                </select>
                <p class="text-xs opacity-50 mt-1">Requires WebGPU (Chrome/Edge).</p>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs">WebGPU:</span>
                ${'gpu' in navigator && navigator.gpu ? html`
                  <span class="badge badge-success badge-sm">Available</span>
                ` : html`
                  <span class="badge badge-error badge-sm">Not available</span>
                `}
              </div>
              <div class="space-y-2">
                <button class="btn btn-primary btn-sm" ?disabled=${this.downloadStatus === 'downloading' || !('gpu' in navigator && navigator.gpu)} @click=${this._downloadLocalModel}>
                  ${this.downloadStatus === 'downloading' ? html`<span class="loading loading-spinner loading-xs"></span>` : ''}
                  ${this.downloadStatus === 'done' ? 'Re-download Model' : this.downloadStatus === 'downloading' ? 'Downloading...' : 'Download Model'}
                </button>
                ${this.downloadStatus === 'downloading' ? html`
                  <progress class="progress progress-primary w-full" value="${Math.round(this.downloadPercent * 100)}" max="100"></progress>
                ` : ''}
                ${this.downloadProgress ? html`
                  <p class="text-xs opacity-70">${this.downloadProgress}</p>
                ` : ''}
                ${this.downloadStatus === 'done' ? html`
                  <p class="text-xs text-success">Model cached and ready to use.</p>
                ` : ''}
                ${this.downloadStatus === 'error' ? html`
                  <p class="text-xs text-error">${this.downloadProgress}</p>
                ` : ''}
              </div>
              <div class="flex gap-2">
                ${this.downloadStatus === 'done' ? html`
                  <button class="btn btn-ghost btn-xs" @click=${this._clearModelCache}>Clear Cache</button>
                ` : ''}
              </div>
            ` : html`
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
            `}

            <div class="flex gap-2">
              <button class="tooltip btn btn-primary" data-tip="Save settings" @click=${this.save}>Save</button>
              <button class="tooltip btn btn-ghost" data-tip="Test AI connection" @click=${this.testAI}>Test Connection</button>
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
            <button class="tooltip btn btn-primary" data-tip="Save prompts" @click=${this.save}>Save Prompts</button>
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
                <button class="tooltip btn btn-primary" data-tip="Select document folder" @click=${this._selectFolder}>
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
              <button class="tooltip btn btn-primary" data-tip="Save settings" @click=${this.save}>Save</button>
              <button class="tooltip btn btn-ghost" data-tip="Test Turso connection" @click=${this.testTurso}>Test Connection</button>
              <button class="btn btn-ghost" @click=${this.sync}>Sync Now</button>
            </div>
            ${this.syncStatus ? html`<p class="text-sm">${this.syncStatus}</p>` : ''}
          </div>
        ` : ''}

        ${this.activeTab === 'theme' ? html`
          <div class="bg-base-200 p-4 space-y-4">
            <div>
              <label class="label">Theme</label>
              <select class="select w-full" .value=${this.settings.theme}
                @change=${(e: Event) => {
                  const theme = (e.target as HTMLSelectElement).value;
                  document.documentElement.setAttribute('data-theme', theme);
                  this.settings = this.settings ? { ...this.settings, theme } : null;
                  this.save();
                }}>
                <optgroup label="Light">
                  <option value="cupcake">Cupcake</option>
                  <option value="light">Light</option>
                  <option value="retro">Retro</option>
                  <option value="corporate">Corporate</option>
                  <option value="winter">Winter</option>
                  <option value="garden">Garden</option>
                  <option value="lofi">Lo-Fi</option>
                  <option value="pastel">Pastel</option>
                  <option value="fantasy">Fantasy</option>
                  <option value="lemonade">Lemonade</option>
                  <option value="nord">Nord</option>
                </optgroup>
                <optgroup label="Dark">
                  <option value="dark">Dark</option>
                  <option value="night">Night</option>
                  <option value="forest">Forest</option>
                  <option value="business">Business</option>
                  <option value="coffee">Coffee</option>
                  <option value="dim">Dim</option>
                  <option value="sunset">Sunset</option>
                  <option value="luxury">Luxury</option>
                  <option value="dracula">Dracula</option>
                  <option value="synthwave">Synthwave</option>
                  <option value="black">Black</option>
                </optgroup>
              </select>
            </div>
          </div>
        ` : ''}
      </div>
      <toast-notification></toast-notification>
    `;
  }
}
