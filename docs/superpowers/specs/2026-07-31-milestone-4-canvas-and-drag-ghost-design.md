# Milestone 4 — Board canvas, equal-height lanes, drag ghost

**Goal:** give the board its own bounded scroll viewport with a content-height canvas inside it, so every
lane is the same height and a drop target is a whole column rather than an 82px stub; make the dragged
card follow the cursor; and finish the two-axis pan the milestone-2 follow-up could not.

**Why now:** milestone 3's drag works, but hand-verification exposed two faults that are both geometry,
not logic. An empty lane reported a rect only 82px tall (`top: 272, bottom: 354`) against a full lane's
8032px, so aiming at an empty lane was near-impossible; and nothing follows the cursor, so a drag gives
no sense of carrying anything. The fix for the first is already recorded as the pan backlog item in
[ENHANCEMENTS.md](../../ENHANCEMENTS.md): the board must own its vertical scrolling rather than borrow an
ancestor's.

## 1. Scope

**In**

- A `.viewport` / `.canvas` split: bounded, scrollable viewport wrapping a content-height flex canvas.
- Viewport height measured in JS and maintained on resize.
- Equal-height lanes (`align-items: stretch` against the canvas), so a lane's rect — and its
  drop-target highlight — spans the full canvas height.
- Sticky lane headers, pinned against the viewport while the canvas scrolls under them.
- A full-fidelity drag ghost following the pointer, with the original card left dimmed in place.
- Edge auto-scroll while dragging, both axes.
- Escape cancels a live drag.
- Two-axis background pan, replacing the horizontal-only pan.

**Out**

- **Card reordering within a lane.** `sortOrder` exists on `IContent` and is the right target, but
  reordering needs a server write path, an ordering guarantee on the board query, an insertion-index
  calculation, and a decision about what a position means in a paged or truncated lane. Its own spec,
  after this one. Nothing here should make it harder — hence the ghost, not a moved element, so the
  future insertion gap has somewhere to go.
- Any change to `laneAtPoint`, the write path, `PUT /card/{key}/lane`, publishing, or any server code.
  This milestone is client-only.
- Touch drag. Touch still scrolls natively, as it has since the pan work.
- Lane widths, colours, badges, or the truncation message.

## 2. Structure: viewport and canvas

Today `.lanes` is a single div serving as scroll container, flex container and pan surface at once. Those
separate:

```
.viewport   height: <measured>px; overflow: auto      ← scroll container, pan surface
  └ .canvas display: flex; align-items: stretch; height: auto   ← the canvas
      └ umb-community-kanban-lane × N                 ← stretched to canvas height
```

Two elements are load-bearing, not stylistic. `align-items: stretch` on a **bounded** flex container
stretches items to the container's visible height, which would clip the tallest lane's content. Equal
heights measured against the *tallest lane* require the flex container itself to be content-height. So
the bounded box (`.viewport`) and the stretching box (`.canvas`) cannot be the same element.

`.canvas` also needs `min-height: 100%` so that a board whose lanes are all short still fills the
viewport — otherwise an empty board's lanes collapse back to a stub and reintroduce the original
problem at the bottom of the range.

It needs `width: max-content; min-width: 100%` for the same reason in the other axis. Lanes are
`flex: 0 0 auto`, so without an explicit width the canvas box stays viewport-width while its lanes
overflow it. The lanes would still scroll, but the canvas — the pan surface and the thing the
self-target gate tests against — would not cover the area the user sees, so pressing the background to
the right of the fold would not start a pan.

### Height measurement

No ancestor CSS can supply the height. The vertical-pan post-mortem established why: walking
`umb-collection-default` → `#router` → our host finds `#router` with no explicit height
(`router-slot { height: 100% }` resolves to `auto` against it), and `#router` is sealed in a shadow root,
so there is no reachable stylesheet to fix. The board therefore measures:

```
height = max(minHeight, window.innerHeight - viewportRect.top - bottomGutter)
```

