# Grab the Board to Pan It Sideways Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an editor click-and-drag the Kanban board's own background to scroll it sideways, without ever intercepting a click or drag that starts on a card or a lane.

**Architecture:** A single `pointerdown`/`pointermove`/`pointerup` set of handlers on `UmbCommunityKanbanBoardElement`'s `.lanes` div, gated by `event.target === event.currentTarget` so only the container's own background — never a descendant lane or card — starts a pan. Pointer Capture retargets every subsequent event of that pointer to `.lanes` regardless of what is visually underneath, so nothing in the lane or card elements needs to change. Touch pointer types are excluded so the browser's existing native touch-scroll (already free from `overflow-x: auto`) keeps its momentum.

**Tech Stack:** Lit 3 web components against `@umbraco-cms/backoffice` 18 (Pointer Events, `classMap` from `@umbraco-cms/backoffice/external/lit`), vitest for the pure model function.

**Spec:** [docs/superpowers/specs/2026-07-29-board-pan-to-scroll-design.md](../specs/2026-07-29-board-pan-to-scroll-design.md)

## Global Constraints

- **The grab area is the board background only** — never a card, never a lane (column). Implemented as `event.target === event.currentTarget` on `.lanes`.
- **No movement threshold.** Nothing is bound to a background click, so there is nothing to protect a click from.
- **Touch is excluded** from the custom pan (`event.pointerType === 'touch'` → ignored on `pointerdown`), leaving native touch-scroll untouched.
- **Nothing in `kanban-lane.element.ts` or `kanban-card.element.ts` changes.**
- **Client tests are vitest** (`describe`/`it`/`expect`), run from `src/Umbraco.Community.Kanban/Client`.
- Client test command: `cd src/Umbraco.Community.Kanban/Client && npm run test`
- Client type-check + build: `cd src/Umbraco.Community.Kanban/Client && npm run build`
- Repo root for every path below: `/Users/gandalf/Source/Repos/Umbraco.Community.Kanban`

## File Structure

| File | Responsibility |
| --- | --- |
| `src/Umbraco.Community.Kanban/Client/src/core/pan.model.ts` (new) | The pure scrollLeft arithmetic: `panScrollLeft(startScrollLeft, startX, currentX)`. |
| `src/Umbraco.Community.Kanban/Client/src/core/pan.model.test.ts` (new) | Tests for the above. |
| `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts` (modified) | The pointer handlers, `_isPanning` state, and the `panning`/`cursor: grab` styles on `.lanes`. |
| `docs/ENHANCEMENTS.md` (modified) | Item 9 marked done. |

---

### Task 1: The pure pan arithmetic

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/core/pan.model.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/core/pan.model.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `panScrollLeft(startScrollLeft: number, startX: number, currentX: number): number`

- [ ] **Step 1: Write the failing tests**

Create `src/Umbraco.Community.Kanban/Client/src/core/pan.model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { panScrollLeft } from './pan.model.js';

describe('panScrollLeft', () => {
  it('decreases scrollLeft when the pointer moves right', () => {
    // Dragging right reveals content to the left, which is a smaller scrollLeft.
    expect(panScrollLeft(100, 50, 80)).toBe(70);
  });

  it('increases scrollLeft when the pointer moves left', () => {
    expect(panScrollLeft(100, 80, 50)).toBe(130);
  });

  it('leaves scrollLeft unchanged when the pointer has not moved', () => {
    expect(panScrollLeft(100, 50, 50)).toBe(100);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/core/pan.model.test.ts`
Expected: FAIL — cannot resolve `./pan.model.js`.

- [ ] **Step 3: Write the model function**

Create `src/Umbraco.Community.Kanban/Client/src/core/pan.model.ts`:

```ts
/**
 * The next scrollLeft for a pointer-drag pan: dragging right (the pointer moves toward larger X)
 * reveals content to the left, so scrollLeft decreases by exactly the distance dragged, and vice
 * versa. Pure, so the direction of the scroll is tested without a DOM.
 */
export function panScrollLeft(startScrollLeft: number, startX: number, currentX: number): number {
  return startScrollLeft - (currentX - startX);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/core/pan.model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core/pan.model.ts src/Umbraco.Community.Kanban/Client/src/core/pan.model.test.ts
git commit -m "feat: add the pure scrollLeft arithmetic for panning the board"
```

---

### Task 2: Wire the pan into the board element

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`

**Interfaces:**
- Consumes: `panScrollLeft` (Task 1).
- Produces: nothing further tasks depend on — this is the last task that touches code.

- [ ] **Step 1: Add the imports**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`, add `classMap` to the existing lit import and import the pan model:

```ts
import { classMap, css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
```

```ts
import { panScrollLeft } from './pan.model.js';
```

- [ ] **Step 2: Add the pan state**

After the existing `@state() private _board?: KanbanBoardState;` field, add:

```ts
  /** True only while a background pan is live — drives the grabbing cursor and disables text selection. */
  @state()
  private _isPanning = false;

  /** The in-progress pan, or undefined between drags. Keyed by pointerId so a second pointer is ignored. */
  #pan?: { pointerId: number; startX: number; startScrollLeft: number };
```

