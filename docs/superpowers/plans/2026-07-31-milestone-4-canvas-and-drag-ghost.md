# Milestone 4 — Board canvas, equal-height lanes, drag ghost — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** give the board a bounded scroll viewport wrapping a content-height canvas, so every lane is the same height and a drop target is a whole column; make the dragged card follow the cursor; add edge auto-scroll and Escape-to-cancel; and finish the two-axis pan.

**Architecture:** `.lanes` splits into `.viewport` (bounded height set from JS, `overflow: auto`, the pan surface) wrapping `.canvas` (`display: flex; align-items: stretch`, content-height). Lanes then stretch to the tallest lane, so their rects — and their drop highlights — span the full canvas. A `position: fixed` ghost containing a real `<umb-community-kanban-card>` follows the pointer, driven by a single `requestAnimationFrame` loop that also re-runs the hit-test and applies edge auto-scroll each frame, since a scrolling canvas moves lane rects under a stationary pointer. All geometry arithmetic lives in pure, unit-tested functions; the elements are verified by `tsc --noEmit`, `npm run build` and hand-checks.

**Tech Stack:** TypeScript, Lit 3, Vite, Vitest (Node environment), Umbraco CMS 18.0.2 backoffice. Client-only — no C# changes.

**Spec:** [docs/superpowers/specs/2026-07-31-milestone-4-canvas-and-drag-ghost-design.md](../specs/2026-07-31-milestone-4-canvas-and-drag-ghost-design.md)

## Global Constraints

- Repo root for every path below: `/Users/gandalf/Source/Repos/Umbraco.Community.Kanban`. Client root: `src/Umbraco.Community.Kanban/Client`.
- **This milestone touches no C# and no server test.** All 278 server tests must still pass, untouched.
- **Private members on Lit elements use `#name`** (native private); `@state()` fields use a leading underscore (`_ghost`). Match the existing elements exactly.
- **Never import from `@umbraco-cms/backoffice/dist-cms/...`** — only public subpath exports.
- Client Vitest runs in a **Node environment with no custom-elements registry** (`vitest.config.ts`: `environment: 'node'`). Lit elements are NOT DOM-tested. Only pure model modules get unit tests; elements are verified by `tsc --noEmit` and `npm run build`. Do not add a browser test runner.
- `core/` imports nothing from `hosts/` or `workspace-views/`.
- Client test command: `cd src/Umbraco.Community.Kanban/Client && npm run test`
- Client type-check + build: `cd src/Umbraco.Community.Kanban/Client && npm run build`
- Numeric defaults, copied verbatim from the spec — declare each as a named module-level constant, never inline: bottom gutter **24px** (`--uui-size-layout-1`), minimum viewport height **320px**, edge auto-scroll threshold **60px**, edge auto-scroll max speed **20px per frame**, ghost rotation **2deg**, ghost shadow **`--uui-shadow-depth-3`**.
- **Out of scope, do not build:** card reordering / `sortOrder` (its own spec, next), touch drag, any change to `laneAtPoint`, the write path, `PUT /card/{key}/lane`, publishing, lane widths, colours, badges, or the truncation message.
- Every task ends with a commit. Run `npm run build && npm run test` before committing.

---

### Task 1: The canvas geometry functions

Pure arithmetic first, so the element work in Tasks 2–4 has something tested to lean on. Mirrors `pan.model.ts` exactly, including why it takes plain numbers rather than elements or events.

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/core/canvas.model.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/core/canvas.model.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `boardViewportHeight(input: { rectTop: number; innerHeight: number; gutter: number; min: number }): number`
  - `KanbanEdgeScroll { dx: number; dy: number }`
  - `edgeScrollDelta(input: { pointer: { x: number; y: number }; rect: { left: number; top: number; right: number; bottom: number }; threshold: number; maxSpeed: number }): KanbanEdgeScroll`

- [ ] **Step 1: Write the failing tests**

