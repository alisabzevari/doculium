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
        <button class="btn join-item btn-square">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
        </button>
      </div>
    `;
  }
}
