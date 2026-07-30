import { classMap, css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_NOTIFICATION_CONTEXT } from '@umbraco-cms/backoffice/notification';
import {
  applyCardState,
  mergeLanePage,
  moveCard,
  nextStateAfterSave,
  setCardSaving,
  toBoardState,
  type KanbanBoardState,
} from './board.model.js';
import { laneAtPoint, moveFailureMessage, type KanbanLaneHitTarget } from './drag.model.js';
import './kanban-lane.element.js';
import type { KanbanBoardQuery, KanbanDataSource } from '../data/kanban-data-source.js';
import { panScrollOffset, shouldStartPan } from './pan.model.js';

type KanbanBoardStatus = 'idle' | 'loading' | 'ready' | 'not-configured' | 'error';

/**
 * The board. Host-agnostic by design: it knows a parent, a culture and a data source, and
 * nothing about collections, workspaces or data types. Every host is an adapter that
 * supplies those three and renders this.
 */
@customElement('umb-community-kanban-board')
export class UmbCommunityKanbanBoardElement extends UmbLitElement {
  @property({ type: String, attribute: 'parent-id' })
  parentId?: string;

  @property({ type: String, attribute: 'config-id' })
  configId?: string;

  @property({ type: String })
  culture?: string | null;

  @property({ attribute: false })
  datasource?: KanbanDataSource;

  @state()
  private _status: KanbanBoardStatus = 'idle';

  @state()
  private _board?: KanbanBoardState;

  /** True only while a background pan is live — drives the grabbing cursor and disables text selection. */
  @state()
  private _isPanning = false;

  /**
   * The live card drag, or undefined between gestures. `lane` is the source lane, captured at drag start
   * so the revert on a failed write is the exact inverse move.
   */
  @state()
  private _drag?: { key: string; lane: string };

  /** The lane currently under the pointer, or undefined. Only ever one, which laneAtPoint guarantees. */
  @state()
  private _dropTarget?: { value: string; acceptsDrops: boolean };