with concrete defaults so there is one reading, not two: `bottomGutter` is the host's own bottom padding
(`--uui-size-layout-1`, 24px) passed as a number, and `minHeight` is 320px — roughly a header plus two
cards, below which scrolling a canvas is useless anyway.

Expressed as a pure function `boardViewportHeight({ rectTop, innerHeight, gutter, min })`, applied as an explicit
pixel height. Recomputed on `window` `resize`, and after first render — the publish toolbar appearing or
disappearing changes `rectTop`, and a stale height would leave the viewport overhanging the window.

This is read-only geometry (`getBoundingClientRect`, `window.innerHeight`). It reaches into no shadow
root, which is precisely what the reverted attempt got wrong.

## 3. Equal-height lanes and sticky headers

The lane keeps its width rules and loses nothing else; stretch does the work once
`align-items: flex-start` is gone from the parent. `.header` becomes `position: sticky; top: 0`, which
resolves against `.viewport` — the nearest scrolling ancestor — not against the lane, so headers pin
while cards scroll beneath. The header already paints `--uui-color-surface-alt`, so it will not read as
transparent over scrolling content; it gains only the `z-index` needed to sit above the cards.

**The drop-target highlight now spans the full canvas height**, which is the whole point of this
milestone. `laneAtPoint` is unchanged — it consumes whatever rect the lane reports, and that rect simply
becomes the right one.

## 4. The drag ghost

The board renders it, being the only element that holds viewport coordinates and the card model:

```
.ghost   position: fixed; pointer-events: none; aria-hidden="true"
  └ <umb-community-kanban-card .card=${dragged} ?allow-drag=${false}>
```

Reusing the card element gives full fidelity that cannot drift from the real thing. `allow-drag` false
stops the clone beginning a gesture of its own; `pointer-events: none` keeps it inert under the cursor.

To sit where it was grabbed, the ghost needs the grab offset and the card's width, and only the card
knows those at `pointerdown`. `kanban-drag-start`'s detail therefore grows:

```ts
{ key: string; lane: string; grabOffsetX: number; grabOffsetY: number; width: number }
```

computed as `event.clientX - cardRect.left`, `event.clientY - cardRect.top`, and `cardRect.width`.
Position is `pointer - grabOffset`, held by a pure `ghostPosition({ pointer, grabOffset })` and applied
as `transform: translate3d(...)`. Updated **at most once per animation frame**: `pointermove` fires more
often than frames, and re-rendering per event would burn work nobody sees. Appearance is the card's own,
plus `--uui-shadow-depth-3` and a `2deg` rotation, at full opacity — the dimmed copy left behind is what
signals "in flight", so dimming the ghost too would leave nothing looking solid.

The original card keeps its milestone-3 treatment — 0.5 opacity, dashed border, in place — so no lane
reflows on pickup.

### The one unproven assumption

`position: fixed` resolves against the viewport **unless** an ancestor establishes a containing block via
`transform`, `filter`, `contain` or `backdrop-filter`. Several backoffice layout components wrap the
board and none has been checked. The plan must verify this in the real host before building on it, and
carry a fallback: render the ghost inside `.viewport` and convert the pointer to viewport-relative
coordinates (`pointer - viewportRect.top/left + scrollTop/Left`). Equivalent cost; different arithmetic.
Discovering it late would mean rewriting the positioning after the fact.

## 5. Auto-scroll and Escape

**Auto-scroll.** While a drag is live and the pointer sits within `threshold` of a `.viewport` edge, the
canvas scrolls that way each frame, speed ramping linearly with proximity — at the very edge `maxSpeed`,
at the threshold zero. Defaults: `threshold` 60px, `maxSpeed` 20px per frame (~1200px/s at 60fps, about
four lane widths a second — fast enough to cross a wide board, slow enough to stop on a target). The
arithmetic is a pure `edgeScrollDelta({ pointer, rect, threshold, maxSpeed }) → { dx, dy }`; the board
owns the `requestAnimationFrame` loop and stops it on drop, cancel and reload.

