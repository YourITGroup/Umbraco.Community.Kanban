# Enhancements backlog

Agreed but not built. Each entry records enough of the *why* and the *where* to be picked up cold.
Design decisions live in `docs/superpowers/specs/`; this file only tracks intent and priority.

---

## Done: Contentment lane source (milestone 6, built ahead of 3)

**Built 2026-07-29**, from
[its design](superpowers/specs/2026-07-28-contentment-lane-source-design.md). The
`Umbraco.Community.Kanban.Contentment` package resolves lanes from any Data List data source through
Contentment's `IContentmentDataSource`, so a board can group by a booking's `status` without the
"Define lanes manually" toggle duplicating the enum by hand.

One limitation carried forward and documented in the package README: data sources that resolve
relative to the current node (*Umbraco Content Property Value*, the XPath source) produce no lanes,
because Contentment's own editor endpoint sets a content context that lane resolution has none of.
Wiring `IContentmentContentContext` in is possible — it is public — and remains backlog.

---

## 1. Open a card in the workspace modal

*Related: items 5, 6 and 8 all open the same modal; build 1 and 5 together.*


Clicking a card's title should open that document in the infinite editor, rather than the board being
a dead end that forces a trip through the content tree to edit anything.

Most of the wiring exists. `UmbCommunityKanbanCardElement` already dispatches
`kanban-card-clicked` with the card's key on click — nothing listens to it yet. The host
(`hosts/collection-view-board.element.ts`) is where it should be handled, using the same
`UmbModalRouteRegistrationController` pattern this package now uses twice for the data type workspace,
with the document workspace modal token and core's exported edit path pattern instead of the data
type ones.

Two things to settle when it is built:

- **The click target.** The whole card is currently `role="button"`; a card that opens on any click
  will fight drag-and-drop once milestone 3 lands. The title alone is the safer target.
- **Refresh on close.** A card edited in the modal needs its lane and summary properties re-read. The
  collection's `items` observable already drives reloads, so a save may cover this for free — worth
  checking rather than assuming.

## 2 & 3. Card properties as List View columns — **done 2026-07-29**

Both items are built, from
[their design](superpowers/specs/2026-07-29-card-properties-columns-design.md): card properties now
store alias, header, label template and a system flag, are edited with the List View's own column
control, drag to reorder, render label templates through `umb-ufm-render`, and default a new board to
the created and updated dates.

Two things recorded here turned out to be wrong and are corrected in the design:

- Item 2 said core's element "is not a public export ... under `dist-cms`". The *property editor* is
  not, but every part it is built from is: `UmbSorterController`, `umb-ufm-render` and
  `UmbCollectionColumnConfiguration` are all public.
- Item 3 called itself "blocked on system property support". It was — that support is what this work
  added, reading the five fields off `IContent` rather than through `IKanbanPropertyDataTypeLookup`,
  which is deliberately not involved.

## 4. Default to `icon-columns`, not `icon-grid`

A Kanban board is columns, not a grid, and `icon-grid` is already the visual language of Block Grid
and the Grid layout. Four places carry it, and they should change together so the package reads
consistently in the tree, the layout picker and the data type list:

- `property-editors/board/manifests.ts` — the property editor UI's `meta.icon`
- `hosts/manifests.ts` — the collection view's icon, the one in the layout switcher
- `workspace-views/manifests.ts` — the Kanban tab's icon
- `workspace-views/data-type-kanban.element.ts` — the chosen configuration's ref-node icon

`tabIcon` defaults are unaffected: they are per-configuration values an editor chooses, and only
appear as `icon-grid` in test fixtures.

## 5. Creating a child under a card opens it in the workspace modal

The sibling of item 1: creating, rather than editing. A new child of a card should open in the same
infinite editor instead of navigating away.

No document workspace modal token exists in v18 — the generic `UMB_WORKSPACE_MODAL`
(`{entityType, preset}`) is what serves this, driven to core's exported
`UMB_CREATE_DOCUMENT_WORKSPACE_PATH_PATTERN` (`create/parent/:parentEntityType/:parentUnique/:documentTypeUnique`).
Note the document type is part of the path, so the caller must decide it before opening: with more
than one allowed child type, that means asking first, the way the tree's create action does.

Build this together with item 1 — they share the registration and differ only in the path.

