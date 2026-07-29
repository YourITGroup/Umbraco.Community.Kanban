# Pan the Board Vertically Too Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the shipped horizontal board-pan feature so the same drag also scrolls the board vertically, whenever an ancestor already owns vertical overflow.

**Architecture:** `.lanes` keeps its own horizontal scroll exactly as it is today. At `pointerdown`, the board additionally walks up from itself — through parent elements and, when those run out, through `shadowRoot.host` — looking for the nearest ancestor whose computed `overflow-y` is `auto`, `scroll`, or `overlay`. If one exists, its `scrollTop` is driven by the same drag, alongside `.lanes.scrollLeft`; if none exists, vertical panning is simply inert and horizontal behaves exactly as it did before this plan.

**Tech Stack:** Lit 3 web components against `@umbraco-cms/backoffice` 18, native `getComputedStyle`/`ShadowRoot`/Pointer Events, vitest for the pure functions.

**Spec:** [docs/superpowers/specs/2026-07-29-board-pan-vertical-design.md](../specs/2026-07-29-board-pan-vertical-design.md)

## Global Constraints

- **`.lanes`'s own horizontal scroll and all of `shouldStartPan`'s gates (background-only, non-touch, primary-button, scrollbar-gutter) are unchanged.** This plan only adds a second axis to an already-shipped feature.
- **The vertical ancestor lookup (`#findVerticalScrollAncestor`) is impure** (reads `getComputedStyle` and live shadow roots) and is **not** unit-tested — this package's vitest config is `environment: 'node'` (no jsdom), the same reason none of the existing pointer-event wiring in this file is unit-tested.
- **`panScrollLeft` is renamed to `panScrollOffset`** — same formula, now driving both axes.
- Client test command: `cd src/Umbraco.Community.Kanban/Client && npm run test`
- Client type-check + build: `cd src/Umbraco.Community.Kanban/Client && npm run build`
- Repo root for every path below: `/Users/gandalf/Source/Repos/Umbraco.Community.Kanban`

## File Structure

| File | Responsibility |
| --- | --- |
| `src/Umbraco.Community.Kanban/Client/src/core/pan.model.ts` (modified) | `panScrollLeft` renamed to `panScrollOffset`; `shouldStartPan` unchanged. |
| `src/Umbraco.Community.Kanban/Client/src/core/pan.model.test.ts` (modified) | Tests renamed to match. |
| `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts` (modified) | `#findVerticalScrollAncestor`, the extended `#pan` shape, and the vertical half of the pointer handlers. |
| `docs/ENHANCEMENTS.md` (modified) | Item 9's entry extended to note the vertical axis. |

---

### Task 1: Rename `panScrollLeft` to `panScrollOffset`

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/pan.model.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/pan.model.test.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts` (the one call site)

**Interfaces:**
- Consumes: nothing new.
- Produces: `panScrollOffset(startOffset: number, startAt: number, currentAt: number): number` — same signature shape and formula as the old `panScrollLeft`, just axis-neutral parameter names.

- [ ] **Step 1: Rename the test file's calls first**

In `src/Umbraco.Community.Kanban/Client/src/core/pan.model.test.ts`, change the import and the
`describe` block's calls (leave the `shouldStartPan` describe block untouched):

```ts
import { panScrollOffset, shouldStartPan } from './pan.model.js';

