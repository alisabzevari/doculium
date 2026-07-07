import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('search-bar')
export class SearchBar extends LitElement {
  @property({ type: String }) placeholder = 'Search documents...';
  @state() private query = '';

  createRenderRoot() { return this; }

  private onInput(e: InputEvent) {
    const value = (e.target as HTMLInputElement).value;
    this.query = value;
    this.dispatchEvent(new CustomEvent('search', { detail: { query: value }, bubbles: true, composed: true }));
  }

  render() {
    return html`
      <div class="join w-full">
        <input
          class="input join-item flex-1"
          .value=${this.query}
          @input=${this.onInput}
          placeholder=${this.placeholder}
        />
        <button class="tooltip btn join-item btn-square" data-tip="Search">
          <icon-svg name="search" size="20"></icon-svg>
        </button>
      </div>
    `;
  }
}
