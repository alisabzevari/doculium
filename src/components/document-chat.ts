import { LitElement, html } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { marked } from 'marked';
import { chatWithDocument } from '../ai/analyzer.ts';
import { getChatMessages, addChatMessage, clearChatMessages } from '../db/document-store.ts';
import { v4 as uuid } from 'uuid';

marked.setOptions({ breaks: true, gfm: true });

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

@customElement('document-chat')
export class DocumentChat extends LitElement {
  @property({ attribute: false }) extractedText = '';
  @property({ attribute: false }) documentId = '';
  @state() private messages: Message[] = [];
  @state() private loading = false;
  @state() private input = '';

  @query('.chat-input') inputEl!: HTMLInputElement;

  createRenderRoot() { return this; }

  async connectedCallback() {
    super.connectedCallback();
    if (this.documentId) {
      const stored = await getChatMessages(this.documentId);
      this.messages = stored.map(m => ({ role: m.role, content: m.content }));
      await this.updateComplete;
      this._scrollDown();
    }
  }

  private async _save(role: 'user' | 'assistant', content: string) {
    if (!this.documentId) return;
    await addChatMessage({
      id: uuid(),
      documentId: this.documentId,
      role,
      content,
      createdAt: new Date().toISOString(),
    });
  }

  private async _send() {
    const text = this.input.trim();
    if (!text || this.loading) return;

    this.input = '';
    this.messages = [...this.messages, { role: 'user', content: text }];
    this.loading = true;
    this._save('user', text);

    try {
      const response = await chatWithDocument(this.extractedText, this.messages);
      this.messages = [...this.messages, { role: 'assistant', content: response }];
      this._save('assistant', response);
    } catch (err: any) {
      const errorMsg = `Error: ${err.message}`;
      this.messages = [...this.messages, { role: 'assistant', content: errorMsg }];
      this._save('assistant', errorMsg);
    }
    this.loading = false;

    await this.updateComplete;
    this._scrollDown();
  }

  private async _clear() {
    if (!this.documentId) return;
    await clearChatMessages(this.documentId);
    this.messages = [];
  }

  private _handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._send();
    }
  }

  private _scrollDown() {
    const container = this.renderRoot.querySelector('.chat-scroll');
    if (container) container.scrollTop = container.scrollHeight;
  }

  private _renderMarkdown(text: string): string {
    try {
      return marked.parse(text) as string;
    } catch {
      return text;
    }
  }

  render() {
    if (!this.extractedText) {
      return html`<div class="flex items-center justify-center p-8 text-sm opacity-50">Document text not available for chat.</div>`;
    }

    return html`
      <style>
        .chat-msg p { margin: 0; }
        .chat-msg p + p { margin-top: 0.5em; }
        .chat-msg ul, .chat-msg ol { padding-left: 1.25em; margin: 0.25em 0; }
        .chat-msg li { margin: 0.15em 0; }
        .chat-msg code { font-size: 0.85em; padding: 0.1em 0.3em; border-radius: 3px; background: var(--color-base-200); }
        .chat-msg pre { margin: 0.5em 0; padding: 0.75em; border-radius: 6px; overflow-x: auto; font-size: 0.85em; background: var(--color-base-200); }
        .chat-msg pre code { padding: 0; background: none; }
        .chat-msg h1, .chat-msg h2, .chat-msg h3, .chat-msg h4 { font-size: inherit; font-weight: 600; margin: 0.5em 0 0.25em; }
        .chat-msg strong { font-weight: 600; }
        .chat-msg a { text-decoration: underline; }
      </style>
      <div class="flex flex-col h-full min-h-[400px]" style="max-height: 70vh;">
        <div class="flex items-center justify-between px-4 py-2 border-b border-base-300">
          <span class="text-xs font-semibold opacity-60">Document Chat</span>
          ${this.messages.length > 0 ? html`
             <button class="tooltip btn btn-ghost btn-xs text-error" data-tip="Clear history" @click=${this._clear}>Clear</button>
          ` : ''}
        </div>
        <div class="chat-scroll flex-1 overflow-y-auto p-4 space-y-4">
          ${this.messages.length === 0 ? html`
            <div class="text-center text-sm opacity-40 mt-8">
              Ask a question about this document.
            </div>
          ` : this.messages.map(m => html`
            <div class="flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}">
              <div class="max-w-[80%] ${m.role === 'user'
                ? 'bg-primary text-primary-content px-4 py-2'
                : 'bg-base-300 px-4 py-2'}">
                ${m.role === 'user' ? html`
                  <p class="text-sm whitespace-pre-wrap">${m.content}</p>
                ` : html`
                  <div class="chat-msg text-sm">${unsafeHTML(this._renderMarkdown(m.content))}</div>
                `}
              </div>
            </div>
          `)}
          ${this.loading ? html`
            <div class="flex justify-start">
              <div class="bg-base-300 px-4 py-3">
                <span class="loading loading-dots loading-sm"></span>
              </div>
            </div>
          ` : ''}
        </div>
        <div class="border-t border-base-300 p-3">
          <div class="join w-full">
            <input
              class="input join-item flex-1 chat-input text-sm"
              .value=${this.input}
              @input=${(e: Event) => this.input = (e.target as HTMLInputElement).value}
              @keydown=${this._handleKeydown}
              placeholder="Ask about this document..."
              ?disabled=${this.loading} />
             <button class="tooltip btn join-item btn-primary btn-square" data-tip="Send" ?disabled=${this.loading || !this.input.trim()} @click=${this._send}>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