  /** The in-progress pan, or undefined between drags. Keyed by pointerId so a second pointer is ignored. */
  #pan?: {
    pointerId: number;
    startX: number;
    startScrollLeft: number;
  };

  /**
   * Monotonically increasing token identifying the most recently started load. Hosts trigger
   * loads from independent, asynchronously-timed signals (parent, culture, collection reload),
   * so requests can overlap; a response is only applied if it's still the most recent one
   * requested, otherwise an older, slower response could clobber a newer, faster one.
   */
  #loadToken = 0;

  /** Reloads the whole board. Hosts call this when their own data changes. */
  async load() {
    if (!this.parentId || !this.datasource) return;

    // A reload swaps out `.lanes` for a loader, not a re-render in place — any in-progress pan or card
    // drag would otherwise be stranded on the discarded div (see #endPan for why that's unsafe).
    this.#endPan();
    this.#onDragCancel();

    const token = ++this.#loadToken;

    this._status = 'loading';

    const outcome = await this.datasource.getBoard(this.#query());

    if (token !== this.#loadToken) return; // a newer load started; this response is stale

    if (outcome.kind === 'success') {
      this._board = toBoardState(outcome.board);
      this._status = 'ready';
      return;
    }

    this._board = undefined;
    this._status = outcome.kind === 'not-configured' ? 'not-configured' : 'error';
  }

  #query(extra?: Partial<KanbanBoardQuery>): KanbanBoardQuery {
    return {
      parentId: this.parentId!,
      configId: this.configId,
      culture: this.culture,
      ...extra,
    };
  }

  async #onLoadMore(event: CustomEvent<{ lane: string; skip: number }>) {
    if (!this.datasource || !this._board) return;

    // Snapshot the current load token: if a full load() starts (and completes or not) while this
    // page fetch is in flight, that reload owns `_board` going forward and this page's merge
    // must not apply on top of it — the reload's _board may not even be the same object shape
    // the merge was computed against.
    const token = this.#loadToken;

    const outcome = await this.datasource.getBoard(
      this.#query({ lane: event.detail.lane, skip: event.detail.skip }),
    );

    if (token !== this.#loadToken) return; // a full reload started meanwhile; discard this page

    if (outcome.kind === 'success' && this._board) {
      this._board = mergeLanePage(this._board, outcome.board);
    }
  }

  /**
   * Starts a background pan. Gated on `event.target === event.currentTarget`: the listener is bound
   * directly on `.lanes`, so `currentTarget` is always that div, and the two are equal only when the
   * pointer went down on the div itself — never a lane or a card inside it. Touch is excluded because
   * `.lanes` already scrolls horizontally on a touch swipe, with native momentum, for free.
   */
  #onLanesPointerDown(event: PointerEvent) {
    if (this.#pan) return; // a pan is already in progress for another pointer

    const lanes = event.currentTarget as HTMLDivElement;

    if (
      !shouldStartPan({
        isSelfTarget: event.target === event.currentTarget,
        pointerType: event.pointerType,
        button: event.button,
        isPrimary: event.isPrimary,
        offsetX: event.offsetX,
        offsetY: event.offsetY,
        clientWidth: lanes.clientWidth,
        clientHeight: lanes.clientHeight,
      })
    ) {
      return;
    }

    lanes.setPointerCapture(event.pointerId);

    this.#pan = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: lanes.scrollLeft,
    };
    this._isPanning = true;

    // Stops the browser's native drag-select from starting before the _isPanning re-render lands —
    // Lit's re-render is a microtask, not synchronous with this event.
    event.preventDefault();
  }

  /**
   * Once `.lanes` has captured the pointer, every subsequent event for it is retargeted here by the
   * Pointer Events spec regardless of what is visually underneath — so a drag that passes back over a
   * lane or a card mid-gesture never reaches that lane's or card's own handlers.
   */
  #onLanesPointerMove(event: PointerEvent) {
    if (!this.#pan || event.pointerId !== this.#pan.pointerId) return;

    const lanes = event.currentTarget as HTMLDivElement;

    lanes.scrollLeft = panScrollOffset(this.#pan.startScrollLeft, this.#pan.startX, event.clientX);
  }

  /**
   * Ends a pan. Shared by pointerup, pointercancel and lostpointercapture — the last of which the
   * browser can fire without a pointerup ever arriving (losing window focus, an OS gesture
   * intercepting the drag), and without this the cursor could get stuck on "grabbing" forever.
   */
  #onLanesPointerEnd(event: PointerEvent) {
    if (!this.#pan || event.pointerId !== this.#pan.pointerId) return;

    const lanes = event.currentTarget as HTMLDivElement;

    if (lanes.hasPointerCapture(event.pointerId)) {
      lanes.releasePointerCapture(event.pointerId);
    }

    this.#endPan();
  }

  /**
   * Clears in-progress pan state. Split out from `#onLanesPointerEnd` so `load()` can also call
   * it: a reload swaps `.lanes` out for a loader rather than re-rendering it in place, so a pan
   * left live across that swap would either go permanently dead (no pointerup ever reaches the
   * new div) or, worse, survive with a `startScrollLeft` captured from the discarded element and
   * jump the board on the next pointermove.
   */
  #endPan() {
    this.#pan = undefined;
    this._isPanning = false;
  }

  #onDragStart(event: CustomEvent<{ key: string; lane: string }>) {
    // A pan and a card drag cannot overlap: the pan only starts on `.lanes` itself, which a card is never.
    this._drag = { key: event.detail.key, lane: event.detail.lane };
    this._dropTarget = undefined;
  }

  #onDragMove(event: CustomEvent<{ clientX: number; clientY: number }>) {
    if (!this._drag) return;

    const hit = laneAtPoint(event.detail.clientX, event.detail.clientY, this.#laneTargets());

    this._dropTarget = hit ? { value: hit.value, acceptsDrops: hit.acceptsDrops } : undefined;
  }

  #onDragCancel() {
    this._drag = undefined;
    this._dropTarget = undefined;
  }

  async #onDragEnd(event: CustomEvent<{ clientX: number; clientY: number }>) {
    const drag = this._drag;
    const hit = drag ? laneAtPoint(event.detail.clientX, event.detail.clientY, this.#laneTargets()) : undefined;

    // Clear before awaiting anything, so the highlight never outlives the gesture.
    this._drag = undefined;
    this._dropTarget = undefined;

    if (!drag || !hit || !hit.acceptsDrops || !this._board || !this.datasource) return;
    if (hit.value.toLowerCase() === drag.lane.toLowerCase()) return;

    const card = this.#findCard(drag.key);

    if (!card) return;

    // Optimistic: the card relocates, its badge flips, and it dims — all before the request is even sent.
    let next = moveCard(this._board, drag.key, drag.lane, hit.value);
    next = applyCardState(next, drag.key, nextStateAfterSave(card.state));
    this._board = setCardSaving(next, drag.key, true);

    const token = this.#loadToken;

    const outcome = await this.datasource.setLane({
      cardKey: drag.key,
      laneValue: hit.value,
      culture: this.culture,
    });

    // A full reload started meanwhile and owns `_board` now; its state came from the server, so it is
    // already correct whether the write landed or not.
    if (token !== this.#loadToken || !this._board) return;

    if (outcome.kind === 'success') {
      // What the server actually persisted, in place of the optimistic guess.
      this._board = setCardSaving(applyCardState(this._board, drag.key, outcome.state), drag.key, false);
      return;
    }

    // The same function with the lanes swapped: the card goes back exactly where it started.
    let reverted = moveCard(this._board, drag.key, hit.value, drag.lane);
    reverted = applyCardState(reverted, drag.key, card.state);
    this._board = setCardSaving(reverted, drag.key, false);

    const notifications = await this.getContext(UMB_NOTIFICATION_CONTEXT);

    notifications?.peek('danger', {
      data: { message: moveFailureMessage(card.name, outcome.status) },
    });
  }

  /** Every rendered lane's identity and viewport rect — the board is the only element that can see them all. */
  #laneTargets(): KanbanLaneHitTarget[] {
    const elements = Array.from(this.renderRoot.querySelectorAll('umb-community-kanban-lane'));

    return elements.flatMap((element) => {
      if (!element.lane) return [];

      const rect = element.getBoundingClientRect();

      return [
        {
          value: element.lane.value,
          acceptsDrops: element.lane.acceptsDrops,
          rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        },
      ];
    });
  }

  #findCard(key: string) {
    return this._board?.lanes.flatMap((lane) => lane.cards).find((card) => card.key === key);
  }

  override render() {
    switch (this._status) {
      case 'idle':
      case 'loading':
        return html`<uui-loader></uui-loader>`;
      case 'not-configured':
        return this.#renderMessage(
          'This collection has no Kanban configuration yet. Open its data type and choose one on the Kanban tab.',
        );
      case 'error':
        return this.#renderMessage('The board could not be loaded.');
      default:
        return this.#renderBoard();
    }
  }

  #renderMessage(message: string) {
    return html`<div class="message">${message}</div>`;
  }

  #renderBoard() {
    if (!this._board) return nothing;

    return html`
      ${this._board.truncated
        ? // Deliberately no child count: it is the parent's true count, not permission-filtered,
          // so printing it would disclose the existence of siblings a restricted user cannot see.
          this.#renderMessage('Showing the first cards only — lane counts shown here are lower bounds.')
        : nothing}
      <div
        class=${classMap({ lanes: true, panning: this._isPanning })}
        @kanban-load-more=${this.#onLoadMore}
        @kanban-drag-start=${this.#onDragStart}
        @kanban-drag-move=${this.#onDragMove}
        @kanban-drag-end=${this.#onDragEnd}
        @kanban-drag-cancel=${this.#onDragCancel}
        @pointerdown=${this.#onLanesPointerDown}
        @pointermove=${this.#onLanesPointerMove}
        @pointerup=${this.#onLanesPointerEnd}
        @pointercancel=${this.#onLanesPointerEnd}
        @lostpointercapture=${this.#onLanesPointerEnd}>
        ${this._board.lanes.map(
          (lane) => html`<umb-community-kanban-lane
            .lane=${lane}
            ?allow-drag=${this._board?.allowDrag ?? false}
            ?is-drop-target=${this._dropTarget?.value === lane.value}
            ?accepts-drop=${this._dropTarget?.acceptsDrops ?? false}
            ?show-child-items=${this._board?.showChildItems ?? false}></umb-community-kanban-lane>`,
        )}
      </div>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
        padding: var(--uui-size-layout-1);
      }

      .lanes {
        display: flex;
        gap: var(--uui-size-space-4);
        align-items: flex-start;
        overflow-x: auto;
        padding-bottom: var(--uui-size-space-3);
        cursor: grab;
      }

      .lanes > * {
        cursor: auto;
      }

      .lanes.panning {
        cursor: grabbing;
        user-select: none;
      }

      .message {
        padding: var(--uui-size-space-4);
        color: var(--uui-color-text-alt);
      }
    `,
  ];
}

export { UmbCommunityKanbanBoardElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-board': UmbCommunityKanbanBoardElement;
  }
}
