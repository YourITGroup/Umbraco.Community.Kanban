import { classMap, css, customElement, html, nothing, property, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import type { PropertyValues } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbEntityContext } from '@umbraco-cms/backoffice/entity';
import '@umbraco-cms/backoffice/ufm';
import { cardStateTag } from './card.model.js';
import { dragDisabledReason, isCardDragBlockingPath, shouldStartCardDrag, type KanbanDragDisabledReason } from './drag.model.js';
import './kanban-card-children.element.js';
import type { KanbanCardModel, KanbanCardPropertyModel } from '../data/kanban-board.types.js';

/**
 * Icon and tooltip for each reason a card cannot be dragged — the only visible difference otherwise is
 * the grab cursor silently not appearing, which gives an editor no way to tell "this board doesn't drag"
 * apart from "you can't move this one".
 */
const DRAG_DISABLED_COPY: Record<KanbanDragDisabledReason, { icon: string; title: string }> = {
  boardDisabled: { icon: 'icon-block', title: 'Dragging is disabled for this board.' },
  noPermission: { icon: 'icon-lock', title: 'You don’t have permission to move this card.' },
};

/**
 * One card on a board. Read-only in this milestone: it reports its title being clicked and nothing
 * else — the host decides what "open this document" means.
 *
 * umb-icon, umb-value-summary-extension and umb-entity-actions-bundle are global elements
 * the backoffice shell registers, so they are used without import — reaching into
 * dist-cms to import them would be an unsupported dependency.
 */
@customElement('umb-community-kanban-card')
export class UmbCommunityKanbanCardElement extends UmbLitElement {
  @property({ attribute: false })
  card?: KanbanCardModel;

  /**
   * Whether this board lists a card's children. Board-wide state forwarded down, the way `readonly`
   * is — it is a property of the board's configuration, not of this card.
   */
  @property({ type: Boolean, attribute: 'show-child-items' })
  showChildItems = false;

  /**
   * Whether this board's configuration permits dragging. Board-wide state forwarded down, paired with the
   * card's own `canUpdate` — dragging needs both, and only the server knows either.
   */
  @property({ type: Boolean, attribute: 'allow-drag' })
  allowDrag = false;

  /**
   * The value of the lane this card is currently in. Passed down rather than derived: a card has no view
   * of the board, and the drag's source lane has to travel with the gesture so the failure path can put
   * the card back exactly where it started.
   */
  @property({ type: String, attribute: 'lane-value' })
  laneValue?: string;

  /**
   * The card owns the entity identity for its own subtree. `<umb-entity-actions-bundle>` reads
   * its entity from the ambient UMB_ENTITY_CONTEXT; its `entityType`/`unique` properties are
   * deprecated and removed in Umbraco 19, and relying on the fallback context they create means
   * relying on when the bundle happens to read them. Without this context the bundle would find
   * the host's ambient context — the PARENT document — and aim every action at the wrong entity.
   */
  #entityContext = new UmbEntityContext(this);

  /**
   * True while this card is the one being dragged. The placeholder the spec asks for is the card itself
   * reading as lifted-and-left-behind rather than a second floating element: the pointer is captured on
   * this card, so it is already the thing under the cursor for the whole gesture, and a duplicate ghost
   * would have to be positioned against a board that is scrolling underneath it.
   */
  @state()
  private _dragging = false;

  /**
   * The live drag, or undefined between gestures. Keyed by pointerId so a second pointer is ignored, and
   * holding the captured element so Escape — which arrives as a keyboard event with no pointer target of
   * its own — can still release the capture.
   */
  #drag?: { pointerId: number; target: HTMLElement };

  /**
   * Whether the last gesture moved at all. A drag ends with a pointerup on the card, which the browser
   * then follows with a click — so without this, every drag would also open the card's document.
   */
  #moved = false;

  constructor() {
    super();

    this.#entityContext.setEntityType('document');
  }

  override willUpdate(changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties);

