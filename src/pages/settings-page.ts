import { LitElement, html } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { getSettings, saveSettings, type AppSettings } from '../db/config-store.ts';
import { db } from '../db/schema.ts';
import { resetProvider, testConnection, getAIProvider } from '../ai/analyzer.ts';
import { initTurso, syncDocuments, getLastError, pushSettingsNow, isTursoConnected } from '../db/turso-sync.ts';
import type { Category } from '../db/schema.ts';
import type { LocalProvider } from '../ai/local.ts';
import { v4 as uuid } from 'uuid';
import { type ToastNotification } from '../components/toast-notification.ts';
import QRCode from 'qrcode';
import { buildShareUrl } from '../utils/share-config.ts';
import { getStorageProvider, getStorageConfig, saveStorageConfig, resetStorageProvider, recreateStorageProvider } from '../services/storage/registry.ts';
import type { StorageConfig } from '../services/storage/types.ts';
import { DropboxStorageProvider } from '../services/storage/dropbox.ts';

@customElement('settings-page')
export class SettingsPage extends LitElement {
  createRenderRoot() { return this; }
  @state() private settings: AppSettings | null = null;
  @state() private categories: Category[] = [];
  @state() private connectionStatus = '';
  @state() private syncStatus = '';
  @state() private syncProgress: { phase: string; current: number; total: number } | null = null;
  @state() private newCategoryName = '';
  @state() private activeTab = 'ai';
  @state() private folderName: string | null = null;
  @state() private downloadProgress = '';
  @state() private downloadPercent = 0;
  @state() private downloadStatus: '' | 'downloading' | 'done' | 'error' = '';
  @state() private shareQrDataUrl = '';
  @state() private storageConfig: StorageConfig = { type: 'local' };
  @state() private storageReady = false;
  @state() private dropboxConnecting = false;
  @state() private dropboxError = '';
  @state() private dropboxAppKeyInput = '';
  @state() private showFolderBrowser = false;
  @state() private folderBrowserPath = '';
  @state() private folderBrowserFolders: { name: string; path: string }[] = [];
  @state() private folderBrowserLoading = false;
  @query('toast-notification') toast!: ToastNotification;

  async connectedCallback() {
    super.connectedCallback();
    this.settings = await getSettings();
    document.documentElement.setAttribute('data-theme', this.settings.theme);
    this.categories = await db.categories.toArray();

    this.storageConfig = getStorageConfig();
    this.dropboxAppKeyInput = this.storageConfig.dropboxAppKey || '';

    const provider = await getStorageProvider();
    this.storageReady = await provider.isReady();
    if (this.storageConfig.type === 'local' && 'pickDirectory' in provider) {
      const localProvider = provider as any;
      this.folderName = localProvider.getDirectoryName();
    } else if (this.storageConfig.type === 'dropbox') {
      this.folderName = this.storageConfig.dropboxAccountName || null;
    }

    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    if (code && this.storageConfig.dropboxAppKey) {
      await this._handleDropboxCallback(code);
    }
  }

  private async _handleDropboxCallback(code: string) {
    this.dropboxConnecting = true;
    try {
      const provider = await getStorageProvider();
      const redirectUri = `${window.location.origin}${import.meta.env.BASE_URL}settings`;
      const dropboxProvider = provider as DropboxStorageProvider;
      await dropboxProvider.handleAuthRedirect(code, this.storageConfig.dropboxAppKey!, redirectUri);
      this.storageConfig = getStorageConfig();
      this.folderName = this.storageConfig.dropboxAccountName || null;
      this.storageReady = true;
      this.dropboxConnecting = false;
      this.toast?.show('Connected to Dropbox');
      await this._openFolderBrowser();

      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('code');
      cleanUrl.searchParams.delete('state');
      window.history.replaceState({}, '', cleanUrl.toString());
    } catch (err: any) {
      this.dropboxError = err.message;
      this.dropboxConnecting = false;
    }
  }

  private async save() {
    if (!this.settings) return;
    await saveSettings(this.settings);
    resetProvider();
    if (isTursoConnected()) {
      await pushSettingsNow();
    }
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
    this.syncProgress = null;
    await this.save();
    const ok = await initTurso(this.settings.tursoUrl, this.settings.tursoToken);
    if (!ok) {
      this.syncStatus = `❌ ${getLastError()}`;
      return;
    }
    const result = await syncDocuments((p) => {
      this.syncProgress = { ...p };
      this.requestUpdate();
    });
    this.syncProgress = null;
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
    if (isTursoConnected()) {
      await pushSettingsNow();
    }
  }

