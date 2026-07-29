# Lane order: unassigned first, and a draggable order

**Date:** 2026-07-29
**Status:** Approved for planning
**Parent design:** [2026-07-28-umbraco-community-kanban-design.md](2026-07-28-umbraco-community-kanban-design.md)
**Builds on:** [2026-07-29-lane-appearance-preview-and-colour-picker-design.md](2026-07-29-lane-appearance-preview-and-colour-picker-design.md)
**Sibling:** [2026-07-29-card-properties-columns-design.md](2026-07-29-card-properties-columns-design.md) — built together, independent of this

---

## 1. Problem

Two things about the order lanes appear in.

**The unassigned lane is last.** `KanbanLaneResolver` appends it after every real lane. Cards with no
value — usually the ones needing attention — end up furthest from where an editor starts reading.

**Nothing else can be reordered at all.** Lane order is whatever the source produced: a dropdown's
option order, or the order manual lanes were typed. A board wanting "Confirmed" before "Pending" has to
change the underlying data type's options, which changes every other use of that property.

## 2. Scope

**In**

- The unassigned lane renders **first**, always.
- A new `laneOrder` configuration field, holding lane values in display order.
- Reordering by dragging in the **Lane appearance** editor, for lanes from any source — a lane property
  or manual lanes alike — using Umbraco's own sortable list.
- Palette colours assigned by a lane's position in its **source** order, not its display order.

**Out**

- **Reordering on the board itself.** The order is configured in the data type; the board renders it.
- **The unassigned lane in the settings UI.** It is synthetic, has no stored value to order by, and is
  never listed under Lane appearance — `mergeOverridesWithLanes` already filters it out.
- **Reordering cards within a lane**, which is milestone 3's drag-and-drop, not this.
- **Card properties.** Same drag mechanism, separate design.

## 3. Design

### 3.1 Unassigned first

`KanbanLaneResolver.ResolveAsync` inserts the unassigned lane at the front instead of appending it.
That is the whole change to where it sits — it is already excluded from the configuration UI, and
`GET /board` already addresses it by the empty lane value rather than by position.

### 3.2 Colour stops depending on position

Moving the unassigned lane exposes an existing coupling. `KanbanLaneColourAssigner` walks the lane list
and uses the **loop index** as the palette index; the unassigned lane consumes an index even though it
takes the neutral colour and `continue`s. So putting it first shifts every real lane one step along the
cycle, re-colouring every existing board.

The fix is to count palette positions over real lanes only, with a counter separate from the loop index.
This is worth doing regardless of §3.1: a board's colours should not depend on where a synthetic lane
sits.

Colours are then assigned in **source order, before `laneOrder` is applied**, so dragging a lane
changes which column it is in and nothing else. The alternative — colour following display order — was
rejected: dragging "Cancelled" to the front would recolour it *and* shift every lane after it, which
reads as a bug. A lane that wants a specific colour has an override.

`KanbanLaneColourAssigner`'s own comment already promises "a lane keeps the same colour on every load";
this makes that true across a reorder too.

### 3.3 `laneOrder`

A `string[]` on `KanbanBoardConfiguration`, holding lane values in display order.

Applied after overrides and before the unassigned lane is prepended:

- A lane whose value appears in `laneOrder` sorts by that position.
- A lane that does not — a dropdown option added after the board was configured — keeps its source
  order and sorts **after** every listed lane. Appending rather than dropping matters: a new option
  must appear somewhere, and the end is the only position that does not silently reorder the lanes an
  editor arranged deliberately.
- A value in `laneOrder` matching no lane is ignored. It is the same situation as an orphaned override,
  and unlike an override there is nothing to show for it — order is not styling.
- Matching is case-insensitive, as everywhere else lane values are compared.

Empty or absent `laneOrder` means source order, which is what every board configured before this
change has.

Like `laneContentTypeKey`, it is **not** a visible setting: it is written by dragging, not typed. It
is stored under an undeclared configuration alias, the same way `laneContentTypeKey` and
`kanban.boardConfigId` already are.

