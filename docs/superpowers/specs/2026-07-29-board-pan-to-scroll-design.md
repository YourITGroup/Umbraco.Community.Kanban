# Grab the board to pan it sideways

Design for [ENHANCEMENTS.md item 9](../../ENHANCEMENTS.md#9-grab-the-board-to-pan-it-sideways):
click-and-hold on the board background, drag, and the board scrolls sideways with the pointer, so a
board with more lanes than fit is navigable without hunting for a scrollbar or shift-scrolling.

## The constraint that shapes everything here

The enhancement's own text worried at length about telling a pan from a card click, a lane header
click, and milestone 3's future card drag — because it assumed a pan could start from *anywhere* on
the board, including a lane's own empty space below its cards. That is not what was asked for here:
**the grab area is the board's background itself — never a card, never a column (a lane).** That one
constraint removes every conflict the enhancement worried about. There is nothing to suppress a click
on, because nothing is ever bound to the background, and no future card drag can start there either.

## Where the background actually is

The board's `.lanes` div ([kanban-board.element.ts](../../../src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts))
is a flex row (`overflow-x: auto`) holding one `<umb-community-kanban-lane>` per lane, each a fixed-width
flex item (`flex: 0 0 auto`) via [kanban-lane.element.ts](../../../src/Umbraco.Community.Kanban/Client/src/core/kanban-lane.element.ts).
With `align-items: flex-start`, three things are genuinely `.lanes`'s own background, never inside a
lane's box: the `gap` between lane columns, any dead space to the right of the last lane if `.lanes` is
wider than its content, and any dead space below a lane shorter than its tallest sibling.

The gate that identifies all three at once, and nothing else, is a single check on `pointerdown`:
`event.target === event.currentTarget`. Because the listener is bound directly on `.lanes`,
`event.currentTarget` is always that div; `event.target` is whichever element the pointer actually
landed on. The two are equal only when the pointer went down on `.lanes` itself — never a lane, never
a card, never a button inside either.

## How the drag itself works

Once `.lanes` calls `setPointerCapture` on `pointerdown`, the Pointer Events spec retargets every
subsequent `pointermove`/`pointerup` for that pointer to the capturing element — `.lanes` — regardless
of what is visually under the cursor as the drag continues. A drag that passes back over a lane or a
card mid-gesture never reaches that lane's or card's own handlers; nothing in
`kanban-lane.element.ts` or `kanban-card.element.ts` changes for this feature at all.

```
pointerdown on .lanes, target === .lanes, pointerType !== 'touch'
  → lanes.setPointerCapture(pointerId)
  → record { pointerId, startX: event.clientX, startScrollLeft: lanes.scrollLeft }
  → _isPanning = true   (cursor → grabbing, user-select → none)
  → event.preventDefault()   (stops native drag-select starting before the re-render lands)

pointermove, same pointerId
  → lanes.scrollLeft = startScrollLeft - (event.clientX - startX)

pointerup / pointercancel / lostpointercapture, same pointerId
  → lanes.releasePointerCapture(pointerId) (if still held)
  → clear pan state, _isPanning = false
```

`_isPanning` is a `@state` field on `UmbCommunityKanbanBoardElement`, driving a `panning` class on
`.lanes` for the cursor and `user-select` — the same shape `_status` already uses on this element.

### Touch is deliberately excluded

`.lanes` already scrolls horizontally on a touch swipe for free, with native momentum, because it is
`overflow-x: auto`. The `pointerdown` gate checks `event.pointerType === 'touch'` and returns before
doing anything, so touch never enters this code path at all and native scrolling is untouched. Only
`mouse` and `pen` pointer types drive the custom pan — a trackpad click-and-drag on desktop is a mouse
pointer, so it works the same as a physical mouse.

### No movement threshold

The enhancement anticipated needing "a few pixels before the gesture becomes a pan" to avoid
swallowing a click. That machinery does not apply here: nothing is ever bound to a background click, so
there is no click to protect. The pan is live from the first qualifying `pointermove`.

### Edge cases

- **A second pointer while already panning** (an extra touch, a second mouse button) is ignored: the
  existing pan state is keyed by its own `pointerId`, and a new `pointerdown` while that state is set
  does nothing.
- **`lostpointercapture`** — the browser can revoke capture without a `pointerup` ever firing (losing
  window focus, an OS-level gesture intercepting it) — is handled identically to `pointerup`, so
  `_isPanning` can never get stuck `true` with the cursor pinned on `grabbing`.
- **Keyboard and scrollbar scrolling** are untouched: this adds a pointer-drag path alongside the
  native ones on the same `overflow-x: auto` element, and changes nothing about how it already scrolls.

## Testing

The only pure computation here — `startScrollLeft - (currentX - startX)` — gets its own model file and
vitest suite, matching this codebase's convention of pulling extractable logic out of the element
(`board.model.ts`, `card-children.model.ts` are the precedents):

```ts
// core/pan.model.ts
export function panScrollLeft(startScrollLeft: number, startX: number, currentX: number): number {
  return startScrollLeft - (currentX - startX);
}
```

Tests: dragging right (`currentX > startX`) decreases `scrollLeft`; dragging left increases it; no
movement (`currentX === startX`) leaves it unchanged; the function is pure arithmetic, so these are
the only cases that exist.

The pointer-event wiring itself — capture, retargeting, the touch exclusion, the cursor state — is not
unit-testable in this package: there is no DOM/component test harness here, and every other
element-level behaviour in this codebase (card clicks, the create-child popovers, drag-and-drop to
come) is verified by hand for the same reason. By hand, once built:

- Dragging from a gap between two lanes pans the board; releasing stops it.
- Dragging from the dead space below a shorter lane (when lanes differ in height) also pans.
- Starting a drag on a card does not pan, and the card's own click still opens it.
- Starting a drag on a lane header, its badge, or its "Show more" button does not pan, and each still
  works normally.
- The native scrollbar and two-finger trackpad scroll (which arrive as `wheel` events, not pointer
  drags, and are unaffected by any of this) still work.
- A touchscreen (or touch emulation in devtools) still swipe-scrolls the board natively, with momentum.
- The cursor reads `grab` over the background at rest and `grabbing` only while a pan is live.

## Files

**New**
- `src/Umbraco.Community.Kanban/Client/src/core/pan.model.ts`
- `src/Umbraco.Community.Kanban/Client/src/core/pan.model.test.ts`

**Changed**
- `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts` — the pointer handlers, the
  `_isPanning` state, and the `panning`/`cursor: grab` styles on `.lanes`
- `docs/ENHANCEMENTS.md` — item 9 marked done, pointing here

Nothing in `kanban-lane.element.ts` or `kanban-card.element.ts` changes.