describe('panScrollOffset', () => {
  it('decreases the offset when the pointer moves in the positive direction', () => {
    // Dragging right reveals content to the left, which is a smaller scrollLeft — the same
    // formula applies to scrollTop when dragging down reveals content above.
    expect(panScrollOffset(100, 50, 80)).toBe(70);
  });

  it('increases the offset when the pointer moves in the negative direction', () => {
    expect(panScrollOffset(100, 80, 50)).toBe(130);
  });

  it('leaves the offset unchanged when the pointer has not moved', () => {
    expect(panScrollOffset(100, 50, 50)).toBe(100);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/core/pan.model.test.ts`
Expected: FAIL — `panScrollOffset` is not exported from `pan.model.ts` (still named `panScrollLeft` there).

- [ ] **Step 3: Rename the implementation**

In `src/Umbraco.Community.Kanban/Client/src/core/pan.model.ts`, rename the function and its
parameters, and generalise its comment to describe both axes:

```ts
/**
 * The next scroll offset for a pointer-drag pan on one axis: dragging in the positive direction
 * (the pointer moves toward larger X, or larger Y) reveals content on the negative side, so the
 * offset decreases by exactly the distance dragged, and vice versa. Pure, so the direction of the
 * scroll is tested without a DOM. Used for both scrollLeft (with clientX) and scrollTop (with
 * clientY) — the formula doesn't care which axis it's driving.
 */
export function panScrollOffset(startOffset: number, startAt: number, currentAt: number): number {
  return startOffset - (currentAt - startAt);
}
```

Leave `shouldStartPan` exactly as it is — this task does not touch it.

- [ ] **Step 4: Update the one call site**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`, change the import and the
single existing call in `#onLanesPointerMove`:

```ts
import { panScrollOffset, shouldStartPan } from './pan.model.js';
```

```ts
    lanes.scrollLeft = panScrollOffset(this.#pan.startScrollLeft, this.#pan.startX, event.clientX);
```

- [ ] **Step 5: Run the tests and build to verify everything passes**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: clean build, all tests pass (the renamed `panScrollOffset` suite plus every pre-existing
test, unchanged in count).

- [ ] **Step 6: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core/pan.model.ts src/Umbraco.Community.Kanban/Client/src/core/pan.model.test.ts src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts
git commit -m "refactor: rename panScrollLeft to panScrollOffset ahead of driving a second axis"
```

---

### Task 2: Pan whatever ancestor already scrolls vertically

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`

**Interfaces:**
- Consumes: `panScrollOffset` (Task 1).
- Produces: nothing further tasks depend on — this is the last task that touches code.

- [ ] **Step 1: Extend the pan state's shape**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`, change the `#pan` field
declaration:

```ts
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
```

- [ ] **Step 2: Add the vertical-ancestor lookup**

Immediately before `#onLanesPointerDown`, add:

```ts
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
```

- [ ] **Step 3: Record the vertical target at pointerdown**

In `#onLanesPointerDown`, replace the existing pan-state assignment:

```ts
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
```

Everything above and below this block in `#onLanesPointerDown` (the `shouldStartPan` gate,
`event.preventDefault()`) is unchanged.

- [ ] **Step 4: Drive the vertical target on pointermove**

In `#onLanesPointerMove`, add the vertical half after the existing `scrollLeft` line:

```ts
  #onLanesPointerMove(event: PointerEvent) {
    if (!this.#pan || event.pointerId !== this.#pan.pointerId) return;

    const lanes = event.currentTarget as HTMLDivElement;

    lanes.scrollLeft = panScrollOffset(this.#pan.startScrollLeft, this.#pan.startX, event.clientX);

    const vertical = this.#pan.vertical;

    if (vertical) {
      vertical.target.scrollTop = panScrollOffset(vertical.startScrollTop, vertical.startY, event.clientY);
    }
  }
```

- [ ] **Step 5: Confirm `#endPan` and `#onLanesPointerEnd` need no changes**

Read the current `#endPan` method. It does `this.#pan = undefined; this._isPanning = false;` —
since `vertical` lives *inside* the `#pan` object, clearing `#pan` already clears it. Confirm this by
reading the file; there is nothing to edit here.

- [ ] **Step 6: Type-check and test**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: clean build, all tests pass (this task adds no new automated tests — the vertical-ancestor
lookup is impure and DOM-dependent, per the Global Constraints; the pointer-event wiring it plugs into
was already manual-verification-only before this plan).

- [ ] **Step 7: Verify by hand in the backoffice**

Build the client into the test site and open a board with enough cards in at least one lane to make
the board taller than the browser viewport (or shrink the window). For each check, confirm and move
on — no single check should regress another:

1. Drag from the board's background (a gap between lanes, or dead space below a shorter lane) in a
   diagonal direction → the board pans both sideways and up/down simultaneously, tracking the pointer.
2. On a board that fits entirely within the viewport (nothing to scroll vertically) — drag from the
   background → the board still pans sideways exactly as before; nothing about the horizontal-only
   behavior regresses.
3. While a vertical pan is in progress, the mouse wheel and the ancestor's own scrollbar (if visible)
   still work between drags.
4. A right-click on the background still does nothing (the button/isPrimary guard from the previous
   fix still holds) — confirm the board doesn't get stuck believing it's mid-pan.
5. A press in `.lanes`' own horizontal scrollbar gutter still drags the scrollbar thumb at the normal
   rate, not 1:1 with the pointer.
6. Trigger a board reload while a drag is in progress (e.g. save a document open in the workspace
   modal, which calls `#board?.load()`) → the pan ends cleanly, with no stuck cursor and no jump on the
   next drag.
7. On a touchscreen or touch emulation, a finger swipe still scrolls the board — both horizontally
   (native, on `.lanes`) and, if the page/container also has vertical overflow, vertically (native, on
   whatever already handles it) — untouched by any of this, since touch is excluded at the
   `pointerdown` gate.

- [ ] **Step 8: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts
git commit -m "feat: pan the board vertically too, via whatever ancestor already scrolls"
```

---

### Task 3: Document the vertical axis

**Files:**
- Modify: `docs/ENHANCEMENTS.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Extend item 9's body**

In `docs/ENHANCEMENTS.md`, the heading `## 9. Grab the board to pan it sideways` and its first two
paragraphs (the `**Built 2026-07-29**...` paragraph and the "movement threshold" paragraph) stay
exactly as they are. Add a new paragraph after them:

```markdown

Extended the same day to pan vertically too, from
[a follow-up design](superpowers/specs/2026-07-29-board-pan-vertical-design.md): `.lanes` has no
vertical overflow of its own, so the drag also drives whatever ancestor already owns vertical
scrolling — found by walking up through parent elements and, crossing shadow boundaries via
`shadowRoot.host`, to Umbraco's own `<uui-scroll-container>` in the live Collection View host. A board
that fits entirely within the viewport is unaffected: nothing is found to scroll, and the drag pans
sideways exactly as it always has.
```

- [ ] **Step 2: Verify the file reads consistently**

Run: `grep -n "^## " docs/ENHANCEMENTS.md`
Expected: item 9 still reads as a single done entry; items 7 and 8 are unchanged.

- [ ] **Step 3: Commit**

```bash
git add docs/ENHANCEMENTS.md
git commit -m "docs: note the vertical pan axis on enhancement 9"
```

---

## Verification checklist

Run before calling the whole thing finished:

- [ ] `cd src/Umbraco.Community.Kanban/Client && npm run build` — `tsc --noEmit` clean and vite builds
- [ ] `cd src/Umbraco.Community.Kanban/Client && npm run test` — all pass
- [ ] In the backoffice: every check in Task 2 Step 7 passes.
