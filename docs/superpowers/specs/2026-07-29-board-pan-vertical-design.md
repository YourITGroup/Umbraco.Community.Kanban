# Panning the board vertically too

Extends [ENHANCEMENTS.md item 9](../../ENHANCEMENTS.md#9-grab-the-board-to-pan-it-sideways) (already
built — [its own design](2026-07-29-board-pan-to-scroll-design.md)): dragging the board's background
today only pans it sideways. When a board has more cards than fit vertically, the same drag should
also move the board up and down, so grabbing the background genuinely "moves the whole board around"
in both directions at once.

## Why this isn't just "add scrollTop"

`.lanes` ([kanban-board.element.ts](../../../src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts))
has `overflow-x: auto` and nothing for the vertical axis. When a lane grows taller than the viewport,
`.lanes` and the whole `<umb-community-kanban-board>` element simply grow with it — there is no
`overflow-y` anywhere in this component. Whatever *already* scrolls vertically today is some ancestor
outside the component entirely. In the one live embedding — the Collection View host
([collection-view-board.element.ts](../../../src/Umbraco.Community.Kanban/Client/src/hosts/collection-view-board.element.ts))
— that ancestor is Umbraco's own `<uui-scroll-container>` (`overflow-y: auto` on its own shadow host),
several shadow trees above our board, reached through `umb-body-layout`'s `<uui-scroll-container id="main">`.

So "pan vertically" cannot mean "also scroll `.lanes.scrollTop`" — `.lanes` has nothing to scroll on
that axis. It has to mean: find whatever element *does* own vertical overflow right now, and drive
that element's `scrollTop` from the same drag.

## The two designs considered

**Make the board scroll its own vertical box** (rejected): give `.lanes` or a wrapper a bounded height
plus `overflow-y: auto`, so the component becomes a self-contained 2D viewport. Simpler — one scroll
target, no cross-shadow traversal — but it invents a height that varies per host, and it replaces
today's behaviour (the board grows with its content; the *page* scrolls around it) with a fixed-size
scrollport, which is a bigger and more disruptive change than "let dragging also do what the mouse
wheel already does here."

**Pan whatever ancestor already scrolls vertically** (chosen): `.lanes` is untouched for its own axis.
At the same `pointerdown` that starts a pan, the board walks up from itself looking for the nearest
ancestor whose *computed* `overflow-y` is `auto`, `scroll`, or `overlay` — crossing shadow-DOM
boundaries when `parentElement` runs out, via `node.getRootNode()` returning a `ShadowRoot` whose
`.host` is the next real element up. If nothing is found, vertical panning is simply inert for that
drag; horizontal keeps working exactly as it does today. This is the literal reading of "if there are
items below the viewport" — the viewport is whatever container already has that ambient scroll, not a
newly-invented one, and the board never needs to know or assume which element that is.

## How the drag works

```
pointerdown on .lanes, shouldStartPan(...) → true   (unchanged: button/isPrimary/self-target/gutter checks)
  → capture pointer, record startX/startScrollLeft   (unchanged)
  → #findVerticalScrollAncestor(this) → verticalTarget | undefined
  → if found: also record { verticalTarget, startY: event.clientY, startScrollTop: verticalTarget.scrollTop }

pointermove, same pointerId
  → lanes.scrollLeft = panScrollOffset(startScrollLeft, startX, event.clientX)          (unchanged formula)
  → if verticalTarget: verticalTarget.scrollTop = panScrollOffset(startScrollTop, startY, event.clientY)

pointerup / pointercancel / lostpointercapture
  → #endPan() clears pan state — both axes now, same shape as before
```

`panScrollLeft` is renamed to `panScrollOffset` — the formula (`start - (current - startAt)`) was
never specific to the horizontal axis; it just hadn't been asked to serve a second one yet. One
function, called twice per `pointermove` when a vertical target exists, once when it doesn't.

### Finding the scrollable ancestor

```ts
function findVerticalScrollAncestor(from: Element): HTMLElement | null {
  let node: Node | null = from.parentElement ?? from.getRootNode();

  while (node) {
    if (node instanceof Element) {
      if (/(auto|scroll|overlay)/.test(getComputedStyle(node).overflowY)) {
        return node as HTMLElement;
      }
      node = node.parentElement ?? node.getRootNode();
    } else if (node instanceof ShadowRoot) {
      node = node.host;
    } else {
      node = null; // reached the Document with nothing found
    }
  }

  return null;
}
```

Walked once per `pointerdown` (not cached across drags — a reload or a host swap could change the
ancestry between one drag and the next) and stored on the pan state for the duration of that one drag,
so `pointermove` never re-walks the DOM.

This is deliberately **not** a pure function: it reads `getComputedStyle` and live shadow roots, so —
unlike `panScrollOffset` and `shouldStartPan`, both value-in/value-out — it cannot be unit-tested under
this package's `environment: 'node'` vitest config (no jsdom here). It lives as a private method on
`UmbCommunityKanbanBoardElement`, not in `pan.model.ts`, keeping the pure/impure boundary this codebase
already draws between `*.model.ts` and the elements that use it.

### What doesn't change

- `shouldStartPan`'s checks (background-only gate, non-touch, primary-button, scrollbar-gutter) are
  about *whether* a pan starts at all, not which axes it drives once it has. None of them change.
- The `.lanes` scrollbar-gutter exclusion stays scoped to `.lanes`' own horizontal scrollbar; it says
  nothing about the vertical ancestor's scrollbar, which lives on a different element's box entirely
  and does not overlap `.lanes`' own bounding box.
- Touch is still excluded at the `pointerdown` gate. The vertical ancestor's native touch-scroll (it is
  `overflow-y: auto`, same reasoning as `.lanes`' horizontal touch-scroll) is untouched.
- Cursor states, `preventDefault`, the second-pointer guard, and `#endPan`'s call from `load()` all
  keep working exactly as before — `#endPan` just clears two more fields alongside the existing ones.

## Testing

`panScrollOffset` keeps its existing three tests (renamed from `panScrollLeft`'s) — the formula didn't
change, so neither do the cases. `findVerticalScrollAncestor` is impure and untestable here, same as
every other piece of this feature's DOM wiring (the pointerdown/pointermove/pointerup handlers
themselves were never unit-tested either, for the identical reason).

By hand: a board with more lanes than fit vertically pans in both directions from one drag; a board
that fits entirely on screen (nothing to scroll vertically) behaves exactly as it does today — the
drag still pans horizontally, nothing regresses; the ancestor's own scrollbar and mouse-wheel scrolling
still work during and between drags; a right-click, a press in `.lanes`' own scrollbar gutter, and a
reload mid-drag all still behave exactly as the horizontal-only feature's own manual checks describe,
now with the vertical state cleared alongside the horizontal.

## Files

**Changed**
- `src/Umbraco.Community.Kanban/Client/src/core/pan.model.ts` — `panScrollLeft` renamed to
  `panScrollOffset`; no new exports
- `src/Umbraco.Community.Kanban/Client/src/core/pan.model.test.ts` — tests renamed to match
- `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts` — `#findVerticalScrollAncestor`,
  the extended `#pan` shape, and the vertical half of `#onLanesPointerDown`/`#onLanesPointerMove`/`#endPan`
- `docs/ENHANCEMENTS.md` — item 9's entry extended to note the vertical axis
