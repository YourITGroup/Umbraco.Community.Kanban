import { classMap, css, customElement, html, nothing, property, repeat } from '@umbraco-cms/backoffice/external/lit';
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

  /**
   * Whether this board's configuration permits dragging. Forwarded to each card, which pairs it with the
   * card's own canUpdate. Replaces the milestone-2 `readonly` flag, which every host hardcoded true and
   * nothing ever read — dragging is gated on server-supplied facts, not a host attribute.
   */
  @property({ type: Boolean, attribute: 'allow-drag' })
  allowDrag = false;

  /**
   * Whether this lane is the one currently under a dragging pointer. Set by the board, because the board
   * is the only element that can hit-test every lane at once, and only ever on one lane at a time.
   */
  @property({ type: Boolean, attribute: 'is-drop-target' })
  isDropTarget = false;

  /** Whether this lane would take the card if it were released now — the lane model's own acceptsDrops. */
  @property({ type: Boolean, attribute: 'accepts-drop' })
  acceptsDrop = false;

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
      <div
        class=${classMap({
          lane: true,
          'drop-target': this.isDropTarget && this.acceptsDrop,
          'drop-reject': this.isDropTarget && !this.acceptsDrop,
        })}
        style=${colour ? `--kanban-lane-colour: ${colour}` : ''}>
        <div class="header">
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
              lane-value=${this.lane!.value}
              ?allow-drag=${this.allowDrag}
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
        /* A transparent border of the same width the highlight uses, so becoming a drop target changes
           colour and nothing else — no reflow of the whole board mid-drag. */
        border: 2px solid transparent;
        border-radius: var(--uui-border-radius);
      }

      /* A variant of the lane's own colour, not a generic accent: a red "Blocked" lane highlights red and
         a green "Done" lane green. Two strengths of the same colour so the border reads as the saturated
         edge of the faint tint behind it. The fallback covers a lane with no resolved colour — reachable
         today only via the Unassigned lane, which is pinned to neutral grey. */
      .lane.drop-target {
        background: color-mix(in srgb, var(--kanban-lane-colour, var(--uui-color-border)) 20%, transparent);
        border-color: color-mix(in srgb, var(--kanban-lane-colour, var(--uui-color-border)) 80%, transparent);
      }

      /* Rejection reads as neutral and disabled, deliberately NOT as a variant of the lane's identity —
         so a lane that will not take the card never looks like a lane that will. */
      .lane.drop-reject {
        border-style: dashed;
        border-color: var(--uui-color-border);
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
        /* Resolves against the board's .viewport — the nearest scrolling ancestor — not against the
           lane, so the header pins while the canvas scrolls under it. Without this, scrolling a tall
           canvas leaves unlabelled columns and no way to tell what you are dropping into. */
        position: sticky;
        top: 0;
        z-index: 1;
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
