import { css, customElement, html, property, repeat } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';
import { pickContentTypeProperty } from '../content-type-property/content-type-property.picker.js';
import { addCardProperty, moveCardProperty, removeCardPropertyAt } from './card-property.model.js';

/**
 * Chooses the properties shown as summary items on each card, by browsing to each one: choose a
 * document type, then choose one of its properties — the same sequence as the lane property, and as
 * adding a column to a Collection.
 *
 * The stored value is a list of property aliases, unchanged from the text-per-line editor this
 * replaces, so existing boards keep working. Order is the order the items appear on a card.
 *
 * The content type is asked for on every add rather than remembered: a board's cards can be of more
 * than one type, so the previous answer is not necessarily the next one. Umbraco's own column
 * configuration asks every time for the same reason.
 */
@customElement('umb-community-kanban-card-properties')
export class UmbCommunityKanbanCardPropertiesElement extends UmbLitElement {
  @property({ type: Array })
  value: string[] = [];

  #commit(next: string[]) {
    this.value = next;
    this.dispatchEvent(new UmbChangeEvent());
  }

  async #add() {
    const picked = await pickContentTypeProperty(this);
    if (!picked) return;

    this.#commit(addCardProperty(this.value ?? [], picked.alias));
  }

  override render() {
    return html`
      ${repeat(
        this.value ?? [],
        (alias, index) => `${index}:${alias}`,
        (alias, index) => this.#renderRow(alias, index),
      )}
      <uui-button look="placeholder" label="Add property" @click=${this.#add}></uui-button>
    `;
  }

  #renderRow(alias: string, index: number) {
    return html`
      <div class="row">
        <span class="alias">${alias}</span>
        <uui-button
          compact
          look="outline"
          label="Move up"
          ?disabled=${index === 0}
          @click=${() => this.#commit(moveCardProperty(this.value, index, index - 1))}>↑</uui-button>
        <uui-button
          compact
          look="outline"
          label="Move down"
          ?disabled=${index === this.value.length - 1}
          @click=${() => this.#commit(moveCardProperty(this.value, index, index + 1))}>↓</uui-button>
        <uui-button
          compact
          look="outline"
          color="danger"
          label="Remove"
          @click=${() => this.#commit(removeCardPropertyAt(this.value, index))}>✕</uui-button>
      </div>
    `;
  }

  static override styles = [
    css`
      .row {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-3);
        padding: var(--uui-size-space-2) 0;
        border-bottom: 1px solid var(--uui-color-divider);
      }

      .alias {
        flex: 1;
      }
    `,
  ];
}

export { UmbCommunityKanbanCardPropertiesElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-card-properties': UmbCommunityKanbanCardPropertiesElement;
  }
}