    if (changedProperties.has('card')) {
      this.#entityContext.setUnique(this.card?.key ?? null);
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();

    // A card removed from the DOM mid-drag would otherwise leave its Escape listener on the window.
    window.removeEventListener('keydown', this.#onKeyDown);
  }

  #onOpen() {
    if (!this.card) return;

    // A drag ends with a pointerup on this card, which the browser follows with a click. Opening the
    // document then would make every completed drag also open a workspace modal.
    if (this.#moved) {
      this.#moved = false;
      return;
    }

    this.dispatchEvent(
      new CustomEvent('kanban-open-document', {
        detail: { key: this.card.key },
        bubbles: true,
        composed: true,
      }),
    );
  }

  #onPointerDown(event: PointerEvent) {
    if (this.#drag || !this.card || this.laneValue === undefined) return;

    if (
      !shouldStartCardDrag({
        allowDrag: this.allowDrag,
        canUpdate: this.card.canUpdate,
        saving: this.card.saving === true,
        pointerType: event.pointerType,
        button: event.button,
        isPrimary: event.isPrimary,
        blockingTarget: isCardDragBlockingPath(
          event.composedPath().map((node) => (node as HTMLElement).localName ?? ''),
        ),
      })
    ) {
      return;
    }

    const element = event.currentTarget as HTMLElement;

    // Capturing on the card is what makes every subsequent event for this pointer arrive here regardless
    // of what is visually underneath — including over another lane, which is the whole point.
    element.setPointerCapture(event.pointerId);

    this.#drag = { pointerId: event.pointerId, target: element };
    window.addEventListener('keydown', this.#onKeyDown);
    this.#moved = false;
    this._dragging = true;

    // The offset within the card, and its width, are only knowable here — the board never sees this
    // element's own geometry, and the ghost has to keep both to sit where the card was picked up.
    const rect = element.getBoundingClientRect();

    this.#dispatch('kanban-drag-start', {
      key: this.card.key,
      lane: this.laneValue,
      grabOffsetX: event.clientX - rect.left,
      grabOffsetY: event.clientY - rect.top,
      width: rect.width,
    });

