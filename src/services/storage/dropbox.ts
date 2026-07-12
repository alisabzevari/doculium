import type { StorageProvider, FileEntry, StorageConfig } from './types.ts';
import { isSupportedFileType, inferType } from './utils.ts';

const DROPBOX_API = 'https://api.dropboxapi.com/2';
const DROPBOX_CONTENT = 'https://content.dropboxapi.com/2';
const DROPBOX_AUTH = 'https://www.dropbox.com/oauth2/authorize';
const DROPBOX_TOKEN = 'https://api.dropboxapi.com/oauth2/token';

interface DropboxEntry {
  '.tag': 'file' | 'folder';
  name: string;
  path_display: string;
  path_lower: string;
  size?: number;
}

export class DropboxStorageProvider implements StorageProvider {
  readonly type = 'dropbox';
  readonly supportsOAuth = true;
  private _config: StorageConfig;

  get name(): string {
    return this._config.dropboxAccountName || 'Dropbox';
  }

  constructor(config: StorageConfig) {
    this._config = config;
  }

  async init(): Promise<void> {
    if (this._config.dropboxAccessToken) {
      await this._ensureValidToken();
    }
  }

  async destroy(): Promise<void> {
    // no-op
  }

  async isReady(): Promise<boolean> {
    if (!this._config.dropboxAccessToken || !this._config.dropboxAppKey) return false;
    await this._ensureValidToken();
    return !!this._config.dropboxAccessToken;
  }

  private _rootPath(): string {
    const p = this._config.dropboxPath || '';
    return p.startsWith('/') ? p : p ? '/' + p : '';
  }

  private async _ensureValidToken(): Promise<void> {
    if (!this._config.dropboxAccessToken) return;
    if (this._config.dropboxTokenExpiresAt) {
      const expiresAt = parseInt(this._config.dropboxTokenExpiresAt, 10);
      if (!isNaN(expiresAt) && Date.now() < expiresAt - 60000) return;
    }
    if (!this._config.dropboxRefreshToken) {
      throw new Error('Dropbox token expired and no refresh token available. Reconnect in Settings.');
    }
    await this._refreshToken();
  }

