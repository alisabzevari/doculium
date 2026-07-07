import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import {
  Menu, LayoutDashboard, ScanSearch, Library, Settings,
  Trash2, ClipboardCheck, FileText, MessageSquare, Send,
  Bot, PenSquare, Columns3, Database, Sun, Share2, Folder, FolderOpen,
  Check, AlertCircle, RefreshCw, Image, File,
  CheckCircle, CheckSquare, Clock, AlertTriangle, ZoomOut, ZoomIn, Maximize2, Search,
  ArrowUp, ArrowDown, ArrowLeft, Minus, Sparkles, FileSearch,
} from 'lucide';

type IconData = [string, Record<string, string>][];

const ICONS: Record<string, IconData> = {
  hamburger: Menu as IconData,
  dashboard: LayoutDashboard as IconData,
  scan: ScanSearch as IconData,
  library: Library as IconData,
  settings: Settings as IconData,
  trash: Trash2 as IconData,
  clipboardCheck: ClipboardCheck as IconData,
  fileText: FileText as IconData,
  chatBubble: MessageSquare as IconData,
  send: Send as IconData,
  bot: Bot as IconData,
  edit: PenSquare as IconData,
  columns: Columns3 as IconData,
  database: Database as IconData,
  sun: Sun as IconData,
  share: Share2 as IconData,
  folder: Folder as IconData,
  check: Check as IconData,
  alertCircle: AlertCircle as IconData,
  refresh: RefreshCw as IconData,
  image: Image as IconData,
  file: File as IconData,
  checkCircle: CheckCircle as IconData,
  checkSquare: CheckSquare as IconData,
  clock: Clock as IconData,
  alertTriangle: AlertTriangle as IconData,
  zoomOut: ZoomOut as IconData,
  zoomIn: ZoomIn as IconData,
  maximize: Maximize2 as IconData,
  search: Search as IconData,
  arrowUp: ArrowUp as IconData,
  arrowDown: ArrowDown as IconData,
  arrowLeft: ArrowLeft as IconData,
  minus: Minus as IconData,
  sparkles: Sparkles as IconData,
  fileSearch: FileSearch as IconData,
  folderOpen: FolderOpen as IconData,
};

function lucideSvg(data: IconData, size: number): string {
  const inner = data.map(([tag, attrs]) => {
    const a = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
    return `<${tag} ${a}/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${inner}</svg>`;
}

@customElement('icon-svg')
export class IconSvg extends LitElement {
  createRenderRoot() { return this; }

  @property() name = '';
  @property({ type: Number }) size = 20;

  render() {
    if (this.name === 'logo') return html`<img src="${import.meta.env.BASE_URL}logo.png" width="${this.size}" height="${this.size}" alt="Doculium" style="border-radius:7px">`;
    const data = ICONS[this.name];
    if (!data) return html``;
    return html`${unsafeHTML(lucideSvg(data, this.size))}`;
  }
}
