import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('logo-icon')
export class LogoIcon extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Number }) size = 32;

  render() {
    return html`
      <svg xmlns="http://www.w3.org/2000/svg" width="${this.size}" height="${this.size}" viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="7" fill="var(--color-primary)" />
        <rect x="7" y="6" width="16" height="20" rx="3" fill="var(--color-primary-content)" />
        <path d="M23 12h-5a1.5 1.5 0 0 1-1.5-1.5V6" fill="var(--color-base-content)" opacity="0.15" />
        <path d="M23 12h-5a1.5 1.5 0 0 1-1.5-1.5V6l6.5 6Z" fill="var(--color-base-content)" opacity="0.08" />
        <rect x="10" y="15" width="10" height="1.2" rx="0.6" fill="var(--color-primary)" opacity="0.5" />
        <rect x="10" y="19" width="7.5" height="1.2" rx="0.6" fill="var(--color-primary)" opacity="0.3" />
        <rect x="10" y="23" width="8.5" height="1.2" rx="0.6" fill="var(--color-primary)" opacity="0.3" />
      </svg>
    `;
  }
}