  private async _refreshToken(): Promise<void> {
    if (!this._config.dropboxRefreshToken || !this._config.dropboxAppKey) return;
    const resp = await fetch(DROPBOX_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this._config.dropboxRefreshToken,
        client_id: this._config.dropboxAppKey,
      }),
    });
    if (!resp.ok) {
      this._config.dropboxAccessToken = undefined;
      this._config.dropboxRefreshToken = undefined;
      this._config.dropboxTokenExpiresAt = undefined;
      this._saveConfig();
      throw new Error('Dropbox token refresh failed. Please re-authenticate.');
    }
    const data = await resp.json();
    this._config.dropboxAccessToken = data.access_token;
    this._config.dropboxTokenExpiresAt = String(Date.now() + (data.expires_in || 14400) * 1000);
    this._saveConfig();
  }

  private _saveConfig(): void {
    try {
      localStorage.setItem('doculium-storage-config', JSON.stringify(this._config));
    } catch {
      // silent
    }
  }

  private _getToken(): string {
    if (!this._config.dropboxAccessToken) throw new Error('Dropbox not authenticated');
    return this._config.dropboxAccessToken;
  }

  private async _api(path: string, body?: unknown): Promise<any> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this._ensureValidToken();
        const resp = await fetch(DROPBOX_API + path, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this._getToken()}`,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (resp.status === 401 && attempt === 0 && this._config.dropboxRefreshToken) {
          await this._refreshToken();
          continue;
        }
        if (!resp.ok) {
          const err = await resp.text();
          throw new Error(`Dropbox API error (${resp.status}): ${err}`);
        }
        if (resp.status === 204 || resp.headers.get('content-length') === '0') return null;
        return resp.json();
      } catch (err) {
        if (attempt === 1) throw err;
      }
    }
    throw new Error('Dropbox API request failed after retry');
  }

  private async _content(path: string, args: Record<string, unknown>, body?: Blob | ArrayBuffer): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this._ensureValidToken();
        const headers: Record<string, string> = {
          'Authorization': `Bearer ${this._getToken()}`,
          'Dropbox-API-Arg': JSON.stringify(args),
        };
        if (body) {
          headers['Content-Type'] = 'application/octet-stream';
        }
        const resp = await fetch(DROPBOX_CONTENT + path, {
          method: 'POST',
          headers,
          body: body as BodyInit | undefined,
        });
        if (resp.status === 401 && attempt === 0 && this._config.dropboxRefreshToken) {
          await this._refreshToken();
          continue;
        }
        if (!resp.ok) {
          const err = await resp.text();
          throw new Error(`Dropbox content API error (${resp.status}): ${err}`);
        }
        return resp;
      } catch (err) {
        if (attempt === 1) throw err;
      }
    }
    throw new Error('Dropbox content API request failed after retry');
  }

  private _toDropboxPath(relPath: string): string {
    const root = this._rootPath();
    const normalised = relPath.startsWith('/') ? relPath : '/' + relPath;
    return root + normalised;
  }

  private _stripRoot(rawPath: string): string {
    const root = this._rootPath();
    if (root && rawPath.startsWith(root)) {
      return rawPath.slice(root.length).replace(/^\/+/, '');
    }
    return rawPath.replace(/^\/+/, '');
  }

  async *walkDirectory(path: string, recursive: boolean = true): AsyncGenerator<FileEntry> {
    const root = this._rootPath();
    const apiPath = root + (path ? '/' + path : '');
    let cursor: string | null = null;
    let hasMore = true;

    while (hasMore) {
      let result: any;
      if (cursor) {
        result = await this._api('/files/list_folder/continue', { cursor });
      } else {
        result = await this._api('/files/list_folder', {
          path: apiPath || '',
          recursive,
          include_media_info: false,
          include_deleted: false,
          include_has_explicit_shared_members: false,
        });
      }

      for (const entry of result.entries as any[]) {
        if (entry['.tag'] !== 'file') continue;
        if (!isSupportedFileType(entry.name)) continue;
        const rawPath = entry.path_display || entry.path_lower;
        yield {
          name: entry.name,
          path: this._stripRoot(rawPath),
          size: entry.size || 0,
          type: inferType(entry.name),
          hash: entry.content_hash as string | undefined,
        };
      }

      hasMore = result.has_more;
      cursor = result.cursor || null;
    }
  }

  async getFile(path: string): Promise<File> {
    const dbPath = this._toDropboxPath(path);
    const resp = await this._content('/files/download', { path: dbPath });
    const blob = await resp.blob();
    const name = path.split('/').pop() || 'document';
    return new File([blob], name);
  }

  async writeFile(path: string, data: Blob | ArrayBuffer): Promise<string> {
    const dbPath = this._toDropboxPath(path);
    const blob = data instanceof Blob ? data : new Blob([data]);
    await this._content('/files/upload', { path: dbPath, mode: 'add', autorename: true }, blob);
    return path;
  }

  async organizeFile(file: File, year: number, category: string, filename: string): Promise<string> {
    const root = this._rootPath();
    const dirPath = `${root}/${year}/${category}`;
    const filePath = `${dirPath}/${filename}`;

    await this._ensureDir(dirPath);

    const blob = new Blob([await file.arrayBuffer()], { type: file.type });
    try {
      await this._content('/files/upload', { path: filePath, mode: 'add', autorename: true }, blob);
    } catch {
      const dot = filename.lastIndexOf('.');
      const base = dot > 0 ? filename.slice(0, dot) : filename;
      const ext = dot > 0 ? filename.slice(dot) : '';
      const renamed = `${base}_1${ext}`;
      const renamedPath = `${dirPath}/${renamed}`;
      await this._content('/files/upload', { path: renamedPath, mode: 'add', autorename: true }, blob);
      return `${year}/${category}/${renamed}`;
    }

    return `${year}/${category}/${filename}`;
  }

  private async _ensureDir(path: string): Promise<void> {
    try {
      await this._api('/files/create_folder_v2', { path });
    } catch (err: any) {
      if (err.message?.includes('path/conflict/folder')) return;
      throw err;
    }
  }

  async deleteFile(path: string): Promise<void> {
    const dbPath = this._toDropboxPath(path);
    await this._api('/files/delete_v2', { path: dbPath });
  }

  async getCurrentAccount(): Promise<{ name: string; email: string } | null> {
    try {
      await this._ensureValidToken();
      const data = await this._api('/users/get_current_account');
      return { name: data.name?.display_name || 'Unknown', email: data.email || '' };
    } catch {
      return null;
    }
  }

  async listFolders(relPath: string): Promise<{ name: string; path: string }[]> {
    const root = this._rootPath();
    const apiPath = root + (relPath ? '/' + relPath : '');
    const result = await this._api('/files/list_folder', {
      path: apiPath || '',
      recursive: false,
      include_media_info: false,
      include_deleted: false,
      include_has_explicit_shared_members: false,
    });
    return result.entries
      .filter((e: DropboxEntry) => e['.tag'] === 'folder')
      .map((e: DropboxEntry) => {
        const rawPath = e.path_display || e.path_lower;
        const rel = this._stripRoot(rawPath);
        return { name: e.name, path: rel };
      });
  }

  async getAuthUrl(appKey: string, redirectUri: string): Promise<string> {
    const verifier = this._generateCodeVerifier();
    const challenge = await this._generateCodeChallenge(verifier);
    sessionStorage.setItem('dropbox-code-verifier', verifier);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: appKey,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      token_access_type: 'offline',
    });
    return `${DROPBOX_AUTH}?${params}`;
  }

  async handleAuthRedirect(code: string, appKey: string, redirectUri: string): Promise<void> {
    const verifier = sessionStorage.getItem('dropbox-code-verifier');
    if (!verifier) throw new Error('OAuth state mismatch. Please try again.');
    const resp = await fetch(DROPBOX_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, grant_type: 'authorization_code', client_id: appKey, redirect_uri: redirectUri, code_verifier: verifier }),
    });
    if (!resp.ok) throw new Error(`Dropbox auth failed: ${resp.status}`);
    sessionStorage.removeItem('dropbox-code-verifier');
    const data = await resp.json();
    this._config.dropboxAccessToken = data.access_token;
    if (data.refresh_token) this._config.dropboxRefreshToken = data.refresh_token;
    this._config.dropboxTokenExpiresAt = String(Date.now() + (data.expires_in || 14400) * 1000);
    const account = await this.getCurrentAccount();
    if (account) this._config.dropboxAccountName = account.name;
    this._saveConfig();
  }

  private _generateCodeVerifier(): string {
    const array = new Uint8Array(64);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private async _generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const buffer = await crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(buffer);
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}
