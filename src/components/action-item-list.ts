import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { markActionItemDone } from '../db/document-store.ts';
import type { ActionItem } from '../db/schema.ts';

@customElement('action-item-list')
export class ActionItemList extends LitElement {
  @property({ attribute: false }) items: ActionItem[] = [];
  @property({ type: Boolean }) showCompleted = false;

  createRenderRoot() { return this; }

  private async toggleItem(e: Event) {
    const checkbox = e.target as HTMLInputElement;
    const id = checkbox.dataset.id;
    if (id) {
      await markActionItemDone(id);
      this.requestUpdate();
    }
  }

  render() {
    const filtered = this.showCompleted
      ? this.items
      : this.items.filter(i => !i.completed);

    return html`
      <div class="space-y-0">
        ${repeat(
          filtered,
          (item) => item.id,
          (item) => html`
            <div class="item flex items-start gap-3 py-3">
              <input
                type="checkbox"
                class="checkbox checkbox-sm mt-0.5"
                data-id="${item.id}"
                ?checked="${item.completed}"
                @change="${this.toggleItem}"
              />
              <div class="flex-1 min-w-0">
                <p class="text-sm ${item.completed ? 'line-through opacity-50' : ''}">${item.text}</p>
                <div class="flex items-center gap-2 mt-1">
                  <span class="badge badge-xs ${item.urgency === 'critical' ? 'badge-error' : item.urgency === 'high' ? 'badge-warning' : 'badge-ghost'}">
                    ${item.urgency}
                  </span>
                  ${item.dueDate ? html`<span class="text-xs opacity-50">Due ${item.dueDate}</span>` : ''}
                  ${item.completedAt ? html`<span class="text-xs opacity-40">Done ${new Date(item.completedAt).toLocaleDateString()}</span>` : ''}
                </div>
              </div>
            </div>
          `
        )}
        ${filtered.length === 0 ? html`<p class="text-sm opacity-50 py-4 text-center">No action items</p>` : ''}
      </div>
    `;
  }
}