Create `src/Umbraco.Community.Kanban/Client/src/core/canvas.model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { boardViewportHeight, edgeScrollDelta } from './canvas.model.js';

describe('boardViewportHeight', () => {
  it('fills the window below the board’s top edge, less the bottom gutter', () => {
    expect(boardViewportHeight({ rectTop: 200, innerHeight: 1000, gutter: 24, min: 320 })).toBe(776);
  });

  it('clamps to the minimum when the board starts near the bottom of the window', () => {
    // 1000 - 900 - 24 = 76, which is uselessly short; the floor wins and the page scrolls instead.
    expect(boardViewportHeight({ rectTop: 900, innerHeight: 1000, gutter: 24, min: 320 })).toBe(320);
  });

  it('clamps to the minimum in a window shorter than the minimum', () => {
    expect(boardViewportHeight({ rectTop: 0, innerHeight: 200, gutter: 24, min: 320 })).toBe(320);
  });

  it('subtracts the gutter, so the board never overhangs the window', () => {
    const withGutter = boardViewportHeight({ rectTop: 100, innerHeight: 1000, gutter: 24, min: 320 });
    const without = boardViewportHeight({ rectTop: 100, innerHeight: 1000, gutter: 0, min: 320 });

    expect(without - withGutter).toBe(24);
  });
});

describe('edgeScrollDelta', () => {
  const rect = { left: 100, top: 100, right: 900, bottom: 700 };
  const at = (x: number, y: number) =>
    edgeScrollDelta({ pointer: { x, y }, rect, threshold: 60, maxSpeed: 20 });

  it('does not scroll from the middle of the viewport', () => {
    expect(at(500, 400)).toEqual({ dx: 0, dy: 0 });
  });

  it('scrolls left near the left edge, and only on that axis', () => {
    const delta = at(130, 400);

    expect(delta.dx).toBeLessThan(0);
    expect(delta.dy).toBe(0);
  });

  it('scrolls right near the right edge', () => {
    expect(at(870, 400).dx).toBeGreaterThan(0);
  });

  it('scrolls up near the top edge', () => {
    expect(at(500, 130).dy).toBeLessThan(0);
  });

  it('scrolls down near the bottom edge', () => {
    expect(at(500, 670).dy).toBeGreaterThan(0);
  });

  it('scrolls both axes at once in a corner', () => {
    const delta = at(120, 120);

    expect(delta.dx).toBeLessThan(0);
    expect(delta.dy).toBeLessThan(0);
  });

  it('ramps: closer to the edge scrolls faster', () => {
    // The ramp is what makes the speed controllable — a flat speed is either too slow to cross a
    // wide board or too fast to stop on a lane.
    expect(Math.abs(at(105, 400).dx)).toBeGreaterThan(Math.abs(at(155, 400).dx));
  });

  it('reaches exactly maxSpeed at the edge', () => {
    expect(at(100, 400).dx).toBe(-20);
  });

  it('never exceeds maxSpeed, even well outside the viewport', () => {
    // A drag can leave the viewport entirely; the ramp must clamp rather than accelerate forever.
    expect(at(-500, 400).dx).toBe(-20);
    expect(at(2000, 400).dx).toBe(20);
  });

  it('is zero exactly at the threshold', () => {
    expect(at(160, 400).dx).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/core/canvas.model.test.ts`
Expected: FAIL — cannot resolve `./canvas.model.js`.

- [ ] **Step 3: Write the module**

Create `src/Umbraco.Community.Kanban/Client/src/core/canvas.model.ts`:

```ts
/**
 * The pixel height the board's scroll viewport should take, so it ends at the bottom of the window.
 *
 * Measured in JS rather than expressed in CSS because no ancestor can supply it: the chain
 * `umb-collection-default` → `#router` → our host has no explicit height (`router-slot { height: 100% }`
 * resolves to `auto` against `#router`), and `#router` is sealed inside a shadow root, so there is no
 * reachable stylesheet to fix. Takes plain numbers so the arithmetic is testable without a DOM.
 */
export function boardViewportHeight(input: {
  rectTop: number;
  innerHeight: number;
  gutter: number;
  min: number;
}): number {
  return Math.max(input.min, input.innerHeight - input.rectTop - input.gutter);
}

/** Pixels to scroll the canvas this frame. Negative is left/up. */
export interface KanbanEdgeScroll {
  dx: number;
  dy: number;
}

/**
 * How far to scroll the canvas when a dragged card is held near a viewport edge, so a lane that is
 * off-screen when the drag starts is still reachable.
 *
 * The speed ramps linearly with proximity — `maxSpeed` at the edge, zero at `threshold` — because a flat
 * speed is either too slow to cross a wide board or too fast to stop on a lane. Beyond the edge the ramp
 * clamps at `maxSpeed` rather than accelerating: a drag can leave the viewport entirely.
 *
 * In a viewport narrower than twice the threshold both edges are in range at once; the leading edge wins,
 * which is arbitrary but stable, and such a viewport is below the minimum height anyway.
 */