- [ ] **Step 3: Add the four pointer handlers**

After `#onLoadMore`, add:

```ts
  /**
   * Starts a background pan. Gated on `event.target === event.currentTarget`: the listener is bound
   * directly on `.lanes`, so `currentTarget` is always that div, and the two are equal only when the
   * pointer went down on the div itself — never a lane or a card inside it. Touch is excluded because
   * `.lanes` already scrolls horizontally on a touch swipe, with native momentum, for free.
   */
  #onLanesPointerDown(event: PointerEvent) {
    if (event.target !== event.currentTarget) return;
    if (event.pointerType === 'touch') return;
    if (this.#pan) return; // a pan is already in progress for another pointer

    const lanes = event.currentTarget as HTMLDivElement;

    lanes.setPointerCapture(event.pointerId);
    this.#pan = { pointerId: event.pointerId, startX: event.clientX, startScrollLeft: lanes.scrollLeft };
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

    lanes.scrollLeft = panScrollLeft(this.#pan.startScrollLeft, this.#pan.startX, event.clientX);
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

    this.#pan = undefined;
    this._isPanning = false;
  }
```

- [ ] **Step 4: Bind the handlers and the panning class on `.lanes`**

In `#renderBoard`, replace the `.lanes` div's opening tag:

```ts
      <div
        class=${classMap({ lanes: true, panning: this._isPanning })}
        @kanban-load-more=${this.#onLoadMore}
        @pointerdown=${this.#onLanesPointerDown}
        @pointermove=${this.#onLanesPointerMove}
        @pointerup=${this.#onLanesPointerEnd}
        @pointercancel=${this.#onLanesPointerEnd}
        @lostpointercapture=${this.#onLanesPointerEnd}>
```

The closing `</div>` and everything else inside it are unchanged.

- [ ] **Step 5: Add the cursor and selection styles**

In the `static override styles` block, change the `.lanes` rule and add the `.panning` modifier
immediately after it:

```ts
      .lanes {
        display: flex;
        gap: var(--uui-size-space-4);
        align-items: flex-start;
        overflow-x: auto;
        padding-bottom: var(--uui-size-space-3);
        cursor: grab;
      }

      .lanes.panning {
        cursor: grabbing;
        user-select: none;
      }
```

- [ ] **Step 6: Type-check and test**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: clean build, all tests pass (this task adds no new automated tests — the pointer wiring is
manual-verification only, per the design).

- [ ] **Step 7: Verify by hand in the backoffice**

Build the client into the test site and open a board with enough lanes to overflow the viewport
horizontally (or narrow the browser window until `.lanes` scrolls). For each check, confirm and then
move on — no single check should regress another:

1. Drag from the gap between two lane columns → the board pans with the pointer; the cursor is
   `grabbing` while dragging and `grab` at rest over the background.
2. Drag starting on a card's body → the board does not pan, and the card's title still opens the
   document normally on a plain click.
3. Drag starting on a lane header, its badge, or its "Show more" button → the board does not pan, and
   each still works normally.
4. If any two lanes differ in height, drag from the dead space below the shorter one → the board pans
   (this is still `.lanes`'s own background, not the lane's box).
5. The native scrollbar drag and two-finger trackpad scroll still work.
6. On a touchscreen or touch emulation (Chrome DevTools device toolbar), a finger swipe still scrolls
   the board natively, with momentum.

- [ ] **Step 8: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts
git commit -m "feat: pan the board sideways by dragging its background"
```

---

### Task 3: Mark the enhancement done

**Files:**
- Modify: `docs/ENHANCEMENTS.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Replace item 9's body**

In `docs/ENHANCEMENTS.md`, the heading `## 9. Grab the board to pan it sideways` stays; replace
everything under it with:

```markdown
**Built 2026-07-29**, from
[its design](superpowers/specs/2026-07-29-board-pan-to-scroll-design.md). Dragging the board's own
background — never a card, never a lane — scrolls it sideways with the pointer, via a single
`event.target === event.currentTarget` check on `.lanes` and Pointer Capture retargeting. Touch is
untouched: `.lanes` already swipe-scrolls natively, with momentum, so the custom pan applies only to
mouse and pen pointer types.

The enhancement anticipated needing a movement threshold to avoid swallowing a card's or a lane
header's click. That did not turn out to be necessary: nothing is ever bound to a background click, so
there was never a click to protect, and nothing in `kanban-lane.element.ts` or `kanban-card.element.ts`
changed for this at all.
```

- [ ] **Step 2: Verify the file reads consistently**

Run: `grep -n "^## " docs/ENHANCEMENTS.md`
Expected: item 9 now reads as done; items 7 and 8 are unchanged.

- [ ] **Step 3: Commit**

```bash
git add docs/ENHANCEMENTS.md
git commit -m "docs: mark enhancement 9 done"
```

---

## Verification checklist

Run before calling the whole thing finished:

- [ ] `cd src/Umbraco.Community.Kanban/Client && npm run build` — `tsc --noEmit` clean and vite builds
- [ ] `cd src/Umbraco.Community.Kanban/Client && npm run test` — all pass
- [ ] In the backoffice: every check in Task 2 Step 7 passes.
