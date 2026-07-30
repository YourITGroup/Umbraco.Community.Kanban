import { classMap, css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import type { PropertyValues } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_NOTIFICATION_CONTEXT } from '@umbraco-cms/backoffice/notification';
import { UmbDocumentPublishingRepository } from '@umbraco-cms/backoffice/document';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import { UmbVariantId } from '@umbraco-cms/backoffice/variant';
import {
  applyCardState,
  mergeLanePage,
  moveCard,
  nextStateAfterSave,
  pendingCards,
  setCardSaving,
  toBoardState,
  type KanbanBoardState,
} from './board.model.js';
import {
  formatPublishSummary,
  ghostPosition,
  laneAtPoint,
  moveFailureMessage,
  type KanbanLaneHitTarget,
} from './drag.model.js';
import { boardAvailableBottom, boardViewportHeight, edgeScrollDelta } from './canvas.model.js';
import './kanban-lane.element.js';
import type { KanbanBoardQuery, KanbanDataSource } from '../data/kanban-data-source.js';
import { isPannablePath, panScrollOffset, shouldStartPan } from './pan.model.js';

/** The host's own bottom padding (`--uui-size-layout-1`), so the viewport ends at the window's edge. */
const VIEWPORT_GUTTER = 24;

/** Below this a scrolling canvas is useless — roughly a lane header plus two cards. */
const VIEWPORT_MIN_HEIGHT = 320;

/** How close to a viewport edge a dragged card must be held before the canvas starts scrolling. */
const EDGE_SCROLL_THRESHOLD = 60;

