import { LitElement, html } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { marked } from 'marked';
import { chatWithDocument } from '../ai/analyzer.ts';
import { getChatMessages, addChatMessage, clearChatMessages, addActionItem, markActionItemDone, getActionItemsByDocument } from '../db/document-store.ts';
import { v4 as uuid } from 'uuid';
import type { ToolDefinition, ToolCall, ChatMessage } from '../ai/types.ts';

marked.setOptions({ breaks: true, gfm: true });

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'add_action_item',
    description: 'Add an action item for this document',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The action item text' },
        urgency: { type: 'string', description: 'Urgency level', enum: ['low', 'medium', 'high', 'critical'] },
      },
      required: ['text'],
    },
  },
  {
    name: 'mark_action_item_done',
    description: 'Mark an action item as completed',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The action item ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_action_items',
    description: 'List all action items for this document',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

@customElement('document-chat')
export class DocumentChat extends LitElement {
  @property({ attribute: false }) extractedText = '';
  @property({ attribute: false }) documentId = '';
  @state() private messages: DisplayMessage[] = [];
  @state() private loading = false;
  @state() private input = '';
  @state() private toolInProgress = '';

  @query('.chat-input') inputEl!: HTMLInputElement;

  private conversation: ChatMessage[] = [];

  createRenderRoot() { return this; }

  async connectedCallback() {
    super.connectedCallback();
    if (this.documentId) {
      const stored = await getChatMessages(this.documentId);
      this.messages = stored.map(m => ({ role: m.role, content: m.content }));
      this.conversation = stored.map(m => ({ role: m.role, content: m.content }));
      await this.updateComplete;
      this._scrollDown();
    }
  }

  private async _save(role: 'user' | 'assistant', content: string) {
    if (!this.documentId) return;
    const now = new Date().toISOString();
    await addChatMessage({
      id: uuid(),
      documentId: this.documentId,
      role,
      content,
      createdAt: now,
      updatedAt: now,
    });
  }

  private async _executeTool(toolCall: ToolCall): Promise<string> {
    switch (toolCall.name) {
      case 'add_action_item': {
        const text = String(toolCall.arguments.text || '');
        const urgency = (toolCall.arguments.urgency as string) || 'medium';
        const valid = ['low', 'medium', 'high', 'critical'].includes(urgency) ? urgency : 'medium';
        const now = new Date().toISOString();
        await addActionItem({
          id: uuid(),
          documentId: this.documentId,
          text,
          urgency: valid as any,
          completed: false,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
          dueDate: null,
        });
        return JSON.stringify({ success: true });
      }
      case 'mark_action_item_done': {
        const id = String(toolCall.arguments.id || '');
        await markActionItemDone(id);
        return JSON.stringify({ success: true });
      }
      case 'list_action_items': {
        const items = await getActionItemsByDocument(this.documentId);
        return JSON.stringify(items.map(i => ({ id: i.id, text: i.text, urgency: i.urgency, completed: i.completed })));
      }
      default:
        return JSON.stringify({ success: false, error: `Unknown tool: ${toolCall.name}` });
    }
  }

  private async _send() {
    const text = this.input.trim();
    if (!text || this.loading) return;

    this.input = '';
    this.conversation.push({ role: 'user', content: text });
    this.messages = [...this.messages, { role: 'user', content: text }];
    this.loading = true;
    this._save('user', text);

    try {
      let response = await chatWithDocument(this.extractedText, this.conversation, TOOLS);
      let iterations = 0;
      const MAX_ITERATIONS = 10;

      while (response.toolCalls && response.toolCalls.length > 0 && iterations < MAX_ITERATIONS) {
        iterations++;
        this.toolInProgress = `Using tools...`;

        this.conversation.push({
          role: 'assistant',
          content: response.content || '',
          tool_calls: response.toolCalls,
        });

        for (const tc of response.toolCalls) {
          const result = await this._executeTool(tc);
          this.conversation.push({
            role: 'tool',
            content: result,
            tool_call_id: tc.id,
          });
        }

        response = await chatWithDocument(this.extractedText, this.conversation, TOOLS);
      }

      this.toolInProgress = '';

      if (iterations > 0) {
        this.dispatchEvent(new CustomEvent('action-items-changed', { bubbles: true, composed: true }));
      }

      if (response.content) {
        this.conversation.push({ role: 'assistant', content: response.content });
        this.messages = [...this.messages, { role: 'assistant', content: response.content }];
        this._save('assistant', response.content);
      }
    } catch (err: any) {
      const errorMsg = `Error: ${err.message}`;
      this.messages = [...this.messages, { role: 'assistant', content: errorMsg }];
      this._save('assistant', errorMsg);
    }
    this.loading = false;

    await this.updateComplete;
    this._scrollDown();
    this.inputEl?.focus();
  }

  private async _clear() {
    if (!this.documentId) return;
    await clearChatMessages(this.documentId);
    this.messages = [];
    this.conversation = [];
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
      <div class="flex flex-col h-full min-h-[250px]" style="max-height: 70vh;">
        <div class="flex items-center justify-between px-4 py-2 border-b border-base-300">
          <span class="text-xs font-semibold opacity-60">Document Chat</span>
          ${this.messages.length > 0 ? html`
             <button class="tooltip btn btn-ghost btn-sm text-error" data-tip="Clear history" @click=${this._clear}>Clear</button>
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
              <div class="bg-base-300 px-4 py-3 space-y-1">
                <span class="loading loading-dots loading-sm"></span>
                ${this.toolInProgress ? html`<div class="text-xs opacity-50">${this.toolInProgress}</div>` : ''}
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
              <icon-svg name="send" size="16"></icon-svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
