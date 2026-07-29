import { css, customElement, html, nothing, property, repeat } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { formatChildOverflow } from './card-children.model.js';
import type { KanbanCardChildModel, KanbanCardModel } from '../data/kanban-board.types.js';

/**
 * A card's own children: icon, name, and a button opening each in the workspace modal.
 *
 * Its own element rather than more markup inside the card, because it owns fetching and menu state of
 * its own once the add button lands, and the card element is already the busiest file in core/.
 *
 * umb-icon is a global element the backoffice shell registers, so it is used without import.
 */
@customElement('umb-community-kanban-card-children')
export class UmbCommunityKanbanCardChildrenElement extends UmbLitElement {
  @property({ attribute: false })
  card?: KanbanCardModel;

  #onOpen(child: KanbanCardChildModel) {
    // The same event the card's title raises: the host does not care which control asked.
    this.dispatchEvent(
      new CustomEvent('kanban-open-document', {
        detail: { key: child.key },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    if (!this.card) return nothing;

    const overflow = formatChildOverflow(
      this.card.childTotal,
      this.card.children.length,
      this.card.childTotalIsExact,
    );

    return html`
      <div class="children">
        ${repeat(this.card.children, (child) => child.key, (child) => this.#renderChild(child))}
        ${overflow ? html`<span class="overflow">${overflow}</span>` : nothing}
      </div>
    `;
  }

  #renderChild(child: KanbanCardChildModel) {
    return html`
      <div class="child">
        ${child.icon ? html`<umb-icon name=${child.icon}></umb-icon>` : nothing}
        <span class="child-name">${child.name}</span>
        <uui-button
          compact
          look="default"
          label=${this.localize.term('general_edit')}
          @click=${() => this.#onOpen(child)}>
          <uui-icon name="icon-edit"></uui-icon>
        </uui-button>
      </div>
    `;
  }

  static override styles = [
    css`
      .children {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-1);
        border-top: 1px solid var(--uui-color-divider);
        padding-top: var(--uui-size-space-2);
        font-size: var(--uui-type-small-size);
      }

      .child {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
      }

      .child-name {
        flex: 1;
        overflow-wrap: anywhere;
      }

      .overflow {
        color: var(--uui-color-text-alt);
      }
    `,
  ];
}

export { UmbCommunityKanbanCardChildrenElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-card-children': UmbCommunityKanbanCardChildrenElement;
  }
}
