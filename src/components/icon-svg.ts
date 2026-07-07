import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

const ICONS: Record<string, { viewBox: string; paths: string }> = {
  hamburger: {
    viewBox: '0 0 24 24',
    paths: '<line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />',
  },
  dashboard: {
    viewBox: '0 0 24 24',
    paths: '<rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />',
  },
  scan: {
    viewBox: '0 0 24 24',
    paths: '<path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /><path d="M16 5l-4 4m0 0l-4-4m4 4V1" />',
  },
  library: {
    viewBox: '0 0 24 24',
    paths: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />',
  },
  settings: {
    viewBox: '0 0 24 24',
    paths: '<circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />',
  },
};

@customElement('icon-svg')
export class IconSvg extends LitElement {
  createRenderRoot() { return this; }

  @property() name = '';
  @property({ type: Number }) size = 20;

  render() {
    const icon = ICONS[this.name];
    if (!icon) return html``;
    return html`
      <svg xmlns="http://www.w3.org/2000/svg" width="${this.size}" height="${this.size}" viewBox="${icon.viewBox}" fill="none" stroke="currentColor" stroke-width="2">
        ${icon.paths}
      </svg>
    `;
  }
}