### 3.4 Dragging in the Lane appearance editor

The editor's rows become an `umb-sortable-list` from `@umbraco-cms/backoffice/sorter` — the same
component Umbraco's own List View column configuration uses. It takes `items`, a `getUnique`, and a
`renderMethod`, and fires a change carrying the reordered array, so the element does not implement
dragging at all. Each row becomes an `umb-sortable-list-item`, which supplies the handle.

`moveItem`, this package's own index arithmetic, is no longer needed for lanes. It stays for manual
lanes' ↑ ↓ buttons.

On drop the editor writes the new order — the row values, in their new order — to `laneOrder` through
the workspace context, then dispatches its change event. Two ordering details carry over from the lane
property picker, for the same reasons:

- The `laneOrder` write is **awaited before** the change event. Both it and `laneOverrides` land in the
  same configuration value list, and overlapping them lets one read the list as it was before the
  other.
- `laneOrder` is **observed**, not read once, so the rows show the stored order on load and follow it
  if it changes.

Rows are sorted by the same rule the server applies, so what the editor shows is what the board will
render. The rule lives in one pure function per side, and §5 tests both against the same cases.

Orphaned overrides — rows for lanes that no longer resolve — sort last, after real lanes, and are
draggable like any other row. Their position is stored and simply has no effect until the lane comes
back.

### 3.5 Previewing the order

`laneOrder` joins the preview request, so the data type editor shows lanes in the order the board will
use rather than the source's order. Without it, dragging a lane would move the row and then the row
would snap back on the next preview.

## 4. Testing

Server, xUnit:

- **`KanbanLaneOrderApplier`** — listed lanes take their listed order; unlisted lanes keep source order
  after the listed ones; an unmatched value is ignored; matching ignores case; an empty or absent order
  leaves the lanes alone; the input is not mutated.
- **`KanbanLaneColourAssigner`** — palette colours are unaffected by where the unassigned lane sits,
  which is the regression this design would otherwise cause; the unassigned lane is still neutral; an
  overridden colour is still left alone.
- **`KanbanLaneResolver`** — the unassigned lane comes first; `laneOrder` reorders real lanes and never
  moves the unassigned one; colours follow source order rather than display order.
- **Configuration round trip** through the real `KanbanBoardConfigurationEditor` — `laneOrder` survives
  as a string array, and an absent one reads as empty rather than failing the whole object.

Client, Vitest (`environment: 'node'`, so no element behaviour):

- **`orderLaneRows`** — the client half of the same rule, against the same cases as the server's, so
  the two cannot disagree about what an editor sees versus what renders.
- **`buildLanePreviewRequest`** — carries `laneOrder`, and omits it when empty.

**Manual verification** (needs a running site): confirm the unassigned lane is the first column; drag a
lane in Lane appearance and confirm the rows reorder, the order survives a reload, and the board renders
it; confirm a dragged lane keeps its colour; confirm a board configured before this change renders
unchanged apart from the unassigned lane moving.

## 5. What could go wrong

- **`laneOrder` is stored under an undeclared alias.** Same exposure as `laneContentTypeKey`: if
  Umbraco ever filtered configuration values against declared settings, both break together.
- **Two places implement the ordering rule.** The server orders what renders; the client orders what
  the editor shows. They are tested against the same cases, but a change to one still has to be made
  to the other — the cost of the editor not round-tripping through the server on every drag.
- **A reorder writes every lane's value.** `laneOrder` lists them all, so a board whose lane property
  has many options stores a long array. Harmless, but it means the stored configuration grows the
  first time anything is dragged.
- **Dragging an orphaned override does nothing visible.** It sorts among real lanes but has no lane to
  place, so its stored position only matters if the lane returns. Acceptable: hiding or pinning them
  would be more surprising than letting them sort.

## 6. Definition of done

The unassigned lane is the first column on every board, and the lanes after it appear in an order an
editor arranged by dragging in the data type — whatever produced them — with each lane keeping the
colour it had before the drag.
