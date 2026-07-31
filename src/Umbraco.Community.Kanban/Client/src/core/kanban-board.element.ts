import { classMap, css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import type { PropertyValues } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_NOTIFICATION_CONTEXT } from '@umbraco-cms/backoffice/notification';
import { UmbDocumentPublishingRepository } from '@umbraco-cms/backoffice/document';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import { UmbVariantId } from '@umbraco-cms/backoffice/variant';
import {
  applyCardState,
  invertMove,
  isMoveUndoable,
  laneOfCard,
  mergeLanePage,
  moveCard,
  nextStateAfterSave,
  pendingCards,
  setCardSaving,
  toBoardState,
  type KanbanBoardState,
  type KanbanCardMove,
} from './board.model.js';
import {
  formatPublishSummary,
  ghostPosition,
  laneAtPoint,
  moveFailureMessage,
  type KanbanLaneHitTarget,
} from './drag.model.js';
import { boardAvailableBottom, boardViewportHeight, edgeScrollDelta } from './canvas.model.js';
import { KANBAN_BOARD_ACTIONS_CONTEXT, type UmbKanbanBoardActionsContext } from './board-actions.context.js';
import { applyCardResult } from './realtime.model.js';
import { KanbanRealtimeController } from './kanban-realtime.controller.js';
import './kanban-lane.element.js';
import type { KanbanBoardQuery, KanbanCardOutcome, KanbanDataSource } from '../data/kanban-data-source.js';
import { isPannablePath, panScrollOffset, shouldStartPan } from './pan.model.js';
import { isZoomGesture, KANBAN_ZOOM_DEFAULT, nextZoom, wheelDeltaPixels, zoomScrollOffset } from './zoom.model.js';

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

  /**
   * Pixels to keep free below the board's viewport, inside its container. A host whose action bar
   * lives in the same container (the workspace tab) sets this to the bar's height, so the viewport —
   * and its horizontal scrollbar — end above the bar instead of underneath it. Hosts whose bar lives
   * outside the measured container (the collection layout's footer slot) leave it at zero.
   */
  @property({ type: Number, attribute: 'bottom-inset' })
  bottomInset = 0;

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
   * The moves this board has made, oldest first — the undo stack. Only what this session did: it is emptied
   * on a reload, because a move can only be undone against the board state it was made on.
   */
  @state()
  private _moves: KanbanCardMove[] = [];

  /** True while an undo's write is in flight, so it cannot be pressed twice. */
  @state()
  private _undoing = false;

  /**
   * The viewport's height in pixels, measured from the window. Undefined until the first measurement,
   * when the CSS `min-height` is what holds the box open.
   */
  @state()
  private _viewportHeight?: number;

  /**
   * The canvas' zoom, driven by ctrl (or pinch) + wheel. Not persisted, unlike the calendar's view
   * toggle: a zoom is a look at *this* board now, and coming back tomorrow to a board someone left at
   * half scale reads as a rendering fault rather than as a remembered preference.
   */
  @state()
  private _zoom = KANBAN_ZOOM_DEFAULT;

  /**
   * Cards changed by a colleague in the last moment — drives the highlight pulse. Reassigned, never
   * mutated, because Lit change-detects @state by reference.
   */
  @state()
  private _recentlyChanged: ReadonlySet<string> = new Set();

  /** The pending highlight-clear timers, so a card changed twice re-pulses instead of half-clearing. */
  #highlightTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Watches the boxes `#measureViewport` measures against — this element and every ancestor above it —
   * so the height follows the layout settling rather than only this element re-rendering.
   *
   * Why it is needed: on a hard reload the workspace chrome around the board resolves *after* the
   * board's last render. At that moment no ancestor qualifies as a container yet (no definite height,
   * or a zero client height), `boardAvailableBottom` falls back to the window, and the board is sized
   * taller than the region it sits in — pushing its own bottom edge, and with it its horizontal
   * scrollbar, below the visible area. Nothing re-measured, because nothing re-rendered and the window
   * never resized, so the board stayed unscrollable until the user resized something by hand.
   */
  #resizeObserver?: ResizeObserver;

  /** The boxes currently observed, so a re-sync that would change nothing does nothing. */
  #observedBoxes: Element[] = [];

  /** Coalesces a burst of observer callbacks into one measurement per frame. */
  #measureFrame?: number;

  /**
   * The server-event subscription. Lives on the board rather than a host so every host — collection
   * view today, workspace view and injected later — gets sync without wiring of its own.
   */
  #realtime = new KanbanRealtimeController(this, {
    onCardOutcome: (key, outcome) => this.#onRealtimeOutcome(key, outcome),
    onResync: () => this.load(),
  });

  /** The pointer's last known viewport position during a drag. Not `@state()` — the frame loop reads it. */
  #pointer?: { x: number; y: number };

  /** The live `requestAnimationFrame` handle for the drag loop, or undefined when it is not running. */
  #frame?: number;

  /**
   * The bridge to the action bar, which the collection layout renders into the footer slot. Undefined when
   * the board is hosted somewhere that provides no such context — the board still works, it just has no bar.
   */
  #actions?: UmbKanbanBoardActionsContext;

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

  constructor() {
    super();

    // The layout provides this, so a board hosted anywhere else simply has no action bar.
    this.consumeContext(KANBAN_BOARD_ACTIONS_CONTEXT, (context) => {
      this.#actions = context ?? undefined;

      this.#actions?.setHandlers({
        publish: () => this.#onPublishPending(),
        undo: () => this.#onUndo(),
      });

      this.#publishActionState();
    });
  }

  /** Reloads the whole board. Hosts call this when their own data changes. */
  async load() {
    if (!this.parentId || !this.datasource) return;

    // Every load re-supplies the realtime coordinates, so parent, culture and configuration changes
    // are picked up without a lifecycle of their own.
    this.#realtime.configure({
      parentId: this.parentId,
      configId: this.configId,
      culture: this.culture,
      datasource: this.datasource,
    });

    // A reload swaps out `.viewport` for a loader, not a re-render in place — any in-progress pan or card
    // drag would otherwise be stranded on the discarded div (see #endPan for why that's unsafe).
    this.#endPan();
    this.#onDragCancel();

    // A move can only be undone against the board it was made on, and this replaces that board wholesale.
    this._moves = [];

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

    // On this element rather than `.viewport`, because a reload replaces the viewport with a loader and
    // would take the listener with it. Explicitly non-passive: the whole point is to preventDefault, and
    // a passive listener cannot — the browser would zoom the entire backoffice instead.
    this.addEventListener('wheel', this.#onWheel, { passive: false });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();

    window.removeEventListener('resize', this.#onWindowResize);
    this.removeEventListener('wheel', this.#onWheel);

    this.#resizeObserver?.disconnect();
    this.#observedBoxes = [];

    if (this.#measureFrame !== undefined) {
      cancelAnimationFrame(this.#measureFrame);
      this.#measureFrame = undefined;
    }

    // The bar outlives this element — it belongs to the layout — so it has to be told the board is gone,
    // or its buttons would sit there acting on nothing.
    this.#actions?.clear();

    for (const timer of this.#highlightTimers.values()) clearTimeout(timer);
    this.#highlightTimers.clear();
  }

  /** One reconciliation answer. The reducer decides everything; this applies it and pulses the card. */
  #onRealtimeOutcome(key: string, outcome: KanbanCardOutcome): void {
    if (!this._board) return;

    const result = applyCardResult(this._board, key, outcome);

    if (!result.changed) return;

    this._board = result.state;
    this.#markChanged(key);
  }

  /** Flags a card as just-changed for long enough for its pulse to read, then clears it. */
  #markChanged(key: string): void {
    const existing = this.#highlightTimers.get(key);

    if (existing !== undefined) clearTimeout(existing);

    this._recentlyChanged = new Set([...this._recentlyChanged, key]);

    this.#highlightTimers.set(
      key,
      setTimeout(() => {
        this.#highlightTimers.delete(key);
        const next = new Set(this._recentlyChanged);
        next.delete(key);
        this._recentlyChanged = next;
      }, 2000),
    );
  }

  override updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties);

    this.#measureViewport();
    this.#publishActionState();

    // After measuring, so the observer's own initial callback is the second look rather than the first.
    this.#syncResizeObserver();

    // Again after the browser has laid out. The action bar lives in the layout's footer, so the board
    // appearing or clearing pending changes resizes the container we measure against — and that reflow
    // happens after this update, not during it. The measurement is idempotent and only assigns on a real
    // change, so this settles in one extra frame rather than looping.
    requestAnimationFrame(() => this.#measureViewport());
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

    const rectTop = viewport.getBoundingClientRect().top;

    const height = boardViewportHeight({
      rectTop,
      availableBottom: boardAvailableBottom({
        windowHeight: window.innerHeight,
        rectTop,
        ancestors: this.#ancestorBoxes(),
      }),
      // This element has no padding of its own and the container's padding is already excluded by
      // measuring its content box — so the only thing ever reserved is what the host asks for: the
      // height of an action bar sharing the container, zero everywhere else.
      gutter: this.bottomInset,
      min: VIEWPORT_MIN_HEIGHT,
    });

    // Only assign on a real change: `updated()` calls this, so assigning unconditionally would
    // schedule another update and loop forever. Sub-pixel jitter is not a real change.
    if (this._viewportHeight === undefined || Math.abs(this._viewportHeight - height) >= 1) {
      this._viewportHeight = height;
    }
  }

  /**
   * (Re)points the resize observer at this element and the ancestors the measurement reads. Called after
   * every render because the chain can change — a host re-parenting the board, a wrapper appearing — and
   * skipped when the chain is the same one already observed, which is the common case.
   *
   * Observing is also how the board gets a measurement *after* first layout for free: a ResizeObserver
   * delivers an initial callback for every element it starts observing.
   */
  #syncResizeObserver() {
    const boxes: Element[] = [this, ...this.#ancestorChain()];
    const unchanged =
      boxes.length === this.#observedBoxes.length &&
      boxes.every((box, index) => box === this.#observedBoxes[index]);

    if (unchanged) return;

    const observer = (this.#resizeObserver ??= new ResizeObserver(() => this.#scheduleMeasure()));

    observer.disconnect();
    for (const box of boxes) observer.observe(box);
    this.#observedBoxes = boxes;
  }

  /**
   * One measurement per frame, however many boxes reported a change.
   *
   * This cannot feed itself: the board's own height change resizes this element and its content-height
   * wrappers, but those are exactly what `boardAvailableBottom` filters out (they neither clip nor have a
   * height of their own), and `#measureViewport` assigns only on a change of a pixel or more.
   */
  #scheduleMeasure() {
    if (this.#measureFrame !== undefined) return;

    this.#measureFrame = requestAnimationFrame(() => {
      this.#measureFrame = undefined;
      this.#measureViewport();
    });
  }

  /**
   * Every ancestor above this element, out through shadow boundaries, nearest first. Read-only geometry on
   * elements we climb past — it never looks *into* another component's shadow content, which is the mistake
   * the reverted vertical pan made.
   */
  #ancestorChain(): Element[] {
    const chain: Element[] = [];

    // Starts at the parent: this element's own box is the thing being sized, so it cannot bound itself.
    let element = this.#parentOf(this);

    while (element) {
      chain.push(element);
      element = this.#parentOf(element);
    }

    return chain;
  }

  /**
   * The ancestors as bottom edge plus whether each has a real box.
   *
   * A boxless wrapper is recognised by a computed height that is not a pixel value: an element with a
   * rendered box always resolves to pixels, while the layout's `router-slot` wrappers report `100%` and a
   * zero `clientHeight`.
   */
  #ancestorBoxes(): { bottom: number; definiteHeight: boolean; clips: boolean }[] {
    const boxes: { bottom: number; definiteHeight: boolean; clips: boolean }[] = [];

    for (const element of this.#ancestorChain()) {
      const style = getComputedStyle(element);

      boxes.push({
        // The *content* box: a container's padding and border are not space its children may occupy, and
        // measuring to the border box is what let the board overhang by its container's bottom padding.
        bottom:
          element.getBoundingClientRect().bottom -
          (parseFloat(style.paddingBottom) || 0) -
          (parseFloat(style.borderBottomWidth) || 0),
        definiteHeight: style.height.endsWith('px') && element.clientHeight > 0,
        // Only an element that clips can bound the board — a content-height display:block wrapper (the
        // workspace-view host, say) resolves its computed height to pixels too, and believing it fed the
        // board's own height back into this measurement.
        clips: style.overflowY !== 'visible',
      });
    }

    return boxes;
  }

  /**
   * The next element up the **flattened** tree — what actually lays the board out.
   *
   * `assignedSlot` comes first, and is the whole point: our router-slot is slotted into
   * `umb-body-layout`, so the box that clips the board is a div inside that component's shadow root and is
   * not on the `parentElement`/host chain at all. Following only the logical tree measured the wrong box
   * and left the board 24px too tall.
   */
  #parentOf(element: Element): Element | null {
    if (element.assignedSlot) return element.assignedSlot;

    if (element.parentElement) return element.parentElement;

    const root = element.getRootNode();

    return root instanceof ShadowRoot ? root.host : null;
  }

  #onWindowResize = () => this.#measureViewport();

  /**
   * Zooms the canvas around the pointer on ctrl + wheel — or a trackpad pinch, which arrives as the same
   * event. A plain wheel is left alone so ordinary scrolling still works.
   *
   * The new scroll offsets are computed from the *old* scale and applied after the re-render, in that
   * order for a reason: computed before, because the pointer's canvas coordinate can only be recovered
   * while the old scale is still in effect; applied after, because until the browser has laid the canvas
   * out at the new scale the scroll extent is still the old one and the assignment would be clamped.
   */
  #onWheel = (event: WheelEvent) => {
    if (!isZoomGesture(event)) return;

    const viewport = this.renderRoot.querySelector<HTMLDivElement>('.viewport');

    if (!viewport) return;

    // Before the early return on an unchanged scale: at either end of the range the gesture is still a
    // zoom, and letting it through would zoom the whole backoffice instead of doing nothing.
    event.preventDefault();

    const from = this._zoom;
    const to = nextZoom(from, wheelDeltaPixels(event.deltaY, event.deltaMode));

    if (to === from) return;

    const rect = viewport.getBoundingClientRect();
    const left = zoomScrollOffset({
      scroll: viewport.scrollLeft,
      pointerOffset: event.clientX - rect.left,
      from,
      to,
    });
    const top = zoomScrollOffset({
      scroll: viewport.scrollTop,
      pointerOffset: event.clientY - rect.top,
      from,
      to,
    });

    this._zoom = to;

    void this.updateComplete.then(() => {
      viewport.scrollLeft = left;
      viewport.scrollTop = top;
    });
  };

  #onDragStart(
    event: CustomEvent<{ key: string; lane: string; grabOffsetX: number; grabOffsetY: number; width: number }>,
  ) {
    // A pan and a card drag cannot overlap: the pan only starts on the canvas background, never a card.
    this._drag = { ...event.detail };
    this._dropTarget = undefined;
    this.#pointer = undefined;
    // Server events queue for the gesture's duration — the board must never reorganise under the pointer.
    this.#realtime.pause();
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
    this.#realtime.resume();
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

    // Queued events flush before the write below is even sent — our own echo is what the reducer's
    // saving guard exists for, so an early resume is safe and a colleague's change lands sooner.
    this.#realtime.resume();

    if (!drag || !hit || !hit.acceptsDrops || !this._board || !this.datasource) return;
    if (hit.value.toLowerCase() === drag.lane.toLowerCase()) return;

    await this.#applyMove({ key: drag.key, from: drag.lane, to: hit.value }, { remember: true });
  }

  /**
   * Moves a card and writes the new lane, optimistically: the card relocates, its badge flips and it dims
   * before the request is sent, and snaps back with a notification if the write fails.
   *
   * Shared by a drop and an undo so the two cannot drift — an undo that behaves differently from the move
   * it reverses is worse than no undo. `remember` is what keeps them distinguishable: a drop is recorded on
   * the undo stack, an undo is not, or undoing would push its own inverse and loop forever.
   */
  async #applyMove(move: KanbanCardMove, options: { remember: boolean }) {
    if (!this._board || !this.datasource) return;

    const card = this.#findCard(move.key);

    if (!card) return;

    let next = moveCard(this._board, move.key, move.from, move.to);
    next = applyCardState(next, move.key, nextStateAfterSave(card.state));
    this._board = setCardSaving(next, move.key, true);

    const token = this.#loadToken;

    const outcome = await this.datasource.setLane({
      cardKey: move.key,
      laneValue: move.to,
      culture: this.culture,
    });

    // A full reload started meanwhile and owns `_board` now; its state came from the server, so it is
    // already correct whether the write landed or not.
    if (token !== this.#loadToken || !this._board) return;

    if (outcome.kind === 'success') {
      // What the server actually persisted, in place of the optimistic guess.
      this._board = setCardSaving(applyCardState(this._board, move.key, outcome.state), move.key, false);

      if (options.remember) {
        this._moves = [...this._moves, move];
      }

      return;
    }

    // The same function with the lanes swapped: the card goes back exactly where it started.
    let reverted = moveCard(this._board, move.key, move.to, move.from);
    reverted = applyCardState(reverted, move.key, card.state);
    this._board = setCardSaving(reverted, move.key, false);

    const notifications = await this.getContext(UMB_NOTIFICATION_CONTEXT);

    notifications?.peek('danger', {
      data: { message: moveFailureMessage(card.name, outcome.status) },
    });
  }

  /**
   * Undoes the most recent move this board made, and can be pressed repeatedly to walk back through them.
   *
   * Only moves made here are undoable: the stack is what this session did, so it is emptied on a reload and
   * never contains anything another editor did. A move whose card has since moved on is dropped with a
   * warning rather than written — see `isMoveUndoable`.
   *
   * Note it restores the lane, not the publication state: the card stays pending, because a save happened
   * either way and only Publish clears that.
   */
  async #onUndo() {
    if (!this._board || this._undoing || this._moves.length === 0) return;

    const move = this._moves[this._moves.length - 1];

    this._moves = this._moves.slice(0, -1);

    const card = this.#findCard(move.key);

    if (!card || !isMoveUndoable(move, laneOfCard(this._board, move.key))) {
      const notifications = await this.getContext(UMB_NOTIFICATION_CONTEXT);

      notifications?.peek('warning', {
        data: { message: `Couldn’t undo — ‘${card?.name ?? 'that card'}’ has moved on since.` },
      });

      return;
    }

    this._undoing = true;

    await this.#applyMove(invertMove(move), { remember: false });

    this._undoing = false;
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
   * Pushes what the action bar should show up to the collection layout, which renders it into the footer
   * slot. Called after every render because every input to it — the cards, the undo stack, whether a write
   * is in flight — changes through a render.
   */
  #publishActionState() {
    if (!this.#actions) return;

    this.#actions.setState({
      pending: this._board ? pendingCards(this._board).length : 0,
      canUndo: this._moves.length > 0,
      busy: this._publishing || this._undoing,
    });
  }

  /**
   * The dragged card, following the pointer. A real card element rather than a bespoke chip, so it cannot
   * drift from how cards actually look; `allow-drag` is left off (defaulting false) so the clone cannot
   * start a gesture of its own, and `pointer-events: none` keeps it inert under the cursor.
   *
   * The ghost sits outside the zoomed canvas — it is `position: fixed` — so the zoom is re-applied to an
   * inner box of its own, or picking up a card on a zoomed-out board would produce a full-size ghost
   * springing out of a small card. The width divides by the zoom for the same reason: `_drag.width` is the
   * card's on-screen width, and inside a zoomed box a length is multiplied by that zoom again.
   */
  #renderGhost() {
    if (!this._drag || !this._ghost) return nothing;

    const card = this.#findCard(this._drag.key);

    if (!card) return nothing;

    return html`<div
      class="ghost"
      aria-hidden="true"
      style=${`transform: translate3d(${this._ghost.left}px, ${this._ghost.top}px, 0) rotate(2deg)`}>
      <div class="ghost-scale" style=${`zoom: ${this._zoom}; width: ${this._drag.width / this._zoom}px`}>
        <umb-community-kanban-card
          .card=${card}
          ?show-child-items=${this._board?.showChildItems ?? false}></umb-community-kanban-card>
      </div>
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
        <div class="canvas" style=${`--kanban-zoom: ${this._zoom}`}>
          ${this._board.lanes.map(
            (lane) => html`<umb-community-kanban-lane
              .lane=${lane}
              .highlightKeys=${this._recentlyChanged}
              ?allow-drag=${this._board?.allowDrag ?? false}
              ?is-drop-target=${this._dropTarget?.value === lane.value}
              ?accepts-drop=${this._dropTarget?.acceptsDrops ?? false}
              ?show-child-items=${this._board?.showChildItems ?? false}></umb-community-kanban-lane>`,
          )}
        </div>
      </div>
      ${this.#renderGhost()}
    `;
  }

  static override styles = [
    css`
      /* No padding of its own: the layout's own #main already pads the region this element sits in, and
         adding a second gutter both doubled the inset the list view has and pushed the board past the
         bottom of that padded box. */
      :host {
        display: block;
      }

      .viewport {
        /* The real height comes from JS; this is the floor before the first measurement and in a
           window too short to measure usefully. */
        min-height: 320px;
        overflow: auto;
        cursor: grab;
        /* Hosts can inset the lanes from the viewport's edges without moving its scrollbars: the
           padding sits inside the scroll container, so the scrollbars stay flush with the board.
           border-box because JS sets this element's height explicitly. */
        box-sizing: border-box;
        padding: var(--kanban-viewport-padding, 0);
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
        /* Ctrl + wheel (and trackpad pinch) sets this; the element publishes the factor as a custom
           property so the percentage minimums below can divide it back out. zoom rather than a scale
           transform because it scales layout: the scroll extent grows with it and every rect the drag
           hit-test and the edge auto-scroll read stays truthful. */
        zoom: var(--kanban-zoom, 1);
        display: flex;
        align-items: stretch;
        gap: var(--uui-size-space-4);
        width: max-content;
        /* The percentages resolve against the *unzoomed* viewport and are then multiplied by the zoom,
           which would leave the canvas short of the viewport when zoomed out — shrinking the background
           the pan gesture is grabbed from — and forcing scrollbars onto a board that fits when zoomed in.
           Dividing first cancels that out, so "fill the viewport" keeps meaning the viewport. */
        min-width: calc(100% / var(--kanban-zoom, 1));
        min-height: calc(100% / var(--kanban-zoom, 1));
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

    `,
  ];
}

export { UmbCommunityKanbanBoardElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-board': UmbCommunityKanbanBoardElement;
  }
}
