import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

@customElement('toast-notification')
export class ToastNotification extends LitElement {
  @state() private message = '';
  @state() private visible = false;
  @state() private type: 'success' | 'error' | 'warning' | 'info' = 'success';
  private timer: ReturnType<typeof setTimeout> | null = null;

  createRenderRoot() { return this; }

  show(msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'success', duration = 2500) {
    this.message = msg;
    this.type = type;
    this.visible = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.visible = false; }, duration);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.timer) clearTimeout(this.timer);
  }

  render() {
    if (!this.visible) return html``;
    return html`
      <div class="toast toast-top toast-end z-50 pointer-events-none">
        <div class="alert alert-${this.type} shadow-lg pointer-events-auto">
          <span class="text-sm">${this.message}</span>
        </div>
      </div>
    `;
  }
}
