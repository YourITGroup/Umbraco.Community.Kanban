import { css, customElement, html, nothing, property, repeat } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { extractUmbColorVariable } from '@umbraco-cms/backoffice/resources';
import { formatLaneTotal, laneHasMore, nextSkip } from './board.model.js';
import { laneColourStyle } from './lane.model.js';
import './kanban-card.element.js';
import type { KanbanBoardLaneModel } from '../data/kanban-board.types.js';

/** One lane column: a header carrying its colour and total, its cards, and a "Show more". */
@customElement('umb-community-kanban-lane')
export class UmbCommunityKanbanLaneElement extends UmbLitElement {
  @property({ attribute: false })
  lane?: KanbanBoardLaneModel;

  @property({ type: Boolean })
  readonly = true;

  @property({ type: Boolean, attribute: 'show-child-items' })
  showChildItems = false;

  #onLoadMore() {
    if (!this.lane) return;

    this.dispatchEvent(
      new CustomEvent('kanban-load-more', {
        detail: { lane: this.lane.value, skip: nextSkip(this.lane) },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    if (!this.lane) return nothing;

    const colour = laneColourStyle(this.lane.colour, extractUmbColorVariable);

    return html`
      <div class="lane">
        <div class="header" style=${colour ? `--kanban-lane-colour: ${colour}` : ''}>
          ${this.lane.icon ? html`<umb-icon name=${this.lane.icon}></umb-icon>` : nothing}
          <span class="name">${this.lane.name}</span>
          <uui-badge look="secondary">${formatLaneTotal(this.lane)}</uui-badge>
        </div>
        <div class="cards">
          ${repeat(
            this.lane.cards,
            (card) => card.key,
            (card) => html`<umb-community-kanban-card
              .card=${card}
              ?show-child-items=${this.showChildItems}></umb-community-kanban-card>`,
          )}
          ${this.lane.cards.length === 0 ? html`<span class="empty">No cards</span>` : nothing}
        </div>
        ${laneHasMore(this.lane)
          ? html`<uui-button
              look="placeholder"
              label=${this.localize.term('actions_showMore')}
              @click=${this.#onLoadMore}></uui-button>`
          : nothing}
      </div>
    `;
  }

  static override styles = [
    css`
      .lane {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-3);
        min-width: 280px;
        max-width: 320px;
        flex: 0 0 auto;
      }

      .header {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
        padding: var(--uui-size-space-2) var(--uui-size-space-3);
        background: var(--uui-color-surface-alt);
        /* The fallback replaces the conditional the render used to carry: a lane with no colour
           simply does not set the variable. Anything else wanting to follow the lane's colour — a
           tinted background, a coloured badge — can read the same variable rather than having the
           value threaded through again. */
        border-top: 3px solid var(--kanban-lane-colour, var(--uui-color-border));
        border-radius: var(--uui-border-radius);
      }

      .name {
        flex: 1;
        font-weight: bold;
      }

      .cards {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-2);
      }

      .empty {
        color: var(--uui-color-text-alt);
        font-size: var(--uui-type-small-size);
        padding: var(--uui-size-space-2);
      }
    `,
  ];
}

export { UmbCommunityKanbanLaneElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-lane': UmbCommunityKanbanLaneElement;
  }
}