export function edgeScrollDelta(input: {
  pointer: { x: number; y: number };
  rect: { left: number; top: number; right: number; bottom: number };
  threshold: number;
  maxSpeed: number;
}): KanbanEdgeScroll {
  return {
    dx: axisDelta(input.pointer.x, input.rect.left, input.rect.right, input.threshold, input.maxSpeed),
    dy: axisDelta(input.pointer.y, input.rect.top, input.rect.bottom, input.threshold, input.maxSpeed),
  };
}

function axisDelta(position: number, min: number, max: number, threshold: number, maxSpeed: number): number {
  const fromStart = position - min;
  const fromEnd = max - position;

  if (fromStart < threshold) return -ramp(fromStart, threshold, maxSpeed);
  if (fromEnd < threshold) return ramp(fromEnd, threshold, maxSpeed);

  return 0;
}

/** Zero at the threshold, `maxSpeed` at the edge and anywhere past it. */
function ramp(distance: number, threshold: number, maxSpeed: number): number {
  const proximity = Math.min(1, Math.max(0, (threshold - distance) / threshold));

  return maxSpeed * proximity;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/core/canvas.model.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Type-check, build and run every client test**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: build succeeds, all tests pass (210 existing + 14 new = 224).

- [ ] **Step 6: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core/canvas.model.ts src/Umbraco.Community.Kanban/Client/src/core/canvas.model.test.ts
git commit -m "feat: add the board canvas height and edge-scroll geometry"
```

---

### Task 2: The viewport/canvas split, equal-height lanes, sticky headers, two-axis pan

One task because they are one deliverable and cannot be landed apart: the pan listeners live on the element that scrolls, so moving the scroll container and moving the pan are the same change. Lane stretching and sticky headers are what make the new structure usable.

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-lane.element.ts`

**Interfaces:**
- Consumes: `boardViewportHeight` (Task 1); `panScrollOffset`, `shouldStartPan` (existing `pan.model.ts`, unchanged).
- Produces: a `.viewport` > `.canvas` DOM structure inside the board's shadow root, where `.viewport` is the scroll container and pan surface. Task 3 and Task 4 both query `.viewport` via `this.renderRoot.querySelector<HTMLDivElement>('.viewport')` and rely on its `getBoundingClientRect()` and its `scrollLeft`/`scrollTop`.

- [ ] **Step 1: Add the constants and the measured height**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`, add to the existing `./canvas.model.js` import list (create the import — it does not exist yet), directly after the `./board.model.js` import block:

```ts
import { boardViewportHeight } from './canvas.model.js';
```

Above the `type KanbanBoardStatus` declaration, add:

```ts
/** The host's own bottom padding (`--uui-size-layout-1`), so the viewport ends at the window's edge. */
const VIEWPORT_GUTTER = 24;

/** Below this a scrolling canvas is useless — roughly a lane header plus two cards. */
const VIEWPORT_MIN_HEIGHT = 320;
```

Beside the other `@state()` fields, after `_publishing`:

```ts
  /**
   * The viewport's height in pixels, measured from the window. Undefined until the first measurement,
   * when the CSS `min-height` is what holds the box open.
   */
  @state()
  private _viewportHeight?: number;
```

- [ ] **Step 2: Measure on first render, on update and on resize**

In the same file, after `#endPan()`, add:

```ts
  /**
   * Sets the viewport's height from the window. Called after every render because the publish toolbar
   * and the truncation message both change where the viewport starts, and a stale height would leave it
   * overhanging the window or short of it.
   */
  #measureViewport() {
    const viewport = this.renderRoot.querySelector<HTMLDivElement>('.viewport');

    if (!viewport) return;

    const height = boardViewportHeight({
      rectTop: viewport.getBoundingClientRect().top,
      innerHeight: window.innerHeight,
      gutter: VIEWPORT_GUTTER,
      min: VIEWPORT_MIN_HEIGHT,
    });

    // Only assign on a real change: `updated()` calls this, so assigning unconditionally would
    // schedule another update and loop forever. Sub-pixel jitter is not a real change.
    if (this._viewportHeight === undefined || Math.abs(this._viewportHeight - height) >= 1) {
      this._viewportHeight = height;
    }
  }

  #onWindowResize = () => this.#measureViewport();
```

Then add the two lifecycle hooks. Put them immediately after the existing `load()` method:

```ts
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
```

`updated` needs the `PropertyValues` type. Add it to the lit import on line 1 of the file:

```ts
import { classMap, css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import type { PropertyValues } from '@umbraco-cms/backoffice/external/lit';
```

- [ ] **Step 3: Give the pan a second axis**

In the same file, replace the `#pan` field declaration:

```ts
  /** The in-progress pan, or undefined between drags. Keyed by pointerId so a second pointer is ignored. */
  #pan?: {
    pointerId: number;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
  };
```

- [ ] **Step 4: Rename the pan handlers and gate on the canvas**

In the same file, replace the three pan handlers (`#onLanesPointerDown`, `#onLanesPointerMove`, `#onLanesPointerEnd`) with these. Note the new self-target rule and the second axis:

```ts
  /**
   * Starts a background pan. The background a user can actually press is `.canvas` — it fills at least
   * the viewport — so the gate accepts either it or the viewport itself, and nothing else: a press on a
   * lane or a card must never pan. Touch is excluded because `.viewport` already scrolls natively on a
   * swipe, with momentum, for free.
   */
  #onViewportPointerDown(event: PointerEvent) {
    if (this.#pan) return; // a pan is already in progress for another pointer

    const viewport = event.currentTarget as HTMLDivElement;
    const canvas = viewport.querySelector('.canvas');

    if (
      !shouldStartPan({
        isSelfTarget: event.target === viewport || event.target === canvas,
        pointerType: event.pointerType,
        button: event.button,
        isPrimary: event.isPrimary,
        offsetX: event.offsetX,
        offsetY: event.offsetY,
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
```

Also update `#endPan`'s doc comment, which names the old div — replace `.lanes` with `.viewport` in both places it appears there.

- [ ] **Step 5: Render the two divs**

In the same file's `#renderBoard()`, replace the whole `<div class=${classMap({ lanes: ... })}>…</div>` block with:

```ts
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
```

- [ ] **Step 6: Replace the board styles**

In the same file's `static override styles`, replace the four `.lanes*` rules (`.lanes`, `.lanes > *`, `.lanes.panning`) with:

```css
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

      /* Content-height, so `align-items: stretch` sizes every lane to the TALLEST lane. A bounded flex
         container would stretch them to the visible height instead and clip the fullest lane. The width
         rules matter for the same reason in the other axis: lanes are `flex: 0 0 auto`, so without
         `max-content` the canvas box stays viewport-width while its lanes overflow it, and the pan
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
```

- [ ] **Step 7: Stick the lane header and let the lane stretch**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-lane.element.ts`, in `static override styles`, add to the `.header` rule (keep every existing declaration):

```css
        /* Resolves against `.viewport` — the nearest scrolling ancestor — not against the lane, so the
           header pins while the canvas scrolls under it. Without this, scrolling a tall canvas leaves
           unlabelled columns and no way to tell what you are dropping into. */
        position: sticky;
        top: 0;
        z-index: 1;
```

The `.lane` rule needs no height declaration: stretching is the parent's job, and the existing
`min-width`/`max-width`/`flex: 0 0 auto` stay exactly as they are.

- [ ] **Step 8: Verify no `.lanes` reference survives**

Run: `cd src/Umbraco.Community.Kanban/Client && grep -rn "lanes" src/core/kanban-board.element.ts src/core/kanban-lane.element.ts`
Expected: only `this._board.lanes` / `this.lane` model access — no CSS class, no `#onLanes*` handler, no `.lanes` selector.

- [ ] **Step 9: Type-check, build and run every client test**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: build succeeds, 224 tests pass. `pan.model.ts` and its tests are untouched.

- [ ] **Step 10: Verify the canvas by hand**

Build into the test site, restart it, hard-reload the board (the bundle is cached), then check:

1. An empty lane is the same height as the fullest lane; the canvas is as tall as the fullest lane's content.
2. Scrolling the canvas down keeps every lane header visible at the top of the viewport.
3. The viewport's bottom edge sits at the bottom of the window. Resize the window — it follows.
4. Dragging the board background pans **both** axes; dragging a card does not pan; dragging a lane header does not pan.
5. A touch swipe still scrolls natively.
6. Dropping a card onto the empty area low down a lane now works — this is the fault that motivated the milestone.

- [ ] **Step 11: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts src/Umbraco.Community.Kanban/Client/src/core/kanban-lane.element.ts
git commit -m "feat: give the board a bounded viewport and a content-height canvas"
```

---

### Task 3: The drag ghost

A full card follows the pointer. Introduces the per-frame drag loop that Task 4 then extends — the loop exists from the start because `pointermove` fires faster than frames, and because Task 4's scrolling has to move lane rects on frames when no pointer event arrives at all.

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/drag.model.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/drag.model.test.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`

**Interfaces:**
- Consumes: `.viewport` (Task 2); `laneAtPoint` (existing, unchanged).
- Produces:
  - `ghostPosition(input: { pointer: { x: number; y: number }; grabOffset: { x: number; y: number } }): { left: number; top: number }`
  - `kanban-drag-start` detail grows to `{ key: string; lane: string; grabOffsetX: number; grabOffsetY: number; width: number }`
  - On the board: `#pointer`, `#startDragLoop()`, `#stopDragLoop()`, `#onDragFrame()`. Task 4 adds the scroll call inside `#onDragFrame`.

- [ ] **Step 1: Prove `position: fixed` resolves against the viewport in the real host**

The ghost is positioned with `position: fixed`, which resolves against the viewport **unless** an ancestor establishes a containing block (`transform`, `filter`, `backdrop-filter`, `contain`, `perspective`, `will-change`). Several backoffice layout components wrap the board and none has been checked. Do this before writing the positioning, not after.

With the board open in the backoffice, run this in the browser console:

```js
(() => {
  const find = (root, name) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.localName === name) return el;
      if (el.shadowRoot) {
        const hit = find(el.shadowRoot, name);
        if (hit) return hit;
      }
    }
    return null;
  };

  let el = find(document, 'umb-community-kanban-board');
  const offenders = [];

  while (el) {
    const s = getComputedStyle(el);
    if (
      s.transform !== 'none' ||
      s.filter !== 'none' ||
      s.backdropFilter !== 'none' ||
      s.perspective !== 'none' ||
      (s.contain !== 'none' && s.contain !== 'normal') ||
      s.willChange !== 'auto'
    ) {
      offenders.push({ element: el.localName, transform: s.transform, filter: s.filter, contain: s.contain, willChange: s.willChange });
    }
    el = el.parentElement ?? el.getRootNode()?.host ?? null;
  }

  console.table(offenders);
  return offenders.length ? 'CONTAINING BLOCK FOUND — use the fallback below' : 'fixed resolves against the viewport — proceed as written';
})();
```

If it reports **proceed**, build the rest of this task as written.

If it reports a containing block, use the fallback instead: render `.ghost` inside `.viewport` with `position: absolute`, and convert the pointer to viewport-relative coordinates before calling `ghostPosition` —
`{ x: pointer.x - viewportRect.left + viewport.scrollLeft, y: pointer.y - viewportRect.top + viewport.scrollTop }`.
`ghostPosition` itself, and its tests, are identical either way; only the caller and the CSS `position` change. Record which branch was taken in the commit message.

- [ ] **Step 2: Write the failing test for `ghostPosition`**

Append to `src/Umbraco.Community.Kanban/Client/src/core/drag.model.test.ts` — and add `ghostPosition` to the existing import at the top of that file:

```ts
describe('ghostPosition', () => {
  it('keeps the card under the point where it was grabbed', () => {
    // Grabbed 30px in and 12px down from the card's own top-left; the ghost's corner sits there still.
    expect(ghostPosition({ pointer: { x: 500, y: 400 }, grabOffset: { x: 30, y: 12 } })).toEqual({
      left: 470,
      top: 388,
    });
  });

  it('places the corner at the pointer when the card was grabbed by its corner', () => {
    expect(ghostPosition({ pointer: { x: 500, y: 400 }, grabOffset: { x: 0, y: 0 } })).toEqual({
      left: 500,
      top: 400,
    });
  });

  it('allows negative coordinates, so a drag above or left of the window still tracks', () => {
    expect(ghostPosition({ pointer: { x: 10, y: 5 }, grabOffset: { x: 40, y: 20 } })).toEqual({
      left: -30,
      top: -15,
    });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/core/drag.model.test.ts`
Expected: FAIL — `ghostPosition` is not exported from `./drag.model.js`.

- [ ] **Step 4: Add `ghostPosition`**

Append to `src/Umbraco.Community.Kanban/Client/src/core/drag.model.ts`:

```ts
/** Where the ghost's top-left corner goes. */
export interface KanbanGhostPosition {
  left: number;
  top: number;
}

/**
 * The ghost's corner, given the pointer and where within the card it was grabbed.
 *
 * Subtracting the grab offset is what stops the card jumping so its corner snaps to the cursor — it stays
 * held exactly where it was picked up. Negative results are legitimate: a drag can travel above or to the
 * left of the window.
 */
export function ghostPosition(input: {
  pointer: { x: number; y: number };
  grabOffset: { x: number; y: number };
}): KanbanGhostPosition {
  return {
    left: input.pointer.x - input.grabOffset.x,
    top: input.pointer.y - input.grabOffset.y,
  };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/core/drag.model.test.ts`
Expected: PASS, 24 tests in that file.

- [ ] **Step 6: Send the grab offset and width from the card**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts`, in `#onPointerDown`, replace the `setPointerCapture` line through the `#dispatch('kanban-drag-start', …)` line with:

```ts
    const element = event.currentTarget as HTMLElement;

    // Capturing on the card is what makes every subsequent event for this pointer arrive here regardless
    // of what is visually underneath — including over another lane, which is the whole point.
    element.setPointerCapture(event.pointerId);

    this.#drag = { pointerId: event.pointerId };
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
```

- [ ] **Step 7: Hold the grab offset and run a frame loop on the board**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`, add `ghostPosition` to the existing `./drag.model.js` import:

```ts
import {
  formatPublishSummary,
  ghostPosition,
  laneAtPoint,
  moveFailureMessage,
  type KanbanLaneHitTarget,
} from './drag.model.js';
```

Replace the `_drag` field with one carrying the ghost's inputs, and add the ghost's position beside it:

```ts
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
```

Beside `#pan`, add:

```ts
  /** The pointer's last known viewport position during a drag. Not `@state()` — the frame loop reads it. */
  #pointer?: { x: number; y: number };

  /** The live `requestAnimationFrame` handle for the drag loop, or undefined when it is not running. */
  #frame?: number;
```

Then replace the four drag handlers (`#onDragStart`, `#onDragMove`, `#onDragCancel`, and the head of `#onDragEnd`) with these. Only the marked lines of `#onDragEnd` change — everything from `if (!drag || !hit …` onward stays exactly as it is:

```ts
  #onDragStart(event: CustomEvent<{ key: string; lane: string; grabOffsetX: number; grabOffsetY: number; width: number }>) {
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

    this._ghost = ghostPosition({
      pointer,
      grabOffset: { x: this._drag.grabOffsetX, y: this._drag.grabOffsetY },
    });

    const hit = laneAtPoint(pointer.x, pointer.y, this.#laneTargets());

    this._dropTarget = hit ? { value: hit.value, acceptsDrops: hit.acceptsDrops } : undefined;
  }
```

And in `#onDragEnd`, replace its first six lines (down to and including the two `this._dropTarget = undefined;` / `this._drag = undefined;` assignments) with:

```ts
    const drag = this._drag;
    const hit = drag ? laneAtPoint(event.detail.clientX, event.detail.clientY, this.#laneTargets()) : undefined;

    // Clear before awaiting anything, so neither the highlight nor the ghost outlives the gesture.
    this.#stopDragLoop();
    this._drag = undefined;
    this._dropTarget = undefined;
    this._ghost = undefined;
    this.#pointer = undefined;
```

`#onDragEnd` deliberately hit-tests the release event's own coordinates rather than `#pointer`: the release position is authoritative, and a frame may not have run since the last move.

- [ ] **Step 8: Render the ghost**

In the same file, add the render helper after `#renderMessage`:

```ts
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
```

The rotation rides in the same `transform` as the translation deliberately — a separate `rotate` property would be a second thing to keep in step.

Then render it, as the last thing inside `#renderBoard()`'s template, immediately after the closing `</div>` of `.viewport`:

```ts
      ${this.#renderGhost()}
```

`kanban-card.element.js` is already imported transitively through `./kanban-lane.element.js`, so no new import is needed.

- [ ] **Step 9: Style the ghost**

Add to the board's `static override styles`, after the `.canvas > *` rule:

```css
      /* Positioned from the top-left of the viewport and moved entirely by `transform`, so a drag costs
         no layout. Full opacity on purpose: the dimmed original left behind in the lane is what reads as
         "in flight", so dimming this too would leave nothing looking solid. */
      .ghost {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 10000;
        pointer-events: none;
        box-shadow: var(--uui-shadow-depth-3);
      }
```

If Step 1 reported a containing block, this rule uses `position: absolute` instead, and the div moves inside `.viewport`.

- [ ] **Step 10: Type-check, build and run every client test**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: build succeeds, 227 tests pass (224 + 3 new).

- [ ] **Step 11: Verify the ghost by hand**

Build into the test site, restart, hard-reload, then check:

1. Dragging a card shows a full card — icon, name, properties, badge — following the cursor.
2. It stays held where you grabbed it: grab a card by its bottom-right and the corner does not jump to the cursor.
3. The original stays in its lane, dimmed and dashed; no lane reflows on pickup.
4. The ghost is the same width as the card it came from, sits above every lane, and never blocks the drop-target highlight underneath it.
5. Releasing removes the ghost immediately, with no flicker of it at a stale position.
6. Drop still writes, and a failed drop still reverts and toasts — the milestone-3 behaviour is unchanged.

- [ ] **Step 12: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core
git commit -m "feat: the dragged card follows the cursor as a full-fidelity ghost"
```

---

### Task 4: Edge auto-scroll while dragging

Small, and separable: the loop and the geometry already exist, so this is the two lines that join them plus its own verification. Without it, a drop target must already be on screen when the drag starts — on an eight-lane board that is a real limit.

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`

**Interfaces:**
- Consumes: `edgeScrollDelta` (Task 1); `#onDragFrame`, `.viewport` (Tasks 2–3).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add the constants**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`, extend the `./canvas.model.js` import:

```ts
import { boardViewportHeight, edgeScrollDelta } from './canvas.model.js';
```

and add beside `VIEWPORT_MIN_HEIGHT`:

```ts
/** How close to a viewport edge a dragged card must be held before the canvas starts scrolling. */
const EDGE_SCROLL_THRESHOLD = 60;

/** Peak auto-scroll speed, in pixels per frame — roughly four lane widths a second at 60fps. */
const EDGE_SCROLL_MAX_SPEED = 20;
```

- [ ] **Step 2: Scroll the canvas each frame**

In the same file's `#onDragFrame`, insert the scroll between the guard and the ghost update, so the ghost and the hit-test both see the post-scroll geometry:

```ts
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
```

- [ ] **Step 3: Type-check, build and run every client test**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: build succeeds, 227 tests pass.

- [ ] **Step 4: Verify auto-scroll by hand**

Build into the test site, restart, hard-reload, then check:

1. On a board wider than the window, hold a dragged card near the right edge: the canvas scrolls right, and keeps scrolling while you hold still.
2. Nearer the edge scrolls faster; at roughly 60px in, scrolling stops.
3. While the canvas scrolls under a still pointer, the drop-target highlight updates as lanes pass beneath it — this is the per-frame hit-test doing its job.
4. The same works vertically on a lane taller than the viewport, and diagonally in a corner.
5. Releasing mid-scroll drops into the lane actually under the pointer, and scrolling stops immediately.
6. Scrolling stops at each end rather than running away.

- [ ] **Step 5: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts
git commit -m "feat: auto-scroll the canvas when a dragged card nears an edge"
```

---

### Task 5: Escape cancels a drag

The card owns the gesture and the pointer capture, so the card owns Escape. It reuses the existing `kanban-drag-cancel` event, so the board learns nothing new.

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts`

**Interfaces:**
- Consumes: the existing `kanban-drag-cancel` event contract.
- Produces: nothing later tasks depend on. `#drag` grows a `target` so the capture can be released without an event to read it from.

- [ ] **Step 1: Carry the captured element on the drag**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts`, replace the `#drag` field:

```ts
  /**
   * The live drag, or undefined between gestures. Keyed by pointerId so a second pointer is ignored, and
   * holding the captured element so Escape — which arrives as a keyboard event with no pointer target of
   * its own — can still release the capture.
   */
  #drag?: { pointerId: number; target: HTMLElement };
```

and set it accordingly in `#onPointerDown`, replacing the existing assignment:

```ts
    this.#drag = { pointerId: event.pointerId, target: element };
```

- [ ] **Step 2: Release from the stored target instead of the event**

In the same file, replace `#releaseCapture` with a form that needs no event, and update both its callers
(`#onPointerUp` and `#onPointerCancel`):

```ts
  /** Releases the capture and clears the gesture. Every exit path ends here. */
  #endDrag() {
    if (this.#drag?.target.hasPointerCapture(this.#drag.pointerId)) {
      this.#drag.target.releasePointerCapture(this.#drag.pointerId);
    }

    this.#drag = undefined;
    this._dragging = false;

    window.removeEventListener('keydown', this.#onKeyDown);
  }
```

In `#onPointerUp`, replace the three lines `this.#releaseCapture(event); this.#drag = undefined; this._dragging = false;` with:

```ts
    this.#endDrag();
```

In `#onPointerCancel`, replace the same three lines with:

```ts
    this.#endDrag();
```

- [ ] **Step 3: Listen for Escape while a drag is live**

In the same file, add the handler after `#onPointerCancel`:

```ts
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
```

Register it in `#onPointerDown`, immediately after the `this.#drag = …` assignment:

```ts
    window.addEventListener('keydown', this.#onKeyDown);
```

`#endDrag` removes it on every exit path, so there is nothing to unregister anywhere else. Add the same removal to a disconnect hook, for a card removed from the DOM mid-drag:

```ts
  override disconnectedCallback() {
    super.disconnectedCallback();

    window.removeEventListener('keydown', this.#onKeyDown);
  }
```

- [ ] **Step 4: Type-check, build and run every client test**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: build succeeds, 227 tests pass.

- [ ] **Step 5: Verify Escape by hand**

Build into the test site, restart, hard-reload, then check:

1. Start a drag, move over another lane, press Escape: the ghost disappears, the highlight clears, the card stays in its original lane, no toast appears, and the Network tab shows no `PUT /card/{key}/lane`.
2. Releasing the mouse after that Escape does nothing — no late drop, no move.
3. That release does not open the card's workspace modal either.
4. Escape with no drag in progress does nothing unusual on the board.
5. A normal drag and drop still works after an Escaped one — no stuck state, and the next card still shows the grab cursor.

- [ ] **Step 6: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts
git commit -m "feat: Escape abandons a card drag"
```

---

### Task 6: Record the milestone in the docs

The enhancements backlog is what a cold reader checks to know what exists. The vertical-pan backlog item is now genuinely closed, and it should say so where it was left open.

**Files:**
- Modify: `docs/ENHANCEMENTS.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Add the milestone entry**

In `docs/ENHANCEMENTS.md`, insert immediately after the `## Done: drag write-back, pending state, publish-all (milestone 3)` section and before `## 7. Board configuration picker`:

```markdown
---

## Done: board canvas, equal-height lanes, drag ghost (milestone 4)

**Built 2026-07-31**, from
[its design](superpowers/specs/2026-07-31-milestone-4-canvas-and-drag-ghost-design.md). The board now owns
a bounded `.viewport` wrapping a content-height `.canvas`, so every lane is as tall as the fullest one and
a drop target is a whole column instead of the 82px stub an empty lane used to report. The dragged card
follows the cursor as a full-fidelity ghost, holding a canvas edge auto-scrolls, and Escape abandons a
drag.

What this fixed, and what it cost:

- **The real milestone-3 bug was geometry, not logic.** Hand-verification found an empty lane reporting a
  rect of 82px against a full lane's 8032px. `laneAtPoint` was correct all along and is unchanged; the
  rects it was given were the problem.
- **Two elements, not one.** `align-items: stretch` on a *bounded* container stretches items to the
  visible height and clips the fullest lane. Equal heights measured against the tallest lane need the
  flex container to be content-height, nested inside the bounded scroller — so `.viewport` and `.canvas`
  cannot be the same element.
- **The drop target is computed per frame, not per pointer event.** Auto-scroll moves lane rects while the
  pointer holds still, so a move-driven hit-test would go stale mid-gesture.
```

- [ ] **Step 2: Close the vertical-pan backlog item**

In the same file, in the `## 9. Grab the board to pan it sideways` section, replace the whole paragraph beginning `**Backlog:** a real fix needs the board to own its own vertical scrolling` with:

```markdown
**Closed by milestone 4.** The fix was the one this backlog note predicted: the board owns its own
vertical scrolling instead of borrowing an ancestor's. `.viewport` has `overflow: auto` and an explicit
pixel height measured from the window (`window.innerHeight - rectTop - gutter`, recomputed on resize),
because no ancestor CSS can supply one — `#router` has no height of its own and is shadow-sealed. Pan now
drives `scrollTop` alongside `scrollLeft`; `panScrollOffset` needed no change, having been written
axis-agnostic for exactly this.
```

- [ ] **Step 3: Verify the whole suite one last time**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj && cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: 278 server tests pass (untouched by this milestone), the client builds and type-checks clean, 227 client tests pass.

- [ ] **Step 4: Commit**

```bash
git add docs/ENHANCEMENTS.md
git commit -m "docs: record milestone 4 and close the vertical-pan backlog item"
```