/** Peak auto-scroll speed, in pixels per frame — roughly four lane widths a second at 60fps. */
const EDGE_SCROLL_MAX_SPEED = 20;

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
   * so the revert on a failed write is the exact inverse move; the offsets and width are what let the
   * ghost sit where the card was picked up.
   */
  @state()
  private _drag?: { key: string; lane: string; grabOffsetX: number; grabOffsetY: number; width: number };

  /** The ghost's top-left corner, recomputed once per frame while a drag is live. */
  @state()
  private _ghost?: { left: number; top: number };

  /** The lane currently under the pointer, or undefined. Only ever one, which laneAtPoint guarantees. */
  @state()
  private _dropTarget?: { value: string; acceptsDrops: boolean };

  /**
   * Umbraco's own single-document publishing repository, looped once per pending card. This is exactly
   * what core's document list-view bulk publish does — that action has no server-side bulk endpoint
   * behind it either — so this milestone adds no /publish-pending controller of its own.
   */
  #publishing = new UmbDocumentPublishingRepository(this);

  /** True while a publish run is in flight, so the button cannot be pressed twice. */
  @state()
  private _publishing = false;

  /**
   * The viewport's height in pixels, measured from the window. Undefined until the first measurement,
   * when the CSS `min-height` is what holds the box open.
   */
  @state()
  private _viewportHeight?: number;

  /** The pointer's last known viewport position during a drag. Not `@state()` — the frame loop reads it. */
  #pointer?: { x: number; y: number };

  /** The live `requestAnimationFrame` handle for the drag loop, or undefined when it is not running. */
  #frame?: number;

  /** The in-progress pan, or undefined between drags. Keyed by pointerId so a second pointer is ignored. */
  #pan?: {
    pointerId: number;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
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

    // A reload swaps out `.viewport` for a loader, not a re-render in place — any in-progress pan or card
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

  override connectedCallback() {
    super.connectedCallback();

    window.addEventListener('resize', this.#onWindowResize);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();

    window.removeEventListener('resize', this.#onWindowResize);
  }

  override updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties);

    this.#measureViewport();
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
   * Starts a background pan. Anything that is not a card or a control counts as background — the canvas,
   * a lane, a lane header, the empty space below a lane's cards — so the board can be grabbed from inside
   * a lane and not only from the gaps between them. Touch is excluded because `.viewport` already scrolls
   * natively on a swipe, with momentum, for free.
   */
  #onViewportPointerDown(event: PointerEvent) {
    if (this.#pan) return; // a pan is already in progress for another pointer

    const viewport = event.currentTarget as HTMLDivElement;
    const rect = viewport.getBoundingClientRect();

    if (
      !shouldStartPan({
        isPannableTarget: isPannablePath(
          event.composedPath().map((node) => (node as HTMLElement).localName ?? ''),
        ),
        pointerType: event.pointerType,
        button: event.button,
        isPrimary: event.isPrimary,
        // Measured against the viewport rather than taken from the event: `offsetX`/`offsetY` are
        // relative to whatever was pressed, which is now usually a lane, so the event's own values
        // would compare a lane-relative offset against the viewport's size.
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        clientWidth: viewport.clientWidth,
        clientHeight: viewport.clientHeight,
      })
    ) {
      return;
    }

    viewport.setPointerCapture(event.pointerId);

    this.#pan = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
    };
    this._isPanning = true;

    // Stops the browser's native drag-select from starting before the _isPanning re-render lands —
    // Lit's re-render is a microtask, not synchronous with this event.
    event.preventDefault();
  }

  /**
   * Once `.viewport` has captured the pointer, every subsequent event for it is retargeted here by the
   * Pointer Events spec regardless of what is visually underneath — so a drag that passes back over a
   * lane or a card mid-gesture never reaches that lane's or card's own handlers.
   */
  #onViewportPointerMove(event: PointerEvent) {
    if (!this.#pan || event.pointerId !== this.#pan.pointerId) return;

    const viewport = event.currentTarget as HTMLDivElement;

    viewport.scrollLeft = panScrollOffset(this.#pan.startScrollLeft, this.#pan.startX, event.clientX);
    viewport.scrollTop = panScrollOffset(this.#pan.startScrollTop, this.#pan.startY, event.clientY);
  }

  /**
   * Ends a pan. Shared by pointerup, pointercancel and lostpointercapture — the last of which the
   * browser can fire without a pointerup ever arriving (losing window focus, an OS gesture
   * intercepting the drag), and without this the cursor could get stuck on "grabbing" forever.
   */
  #onViewportPointerEnd(event: PointerEvent) {
    if (!this.#pan || event.pointerId !== this.#pan.pointerId) return;

    const viewport = event.currentTarget as HTMLDivElement;

    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }

    this.#endPan();
  }

  /**
   * Clears in-progress pan state. Split out from `#onViewportPointerEnd` so `load()` can also call
   * it: a reload swaps `.viewport` out for a loader rather than re-rendering it in place, so a pan
   * left live across that swap would either go permanently dead (no pointerup ever reaches the
   * new div) or, worse, survive with a `startScrollLeft` captured from the discarded element and
   * jump the board on the next pointermove.
   */
  #endPan() {
    this.#pan = undefined;
    this._isPanning = false;
  }

  /**
   * Sets the viewport's height from the window. Called after every render because the publish toolbar
   * and the truncation message both change where the viewport starts, and a stale height would leave it
   * overhanging the window or short of it.
   */
  #measureViewport() {
    const viewport = this.renderRoot.querySelector<HTMLDivElement>('.viewport');

    if (!viewport) return;

    // The action bar sits below the viewport inside this element, so its height is space the canvas
    // cannot have. Measured rather than assumed — it holds a growing set of actions and may wrap.
    const actions = this.renderRoot.querySelector<HTMLDivElement>('.actions');
    const rectTop = viewport.getBoundingClientRect().top;

    const height = boardViewportHeight({
      rectTop,
      availableBottom: boardAvailableBottom({
        windowHeight: window.innerHeight,
        rectTop,
        ancestors: this.#ancestorBoxes(),
      }),
      gutter: VIEWPORT_GUTTER + (actions?.getBoundingClientRect().height ?? 0),
      min: VIEWPORT_MIN_HEIGHT,
    });

    // Only assign on a real change: `updated()` calls this, so assigning unconditionally would
    // schedule another update and loop forever. Sub-pixel jitter is not a real change.
    if (this._viewportHeight === undefined || Math.abs(this._viewportHeight - height) >= 1) {
      this._viewportHeight = height;
    }
  }

  /**
   * Every ancestor above this element, out through shadow boundaries, as bottom edge plus whether it has a
   * real box. Read-only geometry on elements we climb past — it never looks *into* another component's
   * shadow content, which is the mistake the reverted vertical pan made.
   *
   * A boxless wrapper is recognised by a computed height that is not a pixel value: an element with a
   * rendered box always resolves to pixels, while the layout's `router-slot` wrappers report `100%` and a
   * zero `clientHeight`.
   */
  #ancestorBoxes(): { bottom: number; definiteHeight: boolean }[] {
    const boxes: { bottom: number; definiteHeight: boolean }[] = [];

    // Starts at the parent: this element's own box is the thing being sized, so it cannot bound itself.
    let element = this.#parentOf(this);

    while (element) {
      const height = getComputedStyle(element).height;

      boxes.push({
        bottom: element.getBoundingClientRect().bottom,
        definiteHeight: height.endsWith('px') && element.clientHeight > 0,
      });

      element = this.#parentOf(element);
    }

    return boxes;
  }

  /** The next element up, hopping out of a shadow root to its host when there is no parent element. */
  #parentOf(element: Element): Element | null {
    if (element.parentElement) return element.parentElement;

    const root = element.getRootNode();

    return root instanceof ShadowRoot ? root.host : null;
  }

  #onWindowResize = () => this.#measureViewport();

  #onDragStart(
    event: CustomEvent<{ key: string; lane: string; grabOffsetX: number; grabOffsetY: number; width: number }>,
  ) {
    // A pan and a card drag cannot overlap: the pan only starts on the canvas background, never a card.
    this._drag = { ...event.detail };
    this._dropTarget = undefined;
    this.#pointer = undefined;
    this.#startDragLoop();
  }

  /**
   * Records the pointer only. Everything derived from it — the ghost's position and the drop target — is
   * computed on the next frame instead, because `pointermove` fires more often than frames and because
   * the drop target has to keep updating while the canvas auto-scrolls under a stationary pointer.
   */
  #onDragMove(event: CustomEvent<{ clientX: number; clientY: number }>) {
    if (!this._drag) return;

    this.#pointer = { x: event.detail.clientX, y: event.detail.clientY };
  }

  #onDragCancel() {
    this.#stopDragLoop();
    this._drag = undefined;
    this._dropTarget = undefined;
    this._ghost = undefined;
    this.#pointer = undefined;
  }

  /** Runs for the whole gesture, not once per pointer event. See `#onDragFrame`. */
  #startDragLoop() {
    if (this.#frame !== undefined) return;

    const tick = () => {
      this.#frame = requestAnimationFrame(tick);
      this.#onDragFrame();
    };

    this.#frame = requestAnimationFrame(tick);
  }

  #stopDragLoop() {
    if (this.#frame === undefined) return;

    cancelAnimationFrame(this.#frame);
    this.#frame = undefined;
  }

  /**
   * One frame of a live drag: move the ghost, then re-run the hit-test.
   *
   * The hit-test belongs here rather than in the move handler because lane rects move whenever the canvas
   * scrolls, which can happen on a frame where no pointer event arrived at all.
   */
  #onDragFrame() {
    const pointer = this.#pointer;

    if (!this._drag || !pointer) return;

    const viewport = this.renderRoot.querySelector<HTMLDivElement>('.viewport');

    if (viewport) {
      const rect = viewport.getBoundingClientRect();
      const { dx, dy } = edgeScrollDelta({
        pointer,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        threshold: EDGE_SCROLL_THRESHOLD,
        maxSpeed: EDGE_SCROLL_MAX_SPEED,
      });

      // Assigning past either end is harmless — the browser clamps scrollLeft/scrollTop for us.
      if (dx !== 0) viewport.scrollLeft += dx;
      if (dy !== 0) viewport.scrollTop += dy;
    }

    this._ghost = ghostPosition({
      pointer,
      grabOffset: { x: this._drag.grabOffsetX, y: this._drag.grabOffsetY },
    });

    const hit = laneAtPoint(pointer.x, pointer.y, this.#laneTargets());

    this._dropTarget = hit ? { value: hit.value, acceptsDrops: hit.acceptsDrops } : undefined;
  }

  async #onDragEnd(event: CustomEvent<{ clientX: number; clientY: number }>) {
    const drag = this._drag;
    const hit = drag ? laneAtPoint(event.detail.clientX, event.detail.clientY, this.#laneTargets()) : undefined;

    // Clear before awaiting anything, so neither the highlight nor the ghost outlives the gesture.
    this.#stopDragLoop();
    this._drag = undefined;
    this._dropTarget = undefined;
    this._ghost = undefined;
    this.#pointer = undefined;

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

  async #onPublishPending() {
    if (!this._board || this._publishing) return;

    const pending = pendingCards(this._board);

    if (pending.length === 0) return;

    const confirmed = await umbConfirmModal(this, {
      headline: '#content_readyToPublish',
      content: `${pending.length} ${pending.length === 1 ? 'card has' : 'cards have'} unpublished changes: ${pending
        .map((card) => card.name)
        .join(', ')}`,
      color: 'positive',
      confirmLabel: this.localize.term('actions_publish'),
    }).catch(() => false);

    if (confirmed === false) return;

    this._publishing = true;

    // The board's own culture, or the invariant variant where nothing varies — the same choice core's
    // bulk action makes when every selected document is invariant.
    const variantId = this.culture ? new UmbVariantId(this.culture, null) : UmbVariantId.CreateInvariant();

    let succeeded = 0;

    for (const card of pending) {
      const { error } = await this.#publishing.publish(card.key, [{ variantId }]);

      if (error) continue;

      succeeded++;

      // Flip this card locally rather than reloading the whole board: a reload would discard every lane
      // page the editor has already loaded.
      if (this._board) {
        this._board = applyCardState(this._board, card.key, 'published');
      }
    }

    this._publishing = false;

    const notifications = await this.getContext(UMB_NOTIFICATION_CONTEXT);

    // One summary line, never one toast per card — a failure folds into the same line as the successes.
    notifications?.peek(succeeded === pending.length ? 'positive' : 'warning', {
      data: { message: formatPublishSummary(succeeded, pending.length) },
    });
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

  /**
   * The board's action bar, pinned below the canvas. Deliberately shaped like core's own
   * `umb-collection-selection-actions` — same background, contrast colour and space-between layout — so a
   * board action reads as the same kind of thing as a list view's bulk action. Built to hold more than one
   * action: further board-level actions belong in `.buttons` beside Publish.
   */
  #renderActions() {
    if (!this._board) return nothing;

    const pending = pendingCards(this._board);

    if (pending.length === 0) return nothing;

    return html`
      <div class="actions">
        <div class="summary">
          ${pending.length} ${pending.length === 1 ? 'card has' : 'cards have'} pending changes
        </div>
        <div class="buttons">
          <uui-button
            look="primary"
            color="positive"
            icon="icon-globe"
            label="Publish pending changes"
            ?disabled=${this._publishing}
            @click=${this.#onPublishPending}>
            Publish pending changes
          </uui-button>
        </div>
      </div>
    `;
  }

  /**
   * The dragged card, following the pointer. A real card element rather than a bespoke chip, so it cannot
   * drift from how cards actually look; `allow-drag` is left off (defaulting false) so the clone cannot
   * start a gesture of its own, and `pointer-events: none` keeps it inert under the cursor.
   */
  #renderGhost() {
    if (!this._drag || !this._ghost) return nothing;

    const card = this.#findCard(this._drag.key);

    if (!card) return nothing;

    return html`<div
      class="ghost"
      aria-hidden="true"
      style=${`transform: translate3d(${this._ghost.left}px, ${this._ghost.top}px, 0) rotate(2deg); width: ${this._drag.width}px`}>
      <umb-community-kanban-card
        .card=${card}
        ?show-child-items=${this._board?.showChildItems ?? false}></umb-community-kanban-card>
    </div>`;
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
        class=${classMap({ viewport: true, panning: this._isPanning })}
        style=${this._viewportHeight ? `height: ${this._viewportHeight}px` : ''}
        @kanban-load-more=${this.#onLoadMore}
        @kanban-drag-start=${this.#onDragStart}
        @kanban-drag-move=${this.#onDragMove}
        @kanban-drag-end=${this.#onDragEnd}
        @kanban-drag-cancel=${this.#onDragCancel}
        @pointerdown=${this.#onViewportPointerDown}
        @pointermove=${this.#onViewportPointerMove}
        @pointerup=${this.#onViewportPointerEnd}
        @pointercancel=${this.#onViewportPointerEnd}
        @lostpointercapture=${this.#onViewportPointerEnd}>
        <div class="canvas">
          ${this._board.lanes.map(
            (lane) => html`<umb-community-kanban-lane
              .lane=${lane}
              ?allow-drag=${this._board?.allowDrag ?? false}
              ?is-drop-target=${this._dropTarget?.value === lane.value}
              ?accepts-drop=${this._dropTarget?.acceptsDrops ?? false}
              ?show-child-items=${this._board?.showChildItems ?? false}></umb-community-kanban-lane>`,
          )}
        </div>
      </div>
      ${this.#renderActions()} ${this.#renderGhost()}
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
        padding: var(--uui-size-layout-1);
      }

      .viewport {
        /* The real height comes from JS; this is the floor before the first measurement and in a
           window too short to measure usefully. */
        min-height: 320px;
        overflow: auto;
        cursor: grab;
      }

      .viewport.panning {
        cursor: grabbing;
        user-select: none;
      }

      /* Content-height, so align-items: stretch sizes every lane to the TALLEST lane. A bounded flex
         container would stretch them to the visible height instead and clip the fullest lane. The width
         rules matter for the same reason in the other axis: lanes are flex: 0 0 auto, so without
         max-content the canvas box stays viewport-width while its lanes overflow it, and the pan
         gate — which tests against this element — would not cover the area the user sees. */
      .canvas {
        display: flex;
        align-items: stretch;
        gap: var(--uui-size-space-4);
        width: max-content;
        min-width: 100%;
        min-height: 100%;
        /* With min-height: 100% the padding must be inside the box, or it forces a scrollbar on a
           board that fits. */
        box-sizing: border-box;
        padding-bottom: var(--uui-size-space-3);
      }

      .canvas > * {
        cursor: auto;
      }

      /* Positioned from the top-left of the viewport and moved entirely by transform, so a drag costs no
         layout. Full opacity on purpose: the dimmed original left behind in the lane is what reads as
         "in flight", so dimming this too would leave nothing looking solid. */
      .ghost {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 10000;
        pointer-events: none;
        box-shadow: var(--uui-shadow-depth-3);
      }

      .message {
        padding: var(--uui-size-space-4);
        color: var(--uui-color-text-alt);
      }

      /* Matches core's umb-collection-selection-actions: the same surface, contrast colour and
         space-between layout, so a board action reads as the same kind of control as a bulk action. */
      .actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--uui-size-3);
        box-sizing: border-box;
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

export { UmbCommunityKanbanBoardElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-board': UmbCommunityKanbanBoardElement;
  }
}
