import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import {
  Menu,
  LayoutDashboard,
  ScanSearch,
  Library,
  Settings,
} from 'lucide';

type IconData = [string, Record<string, string>][];

const ICONS: Record<string, IconData> = {
  hamburger: Menu as IconData,
  dashboard: LayoutDashboard as IconData,
  scan: ScanSearch as IconData,
  library: Library as IconData,
  settings: Settings as IconData,
};

function lucideSvg(data: IconData, size: number): string {
  const inner = data.map(([tag, attrs]) => {
    const a = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
    return `<${tag} ${a}/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${inner}</svg>`;
}

function logoSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="7" fill="var(--color-primary)" />
    <rect x="7" y="6" width="16" height="20" rx="3" fill="var(--color-primary-content)" />
    <path d="M23 12h-5a1.5 1.5 0 0 1-1.5-1.5V6" fill="var(--color-base-content)" opacity="0.15" />
    <path d="M23 12h-5a1.5 1.5 0 0 1-1.5-1.5V6l6.5 6Z" fill="var(--color-base-content)" opacity="0.08" />
    <rect x="10" y="15" width="10" height="1.2" rx="0.6" fill="var(--color-primary)" opacity="0.5" />
    <rect x="10" y="19" width="7.5" height="1.2" rx="0.6" fill="var(--color-primary)" opacity="0.3" />
    <rect x="10" y="23" width="8.5" height="1.2" rx="0.6" fill="var(--color-primary)" opacity="0.3" />
  </svg>`;
}

@customElement('icon-svg')
export class IconSvg extends LitElement {
  createRenderRoot() { return this; }

  @property() name = '';
  @property({ type: Number }) size = 20;

  render() {
    if (this.name === 'logo') return html`${unsafeHTML(logoSvg(this.size))}`;
    const data = ICONS[this.name];
    if (!data) return html``;
    return html`${unsafeHTML(lucideSvg(data, this.size))}`;
  }
}
