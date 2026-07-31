import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { KanbanBoardActionsState } from './board-actions.context.js';

/**
 * The board's Publish/Undo bar, shared by every host so the two placements cannot drift: the
 * collection layout slots it into the umb-body-layout footer, the workspace view overlays it at the
 * foot of its tab. Purely presentational — it renders a state and dispatches intents; which context
 * or handler answers them is the host's business.
 */
@customElement('umb-community-kanban-action-bar')
export class UmbCommunityKanbanActionBarElement extends UmbLitElement {
  @property({ attribute: false })
  barState?: KanbanBoardActionsState;

  #onUndo() {
    this.dispatchEvent(new CustomEvent('kanban-undo', { bubbles: true, composed: true }));
  }

  #onPublish() {
    this.dispatchEvent(new CustomEvent('kanban-publish', { bubbles: true, composed: true }));
  }

  override render() {
    const state = this.barState;

    if (!state) return nothing;

    return html`
      <div class="summary">
        ${state.pending} ${state.pending === 1 ? 'card has' : 'cards have'} pending changes
      </div>
      <div class="buttons">
        <uui-button
          look="secondary"
          icon="icon-undo"
          label="Undo the last move"
          title="Undo the last move made on this board"
          ?disabled=${!state.canUndo || state.busy}
          @click=${this.#onUndo}>
          Undo
        </uui-button>
        <uui-button
          look="primary"
          color="positive"
          icon="icon-globe"
          label="Publish pending changes"
          ?disabled=${state.busy}
          @click=${this.#onPublish}>
          Publish pending changes
        </uui-button>
      </div>
    `;
  }

  static override styles = [
    css`
      /* Mirrors core's own selection-action bar: same surface, contrast colour, padding and
         space-between layout. The host decides where the bar sits; the bar decides how it reads. */
      :host {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--uui-size-3);
        box-sizing: border-box;
        width: 100%;
        padding: var(--uui-size-space-4) var(--uui-size-space-6);
        background-color: var(--uui-color-selected);
        color: var(--uui-color-selected-contrast);
      }

      .summary,
      .buttons {
        display: flex;
        align-items: center;
        gap: var(--uui-size-3);
      }
    `,
  ];
}

export { UmbCommunityKanbanActionBarElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-action-bar': UmbCommunityKanbanActionBarElement;
  }
}