  private async removeCategory(id: string) {
    const now = new Date().toISOString();
    await db.pendingDeletions.add({ id: `cat-${id}`, tableName: 'categories', recordId: id, createdAt: now });
    await db.categories.delete(id);
    this.categories = this.categories.filter(c => c.id !== id);
    if (isTursoConnected()) {
      await pushSettingsNow();
    }
  }

  private async _selectLocalFolder() {
    saveStorageConfig({ ...this.storageConfig, type: 'local' });
    resetStorageProvider();
    const provider = await getStorageProvider() as any;
    if (provider.pickDirectory) {
      const result = await provider.pickDirectory();
      if (result) {
        this.folderName = result.name;
        this.storageConfig = getStorageConfig();
        this.storageReady = true;
      }
    }
  }

  private async _selectStorageType(e: Event) {
    const type = (e.target as HTMLSelectElement).value as 'local' | 'dropbox';
    this.storageConfig = { ...this.storageConfig, type };
    saveStorageConfig(this.storageConfig);
    resetStorageProvider();
    this.storageReady = false;
    this.dropboxError = '';
    if (type === 'local') {
      const provider = await getStorageProvider() as any;
      if (provider.getDirectoryName) {
        this.folderName = provider.getDirectoryName();
      }
      this.storageReady = await getStorageProvider().then(p => p.isReady());
    } else {
      this.folderName = this.storageConfig.dropboxAccountName || null;
      this.storageReady = await getStorageProvider().then(p => p.isReady());
    }
  }

  private async _connectDropbox() {
    const appKey = this.dropboxAppKeyInput.trim();
    if (!appKey) {
      this.dropboxError = 'Please enter your Dropbox App Key';
      return;
    }
    this.dropboxError = '';
    this.dropboxConnecting = true;

    saveStorageConfig({ ...this.storageConfig, dropboxAppKey: appKey });
    this.storageConfig = getStorageConfig();
    resetStorageProvider();

    try {
      const provider = await getStorageProvider() as DropboxStorageProvider;
      const redirectUri = `${window.location.origin}${import.meta.env.BASE_URL}settings`;
      const authUrl = await provider.getAuthUrl(appKey, redirectUri);
      window.location.href = authUrl;
    } catch (err: any) {
      this.dropboxError = err.message;
      this.dropboxConnecting = false;
    }
  }

  private async _disconnectDropbox() {
    this.storageConfig = {
      ...this.storageConfig,
      dropboxAccessToken: undefined,
      dropboxRefreshToken: undefined,
      dropboxTokenExpiresAt: undefined,
      dropboxAccountName: undefined,
      dropboxPath: undefined,
    };
    saveStorageConfig(this.storageConfig);
    resetStorageProvider();
    this.folderName = null;
    this.storageReady = false;
    this.toast?.show('Disconnected from Dropbox');
  }

  private _updateFolderName() {
    if (this.storageConfig.type === 'dropbox' && this.storageConfig.dropboxAccessToken) {
      const path = this.storageConfig.dropboxPath || '';
      this.folderName = path ? path : '(root)';
    } else if (this.storageConfig.type === 'local') {
      this.folderName = this.storageConfig.localFolderName || null;
    }
  }

  private async _openFolderBrowser() {
    this.showFolderBrowser = true;
    this.folderBrowserPath = '';
    await this._loadFolderBrowser('');
  }

  private async _loadFolderBrowser(relPath: string) {
    this.folderBrowserLoading = true;
    this.folderBrowserPath = relPath;
    try {
      const provider = await getStorageProvider() as DropboxStorageProvider;
      this.folderBrowserFolders = await provider.listFolders(relPath);
    } catch {
      this.folderBrowserFolders = [];
    }
    this.folderBrowserLoading = false;
  }

  private async _navigateDropboxFolder(path: string) {
    await this._loadFolderBrowser(path);
  }

