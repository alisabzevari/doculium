import { LitElement, html } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';

@customElement('confirm-dialog')
export class ConfirmDialog extends LitElement {
  @property() message = '';
  @query('dialog') dialog!: HTMLDialogElement;

  createRenderRoot() { return this; }

  confirm(message: string): Promise<boolean> {
    this.message = message;
    this.dialog.showModal();
    return new Promise(resolve => {
      const close = (result: boolean) => {
        this.dialog.close();
        this.dialog.removeEventListener('close', onClose);
        resolve(result);
      };
      const onClose = () => close(false);
      this.dialog.addEventListener('close', onClose, { once: true });
      (this.renderRoot.querySelector('.btn-confirm') as HTMLElement).onclick = () => close(true);
      (this.renderRoot.querySelector('.btn-cancel') as HTMLElement).onclick = () => close(false);
      (this.renderRoot.querySelector('.modal-backdrop button') as HTMLElement).onclick = () => close(false);
    });
  }

  render() {
    return html`
      <dialog class="modal">
        <div class="modal-box max-w-sm">
          <p class="text-sm py-2">${this.message}</p>
          <div class="modal-action">
            <button class="btn btn-ghost btn-sm btn-cancel">Cancel</button>
            <button class="btn btn-primary btn-sm btn-confirm">Confirm</button>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    `;
  }
}
