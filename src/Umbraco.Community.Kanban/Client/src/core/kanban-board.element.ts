import { classMap, css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { mergeLanePage, toBoardState, type KanbanBoardState } from './board.model.js';
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

  /** Fixed true for this milestone; drag arrives in milestone 3. */
  @property({ type: Boolean })
  readonly = true;

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
   * The in-progress pan, or undefined between drags. Keyed by pointerId so a second pointer is
   * ignored. `vertical` is present only when an ancestor with its own vertical overflow was found
   * at drag start — its absence means this drag pans horizontally only, exactly as it did before
   * this axis was added.
   */
  #pan?: {
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    vertical?: { target: Element; startY: number; startScrollTop: number };
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

    // A reload swaps out `.lanes` for a loader, not a re-render in place — any in-progress pan
    // would otherwise be stranded on the discarded div (see #endPan for why that's unsafe).
    this.#endPan();

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
   * The nearest ancestor of `from` whose *computed* overflow-y is auto, scroll or overlay — the
   * element that actually owns vertical scrolling here, whatever it is. `.lanes` has no vertical
   * overflow of its own, so when a board grows taller than the viewport, some ancestor outside this
   * component already scrolls it (in the live Collection View host, Umbraco's own
   * `<uui-scroll-container>`, several shadow trees up) — this finds it without assuming which
   * element that is.
   *
   * `parentElement` returns null at the top of a shadow tree, where `getRootNode()` returns the
   * `ShadowRoot` itself; its `.host` is the next real element up, which is how this crosses shadow
   * boundaries a plain `.closest()` cannot. Deliberately not cached across drags — a reload or a
   * host swap could change the ancestry between one drag and the next — and deliberately not a
   * pure function: it reads live layout, so it is verified by hand, like the rest of this file's
   * pointer-event wiring.
   */
  #findVerticalScrollAncestor(from: Element): Element | null {
    let node: Node | null = from.parentElement ?? from.getRootNode();

    while (node) {
      if (node instanceof ShadowRoot) {
        node = node.host;
        continue;
      }

      if (!(node instanceof Element)) return null; // reached the Document with nothing found

      if (/(auto|scroll|overlay)/.test(getComputedStyle(node).overflowY)) {
        return node;
      }

      node = node.parentElement ?? node.getRootNode();
    }

    return null;
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

    const verticalTarget = this.#findVerticalScrollAncestor(lanes);

    this.#pan = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: lanes.scrollLeft,
      vertical: verticalTarget
        ? { target: verticalTarget, startY: event.clientY, startScrollTop: verticalTarget.scrollTop }
        : undefined,
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

    const vertical = this.#pan.vertical;

    if (vertical) {
      vertical.target.scrollTop = panScrollOffset(vertical.startScrollTop, vertical.startY, event.clientY);
    }
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
        @pointerdown=${this.#onLanesPointerDown}
        @pointermove=${this.#onLanesPointerMove}
        @pointerup=${this.#onLanesPointerEnd}
        @pointercancel=${this.#onLanesPointerEnd}
        @lostpointercapture=${this.#onLanesPointerEnd}>
        ${this._board.lanes.map(
          (lane) => html`<umb-community-kanban-lane
            .lane=${lane}
            ?readonly=${this.readonly}
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
