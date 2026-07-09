import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { addDocument, findDocumentByHash, updateDocument } from '../db/document-store.ts';
import { v4 as uuid } from 'uuid';
import { getStorageProvider } from '../services/storage/registry.ts';
import { computeFileHash, readFileAsText } from '../services/storage/utils.ts';
import { extractTextFromPDF } from '../utils/pdf-parser.ts';

@customElement('share-page')
export class SharePage extends LitElement {
  createRenderRoot() { return this; }
  @state() private status: 'processing' | 'done' | 'error' = 'processing';
  @state() private message = 'Processing shared file...';

  async connectedCallback() {
    super.connectedCallback();
    await this._processShare();
  }

  private async _processShare() {
    try {
      const pathParts = window.location.pathname.split('/share/');
      const shareId = pathParts[pathParts.length - 1]?.split('?')[0];
      if (!shareId) {
        this.status = 'error';
        this.message = 'No shared file found';
        return;
      }

      const cache = await caches.open('shared-files');
      const cached = await cache.match(shareId);
      if (!cached) {
        this.status = 'error';
        this.message = 'Shared file not found or expired';
        return;
      }

      const blob = await cached.blob();
      const fileName = cached.headers.get('x-file-name')
        ? decodeURIComponent(cached.headers.get('x-file-name')!)
        : 'shared-document.pdf';

      const file = new File([blob], fileName, { type: blob.type || 'application/pdf' });
      const hash = await computeFileHash(file);

      const existing = await findDocumentByHash(hash);
      if (existing) {
        await cache.delete(shareId);
        this.status = 'done';
        this.message = 'This document already exists in your library';
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('navigate', { detail: { path: `/library/${existing.id}` } }));
        }, 1500);
        return;
      }

      let extractedText = '';
      if (file.type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
        try { extractedText = await extractTextFromPDF(file); } catch { extractedText = '[PDF text extraction failed]'; }
      } else {
        try { extractedText = await readFileAsText(file); } catch { extractedText = ''; }
      }

      const now = new Date().toISOString();
      await addDocument({
        id: uuid(),
        originalName: fileName,
        originalPath: fileName,
        storedPath: null,
        fileType: file.type || 'application/pdf',
        fileSize: file.size,
        fileHash: hash,
        extractedText,
        summary: '', audience: '', urgency: 'medium', taxRelevant: false,
        category: '', year: null, month: null,
        dateFrom: null, dateTo: null, suggestedFilename: null,
        tags: [], confidence: 0, status: 'pending', error: null,
        createdAt: now, updatedAt: now, syncedAt: null,
      });

      await cache.delete(shareId);

      const doc = await findDocumentByHash(hash);
      if (doc) {
        const provider = await getStorageProvider();
        if (await provider.isReady()) {
          try {
            const storedPath = await provider.writeFile(fileName, blob);
            await updateDocument(doc.id, {}); // touch
          } catch {
            // storage write failed, doc still in DB
          }
        }

        this.status = 'done';
        this.message = 'Document added successfully!';
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('navigate', { detail: { path: `/library/${doc.id}` } }));
        }, 1500);
      } else {
        this.status = 'error';
        this.message = 'Failed to create document entry';
      }
    } catch (err: any) {
      this.status = 'error';
      this.message = err.message || 'Failed to process shared file';
    }
  }

  render() {
    return html`
      <div class="p-6 max-w-md mx-auto text-center space-y-4">
        <div class="bg-base-200 p-8 rounded-box">
          ${this.status === 'processing' ? html`
            <span class="loading loading-spinner loading-lg text-primary mb-4"></span>
            <p class="text-sm opacity-70">${this.message}</p>
          ` : this.status === 'done' ? html`
            <div class="text-success text-4xl mb-4">✓</div>
            <p class="text-sm">${this.message}</p>
            <p class="text-xs opacity-50 mt-2">Redirecting to document...</p>
          ` : html`
            <div class="text-error text-4xl mb-4">✗</div>
            <p class="text-sm">${this.message}</p>
            <button class="btn btn-primary btn-sm mt-4" @click=${() => window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/library' } }))}>
              Go to Library
            </button>
          `}
        </div>
      </div>
    `;
  }
}