  private async _selectDropboxFolder() {
    const path = this.folderBrowserPath || '';
    this.storageConfig = { ...this.storageConfig, dropboxPath: path };
    saveStorageConfig(this.storageConfig);
    resetStorageProvider();
    await getStorageProvider();
    this.showFolderBrowser = false;
    this._updateFolderName();
    this.storageReady = true;
    this.toast?.show(`Dropbox folder set to ${path || '(root)'}`);
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

  private async _generateShareQr() {
    if (!this.settings) return;
    const config = {
      aiType: this.settings.aiProvider.type,
      aiBaseUrl: this.settings.aiProvider.baseUrl,
      aiApiKey: this.settings.aiProvider.apiKey,
      aiModel: this.settings.aiProvider.model,
      tursoUrl: this.settings.tursoUrl,
      tursoToken: this.settings.tursoToken,
    };
    const url = buildShareUrl(config);
    try {
      this.shareQrDataUrl = await QRCode.toDataURL(url, { width: 256, margin: 2 });
    } catch {
      this.toast?.show('Failed to generate QR code');
    }
  }

  render() {
    if (!this.settings) return html`<div class="p-6"><span class="loading loading-spinner"></span></div>`;

    return html`
      <div class="p-6 max-w-2xl mx-auto space-y-6">
        <h1 class="text-2xl font-bold">Settings</h1>

        <div role="tablist" class="tabs tabs-box bg-base-200 overflow-x-auto">
           <button role="tab" class="tab ${this.activeTab === 'ai' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'ai'}>
            <icon-svg name="bot" size="16"></icon-svg>
            AI Provider
           </button>
           <button role="tab" class="tab ${this.activeTab === 'prompts' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'prompts'}>
            <icon-svg name="edit" size="16"></icon-svg>
            AI Prompts
           </button>
           <button role="tab" class="tab ${this.activeTab === 'categories' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'categories'}>
            <icon-svg name="columns" size="16"></icon-svg>
            Categories
           </button>
           <button role="tab" class="tab ${this.activeTab === 'storage' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'storage'}>
            <icon-svg name="database" size="16"></icon-svg>
            Storage
           </button>
            <button role="tab" class="tab ${this.activeTab === 'theme' ? 'tab-active' : ''}" @click=${() => this.activeTab = 'theme'}>
             <icon-svg name="sun" size="16"></icon-svg>
             Theme
            </button>
            <button role="tab" class="tab ${this.activeTab === 'share' ? 'tab-active' : ''}" @click=${() => { this.activeTab = 'share'; this._generateShareQr(); }}>
             <icon-svg name="share" size="16"></icon-svg>
             Share
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

            <div class="flex gap-2 flex-wrap">
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
            <div>
              <label class="label">Improve Text Prompt</label>
              <p class="text-xs opacity-50 mb-2">Used to convert raw extracted PDF text into clean markdown before analysis.</p>
              <textarea class="textarea w-full font-mono text-xs leading-relaxed" rows="10" .value=${this.settings.improvePrompt}
                @change=${(e: Event) => { const v = (e.target as HTMLTextAreaElement).value; this.settings = this.settings ? { ...this.settings, improvePrompt: v } : null; }}>
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
              <label class="label">Storage Type</label>
              <select class="select w-full" .value=${this.storageConfig.type} @change=${this._selectStorageType}>
                <option value="local">Local Folder</option>
                <option value="dropbox">Dropbox</option>
              </select>
            </div>

            ${this.storageConfig.type === 'local' ? html`
              <div>
                <label class="label">Document Folder</label>
                <div class="flex items-center gap-3">
                  <button class="tooltip btn btn-primary" data-tip="Select document folder" @click=${this._selectLocalFolder}>
                    <icon-svg name="folder" size="16"></icon-svg>
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
            ` : html`
              <div>
                <label class="label">Dropbox App Key</label>
                <input class="input w-full" type="text" .value=${this.dropboxAppKeyInput}
                  @input=${(e: Event) => this.dropboxAppKeyInput = (e.target as HTMLInputElement).value}
                  placeholder="Your Dropbox app key" />
                <p class="text-xs opacity-50 mt-1">
                  Create an app at
                  <a href="https://www.dropbox.com/developers/apps" target="_blank" class="link link-primary">Dropbox Developer Console</a>
                  and enter the App Key above.
                </p>
              </div>

              ${this.storageConfig.dropboxAccessToken ? html`
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <div class="flex items-center gap-2">
                    <span class="badge badge-success badge-sm">Connected</span>
                    <span class="text-sm opacity-70">${this.storageConfig.dropboxAccountName || 'Dropbox'}</span>
                    <button class="btn btn-ghost btn-xs text-error" @click=${this._disconnectDropbox}>Disconnect</button>
                  </div>
                </div>

                <div class="bg-base-300 p-3 rounded-box space-y-2">
                  <div class="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <label class="label text-xs py-0">Document Folder</label>
                      <p class="text-sm font-mono truncate max-w-[250px]" title="${this.folderBrowserPath || this.storageConfig.dropboxPath || '(root)'}">
                        ${this.storageConfig.dropboxPath ? '/' + this.storageConfig.dropboxPath : '/'}
                      </p>
                    </div>
                    <button class="btn btn-primary btn-sm" @click=${this._openFolderBrowser}>
                      <icon-svg name="folder" size="14"></icon-svg>
                      Change Folder
                    </button>
                  </div>
                </div>

                ${this.showFolderBrowser ? html`
                  <div class="bg-base-300 p-3 rounded-box space-y-2 max-h-64 overflow-y-auto">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-xs font-semibold opacity-70">Select folder</span>
                      <button class="btn btn-ghost btn-xs" @click=${() => { this.showFolderBrowser = false; }}>Cancel</button>
                    </div>
                    <p class="text-xs font-mono opacity-60">/${this.folderBrowserPath}</p>
                    <div class="space-y-1">
                      ${this.folderBrowserPath ? html`
                        <button class="btn btn-ghost btn-xs w-full justify-start gap-2" @click=${() => this._navigateDropboxFolder(this.folderBrowserPath.split('/').slice(0, -1).join('/'))}>
                          <icon-svg name="arrowUp" size="14"></icon-svg>
                          ..
                        </button>
                      ` : ''}
                      ${this.folderBrowserLoading ? html`
                        <div class="flex justify-center py-4"><span class="loading loading-spinner loading-xs"></span></div>
                      ` : this.folderBrowserFolders.length === 0 ? html`
                        <p class="text-xs opacity-50 text-center py-4">No subfolders</p>
                      ` : this.folderBrowserFolders.map(f => html`
                        <button class="btn btn-ghost btn-xs w-full justify-start gap-2" @click=${() => this._navigateDropboxFolder(f.path)}>
                          <icon-svg name="folder" size="14"></icon-svg>
                          ${f.name}
                        </button>
                      `)}
                    </div>
                    <button class="btn btn-primary btn-sm w-full mt-2" @click=${this._selectDropboxFolder}>
                      Use this folder
                    </button>
                  </div>
                ` : ''}
              ` : html`
                ${this.dropboxError ? html`<p class="text-xs text-error">${this.dropboxError}</p>` : ''}
                <button class="btn btn-primary" ?disabled=${this.dropboxConnecting || !this.dropboxAppKeyInput.trim()} @click=${this._connectDropbox}>
                  ${this.dropboxConnecting ? html`<span class="loading loading-spinner loading-xs"></span>` : ''}
                  ${this.dropboxConnecting ? 'Connecting...' : 'Connect to Dropbox'}
                </button>
                <p class="text-xs opacity-70 mt-2">
                  You will be redirected to Dropbox to authorize. Make sure your Dropbox app has
                  <code class="bg-base-300 px-1 rounded">${window.location.origin}${import.meta.env.BASE_URL}settings</code>
                  as a redirect URI.
                </p>
              `}
            `}

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
            <div class="flex gap-2 flex-wrap">
              <button class="tooltip btn btn-primary" data-tip="Save settings" @click=${this.save}>Save</button>
              <button class="tooltip btn btn-ghost" data-tip="Test Turso connection" @click=${this.testTurso}>Test Connection</button>
              <button class="btn btn-ghost" @click=${this.sync}>Sync Now</button>
            </div>
            ${this.syncProgress ? html`
              <div class="space-y-2">
                <progress class="progress progress-primary w-full" value="${this.syncProgress.current}" max="${Math.max(this.syncProgress.total, 1)}"></progress>
                <p class="text-xs opacity-70">${this.syncProgress.phase} (${this.syncProgress.current}/${this.syncProgress.total})</p>
              </div>
            ` : ''}
            ${this.syncStatus && !this.syncProgress ? html`<p class="text-sm">${this.syncStatus}</p>` : ''}
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

        ${this.activeTab === 'share' ? html`
          <div class="bg-base-200 p-4 space-y-4">
            <h3 class="font-semibold">Share Setup</h3>
            <p class="text-sm opacity-70">Generate a QR code that your partner can scan to install the app with the same AI and sync settings.</p>
            ${this.shareQrDataUrl ? html`
              <div class="flex flex-col items-center gap-3">
                <img src=${this.shareQrDataUrl} alt="Setup QR code" class="rounded-box" />
                <p class="text-xs opacity-50">Scan with your phone to install and auto-configure</p>
              </div>
            ` : html`
              <button class="btn btn-primary" @click=${this._generateShareQr}>
                <icon-svg name="share" size="16"></icon-svg>
                Generate QR Code
              </button>
            `}
          </div>
        ` : ''}
      </div>
      <toast-notification></toast-notification>
    `;
  }
}