## 6. Child items listed on a card

A minimal list per card: icon, name, and an edit button opening the child in the workspace modal
(item 1 again). Enough to see a booking's line items without leaving the board.

Open questions, all of which shape the endpoint rather than the element:

- **Where the children come from.** `GET /board` returns cards for one parent; children of each card
  are a second level it does not fetch. Either extend the card model with a small, capped child list
  (one query per board, at the cost of a heavier payload for boards that never show them) or add a
  per-card fetch (lazier, but N requests for a full lane).
- **Which children.** All child types, or a configured subset? A booking's children may be a mix.
- **Whether it is configurable at all.** A card list is noise on boards whose cards have no
  meaningful children, so this likely wants a board setting rather than being unconditional.

## 7. Board configuration picker: match core's picker styling

The picker built on 2026-07-28 stacks its buttons in a column, which does not look like anything else
in the backoffice. It should read like the Collection and "Allowed child node types" fields do:

- **Chosen:** a ref row with the name and editor alias, actions (**Choose**, **Remove**) at the right.
- **Empty:** a **full-width** dashed placeholder **Choose** button, with **Create** appended to its
  end as a sub-button — one control, not two stacked ones.

`uui-button-group` is the mechanism for the split; the current `.editor` column flex and its
`--uui-size-space-3` gap go away.

Worth weighing while doing it: `UMB_DATA_TYPE_PICKER_MODAL` accepts a `createAction`
(`UmbTreePickerModalCreateActionData`) — core's own way of offering *create* from **inside** a picker,
which the document type picker token uses. That would move the create action into the modal instead of
appending it to the Choose button. It is more conventional, and it is not what was asked for; whoever
builds this should pick deliberately rather than discover the option late.

## 8. Add a card from the top of a lane

*Nice to have.* An add panel at the head of each lane, creating a content item with the lane property
already set to that lane's value — so "add to Confirmed" is one action rather than create-then-edit.

Depends on item 5 (create in the workspace modal) and needs one thing verified first: whether a
document's property values can be preset. `UMB_WORKSPACE_MODAL` takes a `preset`, and
`entity-detail-workspace-base` applies it as `{...scaffold, ...preset}` — a **top-level spread**, so a
preset `values` array replaces the scaffolded one outright rather than merging into it. Presetting one
property therefore means constructing the whole `values` array, and the culture/segment of the entry
has to be right for a varying document. Prove that on a real document type before designing the panel.

Also unsettled: the unassigned lane has no value to preset, and a manual lane's value may not be a
legal value for the property at all (nothing validates manual lanes against the editor's options), so
this needs to degrade to a plain create rather than write something the property will reject.

## 9. Grab the board to pan it sideways

Click-and-hold on the board background, drag, and the board scrolls sideways with the pointer — so a
board with more lanes than fit is navigable without hunting for a scrollbar or shift-scrolling.

The container is already right: `.lanes` in
[core/kanban-board.element.ts:143-149](../src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts#L143-L149)
is a flex row with `overflow-x: auto`, so panning is `scrollLeft` arithmetic on pointer moves. Use
Pointer Events with `setPointerCapture`, not mouse events — a capture keeps the drag alive when the
pointer leaves the element, and it makes trackpads and touch work without a second code path.

**The whole difficulty is telling a pan from the interactions already on the board**, and it gets
harder with every item above:

- **Cards are `role="button" tabindex="0"` with a click handler**
  ([kanban-card.element.ts:61](../src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts#L61)),
  and item 1 makes that click open the workspace modal. A pan that starts on a card must not open it.
  The usual resolution is a movement threshold — a few pixels before the gesture becomes a pan, and
  suppressing the click only once it does.
- **Milestone 3 gives cards their own drag**, which is a direct conflict: the same gesture on the same
  pixel means two things. The clean split is that a pan starts only on the background — lane gutters,
  the space below the cards — and never on a card. Worth deciding before milestone 3 rather than
  retrofitting afterwards, since it constrains where a card's drag handle can live.
- **Lane headers and load-more buttons** are also interactive and want the same threshold treatment.

Two smaller things to get right: leave keyboard and scrollbar scrolling alone (this is additive, not a
replacement), and set `cursor: grabbing` plus `user-select: none` only for the duration of a live pan,
or text selection fights the drag on every board.
