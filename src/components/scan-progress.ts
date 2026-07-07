import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('scan-progress')
export class ScanProgress extends LitElement {
  @property({ type: Number }) current = 0;
  @property({ type: Number }) total = 0;
  @property({ type: String }) fileName = '';
  @property({ type: Number }) newFiles = 0;
  @property({ type: Number }) duplicates = 0;

  get percent(): number {
    return this.total > 0 ? Math.round((this.current / this.total) * 100) : 0;
  }

  render() {
    if (this.total === 0) return html`<div class="text-sm opacity-50 p-4 text-center">No files to process</div>`;

    return html`
      <div class="space-y-3 p-4">
        <div class="flex justify-between text-sm">
          <span class="font-medium">Scanning files...</span>
          <span class="opacity-50">${this.current}/${this.total}</span>
        </div>
        <progress class="progress progress-primary w-full" value="${this.current}" max="${this.total}"></progress>
        ${this.fileName ? html`<p class="text-xs opacity-70 truncate" title="${this.fileName}">${this.fileName}</p>` : ''}
        <div class="flex gap-4 text-xs">
          <span class="text-success">${this.newFiles} new</span>
          ${this.duplicates > 0 ? html`<span class="text-warning">${this.duplicates} duplicates</span>` : ''}
          <span class="opacity-50">${this.percent}%</span>
        </div>
      </div>
    `;
  }
}