This changes how the drop target is maintained. While the canvas scrolls under a stationary pointer,
lane rects move without any `pointermove` arriving — so **the hit-test re-runs every frame of the loop**,
not only on pointer movement. `_dropTarget` becomes a per-frame derivation during a drag rather than a
per-event one.

**Escape.** The card owns the gesture and the pointer capture, so the card owns Escape: a `window`
`keydown` listener added on drag start and removed on every exit path. Escape releases capture and
dispatches the existing `kanban-drag-cancel`, so the board learns nothing new and no event is added. No
write is ever in flight at that point — the move is applied on drop — so cancelling is purely local.

## 6. Two-axis pan

`panScrollOffset` needs no change; it is already axis-agnostic by construction and says so. The rest:

- `#pan` gains `startY` and `startScrollTop`.
- The move handler drives `scrollTop` alongside `scrollLeft`, both through `panScrollOffset`.
- Pan listeners move from `.lanes` to `.viewport`, the element that now scrolls.
- The self-target gate changes meaning. The background a user presses is `.canvas`, since the canvas
  fills at least the viewport, so the caller passes
  `isSelfTarget: target === canvas || target === viewport`. `shouldStartPan` keeps its signature, its
  touch and non-primary-button rules, and its scrollbar-gutter guard (still measured against the
  viewport's `clientWidth`/`clientHeight`).

Pan and card drag still cannot collide: a card drag begins on a card, a pan on the background, and the
gate is what separates them.

## 7. Testing

Per the repo's constraint — Vitest runs in Node with no custom-elements registry — pure models are
unit-tested and elements are verified by `tsc --noEmit` plus `npm run build`.

**New pure functions, unit-tested:**

| Function | File | Cases that matter |
| --- | --- | --- |
| `boardViewportHeight` | `core/canvas.model.ts` | normal window; `rectTop` below the fold (clamps to `min`); tiny window; gutter applied |
| `edgeScrollDelta` | `core/canvas.model.ts` | centre → `{0,0}`; each edge in isolation; a corner (both axes at once); ramp is stronger nearer the edge; never exceeds `maxSpeed` |
| `ghostPosition` | `core/drag.model.ts` | offset preserved; negative results allowed (dragging above/left of the viewport) |

**Unchanged and must stay passing:** every `drag.model.ts`, `board.model.ts`, `pan.model.ts` and
`lane.model.ts` test, and all 278 server tests. This milestone touches no server code.

**Hand-verification** (no browser runner exists for element wiring):

1. Empty and full lanes render the same height; the canvas is as tall as the fullest lane.
2. Scrolling the canvas down keeps every lane header visible.
3. The board's bottom edge sits at the window's bottom; resizing the window keeps it there.
4. Dragging a card shows a full card following the cursor, offset preserved from where it was grabbed,
   with the original dimmed and dashed in place.
5. Dropping on any part of a lane's full height works, including well below the last card.
6. Holding a dragged card near an edge scrolls the canvas, and the highlight updates as lanes move
   under a still pointer.
7. Escape mid-drag returns the card with no write and no toast.
8. Dragging the background pans both axes; dragging a card never pans; touch still scrolls natively.

## 8. Files

**New**

| File | Responsibility |
| --- | --- |
| `Client/src/core/canvas.model.ts` | `boardViewportHeight`, `edgeScrollDelta`. Pure. |
| `Client/src/core/canvas.model.test.ts` | Tests for both. |

**Changed**

| File | Change |
| --- | --- |
| `Client/src/core/kanban-board.element.ts` | `.viewport`/`.canvas` structure; height measurement + resize; ghost rendering; rAF auto-scroll loop with per-frame hit-test; two-axis pan |
| `Client/src/core/kanban-lane.element.ts` | Sticky header; stretch-driven height |
| `Client/src/core/kanban-card.element.ts` | Grab offset and width in `kanban-drag-start`; Escape handling |
| `Client/src/core/drag.model.ts` | `ghostPosition` |
| `Client/src/core/drag.model.test.ts` | Tests for `ghostPosition` |
| `docs/ENHANCEMENTS.md` | Record the milestone; close the vertical-pan backlog item |