    // Stops the browser's native drag-select starting before the board's re-render lands — Lit's render
    // is a microtask, not synchronous with this event.
    event.preventDefault();
  }

  #onPointerMove(event: PointerEvent) {
    if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;

    this.#moved = true;

    this.#dispatch('kanban-drag-move', { clientX: event.clientX, clientY: event.clientY });
  }

  #onPointerUp(event: PointerEvent) {
    if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;

    this.#endDrag();

    this.#dispatch('kanban-drag-end', { clientX: event.clientX, clientY: event.clientY });
  }

  /**
   * pointercancel and lostpointercapture, the latter of which the browser can fire with no pointerup ever
   * arriving (losing window focus, an OS gesture taking over the drag). Identical cleanup to a pointerup
   * over nothing — the same reasoning the board's pan already applies to a revoked capture.
   */
  #onPointerCancel(event: PointerEvent) {
    if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;

    this.#endDrag();

    this.#dispatch('kanban-drag-cancel', undefined);
  }

  /**
   * Escape abandons the gesture. Bound on `window` rather than the card because a card mid-drag does not
   * necessarily hold focus — the pointer is captured, which is not the same thing. Purely local: the move
   * is only applied on drop, so there is never a write in flight to unwind here.
   */
  #onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.#drag) return;

    this.#endDrag();
    this.#dispatch('kanban-drag-cancel', undefined);
  };

  /** Releases the capture and clears the gesture. Every exit path ends here. */
  #endDrag() {
    if (this.#drag?.target.hasPointerCapture(this.#drag.pointerId)) {
      this.#drag.target.releasePointerCapture(this.#drag.pointerId);
    }

    this.#drag = undefined;
    this._dragging = false;

    window.removeEventListener('keydown', this.#onKeyDown);
  }

  #dispatch(type: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  override render() {
    if (!this.card) return nothing;

    const tag = cardStateTag(this.card.state);
    const disabledReason = dragDisabledReason({
      allowDrag: this.allowDrag,
      canUpdate: this.card.canUpdate,
      saving: this.card.saving === true,
    });

    return html`
      <div
        class=${classMap({
          card: true,
          draggable: this.allowDrag && this.card.canUpdate && this.card.saving !== true,
          dragging: this._dragging,
          saving: this.card.saving === true,
        })}
        @pointerdown=${this.#onPointerDown}
        @pointermove=${this.#onPointerMove}
        @pointerup=${this.#onPointerUp}
        @pointercancel=${this.#onPointerCancel}
        @lostpointercapture=${this.#onPointerCancel}>
        <div class="header">
          ${this.card.icon ? html`<umb-icon name=${this.card.icon}></umb-icon>` : nothing}
          <button type="button" class="name" @click=${this.#onOpen}>${this.card.name}</button>
          ${disabledReason
            ? html`<umb-icon
                class="drag-disabled"
                name=${DRAG_DISABLED_COPY[disabledReason].icon}
                title=${DRAG_DISABLED_COPY[disabledReason].title}></umb-icon>`
            : nothing}
          <umb-entity-actions-bundle .label=${this.card.name}></umb-entity-actions-bundle>
        </div>
        ${this.card.properties.length
          ? html`<div class="properties">
              ${repeat(
                this.card.properties,
                (item) => item.alias,
                (item) => this.#renderProperty(item),
              )}
            </div>`
          : nothing}
        ${this.#renderChildren()}
        <div class="footer">
          <uui-tag color=${tag.color} look="secondary">${this.localize.term(tag.term)}</uui-tag>
        </div>
      </div>
    `;
  }

  #renderChildren() {
    if (!this.showChildItems || !this.card) return nothing;

    // Nothing to list and nothing to add: no section at all, rather than an empty rule across the card.
    if (this.card.children.length === 0 && this.card.canCreate === false) return nothing;

    return html`<umb-community-kanban-card-children .card=${this.card}></umb-community-kanban-card-children>`;
  }

  #renderProperty(item: KanbanCardPropertyModel) {
    return html`
      <div class="property">
        <span class="label">${item.name}</span>
        ${item.nameTemplate
          ? // The backoffice's own UFM renderer, and the same syntax a List View column template uses,
            // so a template copied from one behaves identically here.
            //
            // The value is wrapped in an object rather than passed raw, which is what core's own
            // document collection card and table column do. `umb-ufm-js-expression` builds its
            // evaluation scope by *spreading* this value — `{...model, ...filters}` — so a template
            // referring to `value` only resolves if the model has a `value` property. Passing the raw
            // value spread its characters instead, leaving `value` undefined and every template empty.
            html`<umb-ufm-render inline .markdown=${item.nameTemplate} .value=${{ value: item.value }}></umb-ufm-render>`
          : // No template: the summary extension is what makes a picker or a dropdown render sensibly
            // with no configuration at all, which is why both paths are kept.
            html`<umb-value-summary-extension
              .valueType=${item.editorAlias}
              .value=${item.value}></umb-value-summary-extension>`}
      </div>
    `;
  }

  static override styles = [
    css`
      .card {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-2);
        padding: var(--uui-size-space-3);
        background: var(--uui-color-surface);
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius);
      }

      .card:hover {
        border-color: var(--uui-color-border-emphasis);
      }

      .card.draggable {
        cursor: grab;
      }

      /* The placeholder: this card is the one in flight, so it reads as lifted out of the lane. Text
         selection is off for the gesture's duration, the same reason \`.lanes.panning\` turns it off. */
      .card.dragging {
        cursor: grabbing;
        opacity: 0.5;
        border-style: dashed;
        user-select: none;
      }

      /* A write is in flight: the card reads as provisional and cannot be picked up again until it
         resolves, which shouldStartCardDrag enforces independently of this styling. */
      .card.saving {
        opacity: 0.6;
        cursor: progress;
      }

      .header {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
      }

      .drag-disabled {
        color: var(--uui-color-text-alt);
        cursor: help;
      }

      .name {
        flex: 1;
        font-weight: bold;
        overflow-wrap: anywhere;
        /* A real button, so it is keyboard-reachable without hand-rolled key handling — styled back
           down to the text it replaced. */
        appearance: none;
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        font: inherit;
        font-weight: bold;
        color: inherit;
        text-align: left;
        cursor: pointer;
      }

      .name:hover {
        text-decoration: underline;
      }

      .properties {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-1);
        font-size: var(--uui-type-small-size);
      }

      .property {
        display: flex;
        gap: var(--uui-size-space-2);
      }

      .label {
        color: var(--uui-color-text-alt);
      }
    `,
  ];
}

export { UmbCommunityKanbanCardElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-card': UmbCommunityKanbanCardElement;
  }
}
