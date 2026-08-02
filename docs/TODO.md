# TODO

What the [design](superpowers/specs/2026-07-28-umbraco-community-kanban-design.md) called for, checked
against what actually exists in the repo today, broken down by the design's own milestone numbering
(§8), plus every ad-hoc enhancement built or backlogged along the way (formerly tracked in
`ENHANCEMENTS.md`, now merged in here — that file no longer exists). Design decisions themselves still
live in `docs/superpowers/specs/`; this file tracks status and intent.

Two numbering schemes coexist in this repo and are easy to conflate:
- **Design milestones 1–6** (§8 of the design) — the numbering below.
- **Plan filenames** like `2026-07-30-milestone-3-drag-write-back.md` and
  `2026-07-31-milestone-4-canvas-and-drag-ghost.md` — these are work packages named in the order they
  were *built*, not in design order. The "milestone 4" plan (canvas + drag ghost) is unrelated to the
  design's milestone 4 (calendar), which remains unbuilt — see below.

Build order note from the design still applies: milestone 6 (Contentment) was deliberately built ahead
of 3, and is done.

---

## Milestone 1 — Package skeleton, both configuration property editors, `GET /configurations` ✅ Done

Both `Umbraco.Community.Kanban.Board` and `…Calendar` property editors exist
(`src/Umbraco.Community.Kanban/PropertyEditors/`), `GET /configurations` is implemented
(`ConfigurationsController.cs`), and configuration round-trip is covered by
`KanbanConfigurationRoundTripTests`.

## Milestone 2 — Read-only board via the collection view host ✅ Done

`Umb.Community.Kanban.CollectionView.Board`, the Data Type workspace view for picking a configuration,
and lane resolution (core list editors + manual lanes + Contentment) are all in place.

## Milestone 3 — Drag write-back, pending state, publish-all ✅ Done, two verifications outstanding

**Built 2026-07-30.** `PUT /card/{key}/lane` (save-only, so a drag stays reversible until published),
optimistic move with revert-on-failure, pending-state badges, and a "Publish pending changes" action
are built and covered by tests. Two scope lines were deliberate rather than discovered:

- **Publishing has no server endpoint.** It loops Umbraco's own `UmbDocumentPublishingRepository`
  client-side, one call per card, because core's document list-view bulk publish does exactly that and
  has no bulk endpoint behind it either.
- **"Pending" means loaded.** `pendingCards` filters what the board is holding in memory, the same way
  core's bulk action is scoped to its own selection. A card in an unpaged lane page, or beyond the
  board's truncation cap, does not count until it is paged in.

Three paths were only ever exercised by unit test, never by hand in a browser:

- [x] **Per-card permission gating.** Was already fully implemented and tested end-to-end before this
  entry was written — `KanbanBoardService.ComposeAsync` filters Update permission per card
  (`KanbanBoardService.cs:92,110`), proven with mixed permissions in a real service-level test
  (`KanbanBoardServiceTests.cs:254-260`), and `card.canUpdate` already gated the client's `draggable`
  class and `shouldStartCardDrag`. What was missing was an affordance: a permission-denied card gave no
  visible sign *why* it wouldn't drag beyond the grab cursor silently not appearing. Added
  `dragDisabledReason` (`core/drag.model.ts`) plus a lock/block icon with a tooltip in the card header
  (`kanban-card.element.ts`), distinguishing "this board has dragging off" from "you can't move this
  card". Covered by new tests in `drag.model.test.ts`; build and full suite (264 tests) pass. Still
  needs hand-verification against a real restricted user in the backoffice, to see the new icon appear.
- [x] **`allowDrag: false` end-to-end.** Already fully covered by the same code path as the permission
  item above — no separate gap. Server: `KanbanCardServiceTests.cs:163-168` proves `AllowDrag = false`
  returns `DragNotAllowed` (400 "Dragging is disabled", `CardController.cs:38`). Client:
  `shouldStartCardDrag` already refused to start a drag when `allowDrag: false`
  (`drag.model.test.ts:28`, pre-existing), and the disabled-drag affordance just added for permission
  gating uses the same `dragDisabledReason` → `'boardDisabled'` branch for this case, so a board with
  drag off already shows the same lock/block icon and tooltip. Still needs hand-verification against a
  real board configured with dragging off, alongside the permission-gating check above.
- [ ] **Publish partial-failure path.** Confirm the toast/behaviour when publishing N cards and one
  fails — no bulk endpoint exists to fail atomically, so this is a real path, not a hypothetical.

### Board canvas, equal-height lanes, drag ghost (informally "milestone 4" in this repo's plan
filenames — not the design's milestone 4) ✅ Done

**Built 2026-07-31**, from
[its design](superpowers/specs/2026-07-31-milestone-4-canvas-and-drag-ghost-design.md). The board now
owns a bounded `.viewport` wrapping a content-height `.canvas`, so every lane is as tall as the fullest
one and a drop target is a whole column instead of the 82px stub an empty lane used to report. The
dragged card follows the cursor as a full-fidelity ghost, holding a canvas edge auto-scrolls, and
Escape abandons a drag. A board-level Undo (repeatable, last-move-first) and a relocated full-width
action bar (replacing the list view's own selection bar in the layout's footer slot) were added as
follow-up fixes during hand-verification.

What this fixed, and what it cost, kept for anyone re-deriving this area cold:

- **The real milestone-3 bug was geometry, not logic.** Hand-verification found an empty lane reporting
  a rect of 82px against a full lane's 8032px. `laneAtPoint` was correct all along; the rects it was
  given were the problem.
- **Two elements, not one.** `align-items: stretch` on a *bounded* container stretches items to the
  visible height and clips the fullest lane. Equal heights measured against the tallest lane need the
  flex container to be content-height, nested inside the bounded scroller — so `.viewport` and `.canvas`
  cannot be the same element.
- **The drop target is computed per frame, not per pointer event** — auto-scroll moves lane rects while
  the pointer holds still, so a move-driven hit-test would go stale mid-gesture.
- **The board is sized to its container, not the window.** The workspace footer holding Save sits below
  the collection's container, so measuring `window.innerHeight` overhung it — 54px in a real layout —
  and grew a second scrollbar. The container is found by climbing ancestors and ignoring the boxless
  `router-slot` wrappers, whose percentage heights are the same broken chain that stops CSS sizing.
- **A lane must fill its stretched host.** `align-items: stretch` sizes the lane *host*; the `.lane` box
  inside its shadow root kept its own content height, so an empty lane's sticky header had only 82px to
  stick within.
- **One change reaches beyond the board.** The document collection's manifest is re-registered at
  startup with its `element` swapped for `umb-community-kanban-document-collection`, so a Kanban view
  can hide the list view's pager and selection-action bar — neither can act on anything a board shows.
  The swap keeps core's own `api` and `meta` references untouched (that `api` is the non-public
  `UmbDocumentCollectionContext` and carries real behaviour: display-culture sequencing and
  `requestItemHref`). Every other view is unaffected — suppression is gated on the showing view's alias
  via `isChromelessCollectionView`, which is where the calendar view opts in later.

- [x] **Hand-verify the relocated action bar** in a real browser: spans full width in the native bar's
  position; Publish and Undo both work from the footer; switching to a plain list view still shows the
  **native** pager and selection bar (chrome suppression is view-gated, not global); no new scrollbar
  appears the moment the bar shows up during a drag.

## Milestone 4 — Calendar views ✅ Built 2026-07-31 (re-scoped read-only, extended)

Built from [its design](superpowers/specs/2026-07-31-calendar-views-design.md), which re-scoped the
milestone with the user: **read-only** (no `PUT /card/{key}/date`, no drag-to-reschedule — the
master design's reschedule ideas are dropped, not deferred), but extended with a time-gridded week
view, categories, and slot-click creation. Delivered:

- `GET /calendar` (`CalendarController` + `KanbanCalendarService`, board-identical pipeline) with
  inclusive range, undated count, truncation flag, categories resolved through the lane pipeline.
- `KanbanCardDateReader`: every date editor family (legacy DateTime object, the four modern
  `{date, timeZone}` JSON editors, plain-string fallback) plus `updateDate`/`createDate`. A bare wall
  clock reads **as stored**; a value that states its own zone also carries its moment, which the
  client places in the viewer's zone so the grid agrees with the card's own property row (see
  `viewer-time.model.ts`). Midnight reads as date-only (all-day).
- Configuration gains `endDateProperty` (spans; 1h nominal fallback), `categoryProperty`,
  `categoryManualValues` + `categoryOverrides` (lane machinery + precedence reused); calendar
  `cardProperties` now uses the board's card-properties editor (converter keeps old bare arrays).
- Pure tested client models: `calendar.model.ts` (month grids across leap/boundary/week-start
  cases), `overlap.model.ts` (transitive clustering, category-ordered columns, block geometry),
  `date-preset.model.ts` (per-editor create-preset values).
- Elements: `kanban-calendar` (month↔week toggle persisted, prev/today/next, undated/truncation/
  error notes, agenda per `showAgenda`), `kanban-month-grid` ("+N more", ellipsised chips with
  category accents), `kanban-week-grid` (hour axis, all-day strip, overlap columns),
  `kanban-agenda` (overlaps side-by-side).
- All three hosts: `umb-community-kanban-standalone-calendar` exported from the importmap module
  (config-id optional — the server resolves `kanban.calendarConfigId` from the collection data
  type when absent); a Calendar collection view; per-configuration workspace tabs (the Calendar
  skip in the workspace-view model is gone). The data type Kanban tab now also picks/creates the
  calendar configuration.
- Slot-click creation: empty month day / week hour opens core's create flow (item-picker for
  type/blueprint when several) with the date property preset via `modalContext.data.preset`;
  disabled for system date properties.

Needs hand-verification: month/week render + navigation + toggle persistence, agenda overlap
columns, category colours/icons, "+N more", undated note, slot-create presets per editor family
(legacy, date+time, with-timezone), calendar layout on a collection, calendar tab via `appliesTo`,
and a board regression pass (shared workspace-view model changed).

## Milestone 5 — Content app host and real-time sync ✅ Done (5a real-time, 5b content app, injected host — all 2026-07-31)

- [x] **Real-time sync (5a).** Built 2026-07-31 from
  [its design](superpowers/specs/2026-07-31-realtime-board-sync-design.md). `GET /card/{key}` answers
  what a document is on this board now; `applyCardResult` (core/realtime.model.ts) folds it in;
  `KanbanRealtimeController` subscribes to `UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT` (the public 18.x
  token — the parent design's `UMB_SERVER_EVENT_CONTEXT` name was stale), coalesces in-flight keys,
  queues events mid-drag (latest-per-key), and triggers a full reload on hub reconnect. Changed cards
  pulse for ~2s (`prefers-reduced-motion` gets a steady border tint instead). Needs hand-verification
  with two browser sessions: move/save/trash/delete/create in one, watch the other.
- [x] **Content-app host (5b).** Built 2026-07-31 from
  [its design](superpowers/specs/2026-07-31-content-app-host-design.md). The entry point fetches
  `GET /configurations` at startup and registers one `workspaceView` per board configuration
  (`boardWorkspaceViewManifests`, pure and tested), gated on `Umb.Workspace.Document`, a saved
  document, and a new `DocumentTypeApplies` condition matching the document's content-type **key**
  against `appliesTo`. One shared element serves every tab via `meta.kanbanConfigId`; the
  Publish/Undo bar was extracted to `core/kanban-action-bar.element.ts` and overlays the tab's foot.
  Calendar-kind and empty-`appliesTo` configurations register nothing. Needs hand-verification:
  tab appears/labels/routes per configuration, two configurations on one type give two tabs, no tab
  on unlisted types or unsaved documents, publish/undo from the tab, collection view bar unchanged.
- [x] **Host #3 (injected).** Built 2026-07-31 from
  [its design](superpowers/specs/2026-07-31-standalone-board-host-design.md). The importmap module
  (`@umbraco-community/kanban`) now exports `UmbCommunityKanbanStandaloneBoardElement`
  (`hosts/kanban-standalone-board.element.ts`): `<umb-community-kanban-standalone-board parent-id
  config-id .culture>` carries the datasource, actions context, Publish/Undo bar with measured
  bottom inset, and workspace-modal wiring; the 5b workspace-view host is now a thin wrapper around
  it. First consumer: the your-it-team-cloud Bookings "Reservations" workspace. Needs
  hand-verification there (board loads, drag, publish/undo, open card) plus a regression check that
  existing document workspace tabs still behave after the wrapper refactor.

## Milestone 6 — Contentment Data List lane source package ✅ Done

**Built 2026-07-29**, ahead of milestone 3 per the design's build-order note, from
[its design](superpowers/specs/2026-07-28-contentment-lane-source-design.md). The
`Umbraco.Community.Kanban.Contentment` package resolves lanes from any Data List data source through
Contentment's `IContentmentDataSource`, so a board can group by a booking's `status` without the
"Define lanes manually" toggle duplicating the enum by hand.

- [ ] **Carried-forward limitation.** Data sources that resolve relative to the current node
  (*Umbraco Content Property Value*, the XPath source) produce no lanes, because Contentment's own
  editor endpoint sets a content context that lane resolution has none of. Wiring
  `IContentmentContentContext` in is possible — it is public — and remains backlog.

---

## Other shipped enhancements (history, not gaps)

Smaller pieces of work that landed outside the design's own milestone list.

### Cards sort by a configured field — done 2026-08-03

The board read its children with no ordering at all, so cards were always sort order ascending no
matter what the data type said — only *child items* had a configurable order. `cardSortBy` /
`cardSortDirection` now sit alongside them on the board configuration, map through the same
`KanbanChildOrdering` helper, and are applied in the `GetPagedChildren` call — in SQL, before the
child cap — so the order survives grouping, lane paging and truncation. Defaults are sort order
ascending, which is what the read used to hard-code, so no existing board changes. The calendar
passes the same default explicitly: it places items by their date property, so read order only
decides what the cap keeps.

### Lanes from picked documents, and "group source" — done 2026-08-01

Two changes, one vocabulary.

`ContentInstanceGroupSource` resolves lanes/categories from the documents a picker property is
restricted to: a "Resource" content picker (or multi node tree picker) accepting "Meeting Room" gives
a lane per room, named after the document and badged with its type's icon. A group's value is the
document's UDI, because that is exactly what the picker stores on the card — anything else would match
no card, and it is also what a drag writes back. `IContentService` sits behind the
`IKanbanContentInstanceLookup` seam, so the source's rules are tested against a fake. Deliberate
limits, all covered by tests: an *unrestricted* picker offers nothing rather than the whole site;
trashed documents are excluded but unpublished ones are not; 200 groups maximum, logged when it bites;
media/member-rooted tree pickers are ignored.

The extension point it plugs into was renamed at the same time: `Lanes/` → `Grouping/`, and
`IKanbanLaneSource` → `IKanbanGroupSource.GetGroupsAsync`, along with the model and pipeline it feeds
(`KanbanGroup`, `KanbanManualGroup`, `KanbanGroupOverride`, `KanbanGroupResolver`). It never was
lane-specific — a calendar has always reused it for categories — so naming it after one of its two
consumers made that reuse read like a workaround. Persisted configuration keys (`laneSource`,
`laneProperty`, `manualLanes`, `laneOverrides`, `laneOrder`), the wire contract (`KanbanLaneModel`, the
board response's `lanes` array) and the board's own client-side lane elements were all left alone, so
nothing a site has saved needs migrating; only a third-party source implementing the old interface
needs the new name.

- [ ] **Needs hand-verification.** A board grouped by a restricted content picker: lanes appear per
  document with the right names/icons, cards land in the right lane, dragging between lanes writes the
  picker value and survives a reload, and the lane appearance editor's preview lists the same lanes.
  Same again for a calendar's category property.

### Cards open, list their children, and create them — done 2026-07-29

From [their design](superpowers/specs/2026-07-29-card-workspace-modal-and-child-items-design.md). A
card's title opens its document in the workspace modal; each card lists its children with an edit
button that opens the same modal; an **Add** button creates a child there too, replicating the create
action's own type-then-blueprint choice; the package's icon is `icon-columns` everywhere. All three end
in the same modal, opened from one `UmbModalRouteRegistrationController` on the board host. Notably: a
save does **not** refresh the card "for free" through the collection's `items` observable (the
collection context is never told a document was saved in our modal), so the host reloads the board from
the modal's `onSubmit` instead. Children come from one level-filtered `GetPagedDescendants` call per
board rather than per-card, gated on a `showChildItems` board setting with configurable sort
property/direction.

### Card properties as List View columns — done 2026-07-29

From [their design](superpowers/specs/2026-07-29-card-properties-columns-design.md). Card properties
store alias, header, label template and a system flag, are edited with the List View's own column
control, drag to reorder, render label templates through `umb-ufm-render`, and default a new board to
the created and updated dates. Built on public parts (`UmbSorterController`, `umb-ufm-render`,
`UmbCollectionColumnConfiguration`) rather than the (non-public) List View property editor itself.

### Grab the board to pan it sideways, then vertically — done, closed by the canvas work above

**Built 2026-07-29**, from
[its design](superpowers/specs/2026-07-29-board-pan-to-scroll-design.md). Dragging the board's own
background — never a card, never a lane — scrolls it sideways with the pointer, via a single
`event.target === event.currentTarget` check on `.lanes` and Pointer Capture retargeting. Touch is
untouched: `.lanes` already swipe-scrolls natively.

A same-day attempt to also pan vertically, from
[a follow-up design](superpowers/specs/2026-07-29-board-pan-vertical-design.md), did not work and was
reverted: it walked up through parent elements looking for whatever ancestor already owned vertical
scrolling, but in the real Collection View host that ancestor is a plain `#main` div sealed inside
`umb-body-layout`'s own shadow root — reachable only by climbing *past* that component as a host
element, never by looking *into* its shadow content — so the walk always found nothing.

**Closed by the milestone-4 canvas work**, which gave the board its own bounded, scrolling `.viewport`
instead of borrowing an ancestor's, so vertical pan needed no shadow-piercing walk at all.

Of two open questions this left, one has since been answered: a **fixed-transform 2D pan/zoom canvas**
was considered and deliberately not chosen in favour of the simpler self-scrolling box, and zoom was
noted as costing more for it, since the ghost, hit-test and auto-scroll all work in viewport coordinates
a canvas transform would invalidate. Zoom was built in the end without paying that cost, by using CSS
`zoom` instead of a transform — see the ctrl + wheel item below. Whether controls rendering below the
board need a reserved buffer has not come up in practice.

---

## Known issues

- [x] **A board on a hard reload could not be scrolled sideways, and showed no scrollbars until
  something was resized.** Reported 2026-08-01 from the Bookings "Reservations" content app.
  Root cause: the viewport's height is measured in JS, and the only things that triggered a
  re-measurement were this element re-rendering and a `window` resize. On a hard reload the workspace
  chrome around the board resolves *after* the board's last render, so the measurement ran while no
  ancestor yet qualified as its container (no definite height, or a zero `clientHeight`).
  `boardAvailableBottom` then fell back to the window — behaviour its own test already pinned — and the
  board was sized taller than the region it sits in. Its bottom edge, and with it the horizontal
  scrollbar belonging to `.viewport`, sat below the visible area: hence "no scrollbars" and no way to
  scroll sideways, until resizing anything finally re-ran the measurement against a settled layout.
  **Fixed** with a `ResizeObserver` (`#resizeObserver` in `core/kanban-board.element.ts`) over this
  element and the ancestor chain the measurement reads, re-pointed after each render only when the chain
  actually changes, coalesced to one measurement per frame. It cannot feed itself: the wrappers whose
  size the board's own height changes are exactly the ones `boardAvailableBottom` filters out, and
  `#measureViewport` assigns only on a change of a pixel or more. The ancestor walk was factored into
  `#ancestorChain()`, now shared by the observer and `#ancestorBoxes()`.
  - Verified by `tsc --noEmit`, 356 Vitest tests and `vite build`. The arithmetic was already covered;
    the bug was in *when* it ran, which Vitest cannot reach with no DOM, so **this one needs a browser
    check**: hard-reload a content-app board and confirm it can be scrolled sideways with no resize.
- [x] **Card title click no longer opens the content item — grab/move takes precedence and blocks it.**
  Root cause: `#onPointerDown` (`core/kanban-card.element.ts`) didn't exclude the title button as a
  target, so a click on the title started pointer capture and a drag gesture like anywhere else on the
  card; the first `pointermove` set `#moved = true`, and `#onOpen` swallowed the click as if a drag had
  completed. **Fixed** by adding `isCardDragBlockingPath` (`core/drag.model.ts`), which walks the
  pointerdown's composed path — mirroring `pan.model.ts`'s `isPannablePath` — and refuses to start a
  drag when the path passes through a `button`/`uui-button`/`a`/`input`/`textarea`/`select`, including
  ones inside `<umb-entity-actions-bundle>`'s own shadow tree. Wired in as `shouldStartCardDrag`'s new
  `blockingTarget` input. Covered by new tests in `drag.model.test.ts`; `tsc --noEmit`, `vite build` and
  the full Vitest suite (259 tests) all pass.

## Open backlog items

- [x] **Hide individual lanes or calendar categories from the configuration.** ✅ **done 2026-08-01.**
  An eye toggle per row in the existing appearance editor — which the calendar's category settings
  already reuse, so both got it from one change — storing `hidden` on the same override row that carries
  colour/icon/label. `hidden: false` is treated as saying nothing, so un-hiding a lane leaves no residue
  behind.
  - **Hiding takes the contents with it.** A hidden lane drops its cards; a hidden category drops the
    items carrying it. The alternative — dropping only the lane — would have been worse than useless:
    the composer routes a card whose lane value matches nothing into Unassigned, so hiding a lane would
    have *tipped its cards into Unassigned* rather than hiding them. Grouping therefore still runs
    against every lane, hidden included, and hidden lanes are removed afterwards; a card whose value
    genuinely matches nothing still lands in Unassigned, which is covered by a test so the distinction
    cannot quietly regress.
  - `Hidden` deliberately flows all the way through the resolver rather than being filtered where it is
    first known, because the configuration UI resolves groups through that same pipeline and has to list
    a hidden group in order to offer un-hiding it. Only the board composer and calendar service act on
    it, and the preview DTO carries it so the toggle can show its state.
  - Calendar detail worth knowing: categories are now resolved *before* the items, since a hidden
    category has to be known before the item cap counts what is shown — and an item dropped for being
    hidden is not also counted as undated.

- **Board/calendar configuration picker styling: partially done.** The picker built 2026-07-28 originally
  stacked its buttons in a column, unlike anything else in the backoffice; it now uses the same
  ref-row/dashed-placeholder pattern as the Collection and "Allowed child node types" fields (a ref row
  with name + editor alias and **Choose**/**Remove** actions when set, a full-width dashed **Choose**
  button when empty). Both related editors have since had the same treatment:
  - [x] **Manual lanes editor** ✅ **done 2026-08-01.** The row shell both appearance editors share now
    lives in `property-editors/settings-row.styles.ts` (`.row`, `.identity`, `.drag-handle`,
    `.actions`) rather than being written twice; the colour swatches were already shared through
    `lane-colour.element.ts`. The manual editor gained the icon button the appearance editor has —
    `KanbanManualGroup.Icon` and its client mirror always carried an `icon`, and `ManualGroupSource`
    always passed it through, so the editor simply never offered it — and its move/remove glyphs became
    real icons in a grouped action bar. The shared rule deliberately sizes `.identity` only, imposing
    no `display`, because in this editor the identity is a `uui-input` whose host is the containing box
    for its own shadow content.
    - Reordering here stays button-driven rather than adopting `UmbSorterController`. A sorter needs a
      stable unique per row, and these rows have none: their identity is the value being typed, blank
      on a new row and briefly duplicated while one is edited. Object identity is no better — every
      keystroke rebuilds the row objects. Order is load-bearing (it picks each uncoloured lane's
      palette colour), so it keeps the mechanism that cannot mis-key rows.
  - [x] **Lane property editor** ✅ **done 2026-08-01.** Compared against core's `umb-input-document`
    first, as this item asked. Three real differences, all now closed: the chosen item sits in a
    `uui-ref-list` (which core styles as a list, and which is what gives the row its correct margins),
    the remove button is a bare labelled button in the `uui-action-bar` rather than one with duplicate
    slot text, and the placeholder button is `display: block` so it fills the field like every other
    picker's. The hardcoded `icon-settings` cog is now the picked document type's **own** icon, read
    from the item repository that was already being called for its name (`UmbDocumentTypeItemModel`
    carries `icon`), falling back to `icon-document`. Two differences from core remain and are
    deliberate, noted in the element: there is only ever one value, so the ref node is always
    `standalone` and the placeholder button disappears once set; and the row re-opens the picker on
    `@open` rather than navigating, a property alias having nowhere to navigate to.
  - Also on record for this picker but not yet acted on: `UMB_DATA_TYPE_PICKER_MODAL` accepts a
    `createAction` (`UmbTreePickerModalCreateActionData`) — core's own way of offering *create* from
    **inside** a picker, which the document type picker token uses. That would move the create action
    into the modal instead of appending it to the Choose button as a `uui-button-group`. It is more
    conventional and is not what was originally asked for; whoever revisits this should pick
    deliberately rather than discover the option late.
- [ ] **Add a card from the top of a lane.** *Nice to have.* An add panel at the head of each lane,
  creating a content item with the lane property already set to that lane's value — so "add to
  Confirmed" is one action rather than create-then-edit. Nothing blocks it structurally now that both
  drag and the create-in-modal work exist, but one thing needs proving first: whether a document's
  property values can be preset. `UMB_WORKSPACE_MODAL` takes a `preset`, and
  `entity-detail-workspace-base` applies it as `{...scaffold, ...preset}` — a **top-level spread**, so a
  preset `values` array replaces the scaffolded one outright rather than merging into it. Presetting one
  property therefore means constructing the whole `values` array, with the right culture/segment for a
  varying document. Also unsettled: the unassigned lane has no value to preset, and a manual lane's
  value may not be a legal value for the property at all (nothing validates manual lanes against the
  editor's options), so this needs to degrade to a plain create rather than write something the
  property will reject.

- [x] **Only show the Unassigned lane if the lane property is optional and has children.** ✅ **done
  2026-08-01.** It is a synthetic lane nobody configured and nothing can be dropped into, so an empty one
  was a column of dead space on every board whose cards all have a value.
  - **Cards decide it, in the composer** (`ShowsUnassigned` in `KanbanBoardComposer`), not the resolver:
    the resolver has to keep producing the lane regardless, because it is the bucket the grouping step
    routes unmatched values into. Any card grouped into it keeps the column, so nothing visible is ever
    hidden.
  - That includes the case the literal rule would have got wrong: a **mandatory** lane property only rules
    out an *empty* value, while a value the lanes no longer offer (a removed dropdown item, a renamed lane)
    still lands in Unassigned. Hiding the lane then would have lost those cards off the board entirely, so
    the lane stays whenever it holds cards, mandatory or not. Covered by a test.
  - Mandatory is therefore load-bearing in exactly one case — **truncation**, where the read window stops
    short of the children that would have filled the lane and the cards cannot decide. An optional property
    keeps the empty lane (unassigned cards are ordinary, and likely past the window); a mandatory one drops
    it, unmatched values being too rare to reserve a column for on a guess.
  - The flag travels `IPropertyType.Mandatory` → `KanbanPropertyDataType.Mandatory` →
    `KanbanGroupResolution.LanePropertyIsMandatory` → `KanbanBoardComposerRequest`. Read from the *property
    type*, not the data type, since mandatory is set per property and the same data type may be optional
    elsewhere. It is false whenever there is no usable lane property to ask about (none configured, or one
    that no longer resolves), so a board with nothing to go on keeps the lane.
  - The lane-preview DTO the configuration UI reads deliberately still lists Unassigned: the editor is
    choosing lanes there, not looking at cards, and the appearance editor already excludes it from
    overrides.

### Requested 2026-08-01 (not yet designed)

- [ ] **A "Day" view: one day, laid out like the week view.** Overlapping cards side by side. Most of
  this already exists: `overlap.model.ts` (`layoutSpans`) already gives overlapping items their columns
  per day, and `kanban-week-grid.element.ts` already renders an all-day strip over 24 hour rows — a day
  view is that grid with a single column. The work is in `kanban-calendar.element.ts`: add `'day'` to
  `KanbanCalendarView`, give `#range` a single-day range, step `#navigate` by ±1 day, and title it as a
  date rather than a month. Note the stored-view fallback (`#effectiveView`) and the reload key already
  key on the fetched range, so both should cope; and `VIEW_STORAGE_KEY` is shared across every calendar,
  so a stored `'day'` must degrade like `'agenda'` does today.
- [x] **Calendar cards should have a white background.** ✅ **done 2026-08-01.** Month chips, week
  blocks and all-day chips, and agenda entries now use `--uui-color-surface`. White-on-white did need
  the border to carry the work, as suspected: the month chip and the week all-day chip both had
  `border: none` and are now bordered, and every card keeps `border-inline-start` declared *after* the
  shorthand so the category accent still overrides that one edge. Hover stays
  `--uui-color-surface-emphasis`, which still reads as a change from white.
- [x] **Zoom the board with Ctrl + mouse wheel.** ✅ **done 2026-08-01.** `core/zoom.model.ts` holds the
  arithmetic (gesture test, wheel-unit normalisation, the scale step, the pointer anchor) and
  `kanban-board.element.ts` holds the one `wheel` listener and a `_zoom` state driving the canvas.
  - **CSS `zoom` on the canvas, not a `transform: scale`** — which is what let this cost far less than the
    milestone-4 note above predicted. `zoom` scales *layout*: the canvas' scroll extent grows and shrinks
    with the scale, and `getBoundingClientRect` keeps reporting where lanes really are on screen, so the
    drag hit-test, the ghost and the edge auto-scroll all keep working in viewport coordinates with no
    changes at all. A transform would have left the scroll extent at 100% and moved every lane out from
    under those measurements.
  - Two details it does cost. The canvas' `min-width`/`min-height: 100%` resolve against the *unzoomed*
    viewport and are then multiplied by the zoom, so both divide it back out — otherwise a zoomed-out board
    stops short of the viewport (shrinking the background the pan gesture is grabbed from) and a zoomed-in
    one grows scrollbars it does not need. And the ghost is `position: fixed`, so it sits outside the zoomed
    canvas and re-applies the scale to an inner box, with its width divided by the zoom: `_drag.width` is an
    on-screen width, which inside a zoomed box would be multiplied again.
  - The step is **proportional** (an exponential of the wheel delta), so a notch in and the same notch out
    cancel out and the same notch does not feel coarse zoomed out and glacial zoomed in. Clamped to
    0.5–2. Line- and page-mode deltas are normalised to pixels, Firefox reporting lines.
  - Anchored on the pointer, so zooming in on a lane at the right of the board does not send it off-screen.
    The new scroll offsets are computed from the *old* scale — the pointer's canvas coordinate can only be
    recovered while the old scale is in effect — and applied after the re-render, since until the canvas has
    been laid out at the new scale the scroll extent is the old one and the assignment gets clamped.
  - `ctrlKey || metaKey`, so a trackpad pinch (which arrives as a ctrl-wheel event) zooms the board, and
    Cmd + wheel on a Mac zooms the board instead of the whole backoffice. `preventDefault` runs *before*
    the early return on an unchanged scale, or the browser would page-zoom at either end of the range.
    The listener is on the element rather than `.viewport` — a reload replaces the viewport — and is
    explicitly `{ passive: false }`, since a passive listener cannot preventDefault.
  - **The scale is not persisted**, unlike the calendar's view toggle: a zoom is a look at this board now,
    and returning tomorrow to a board someone left at half scale reads as a rendering fault rather than as
    a remembered preference.
  - 16 new Vitest cases cover the model. Nothing in the suite can see layout, so **this needs a browser
    check**: ctrl-wheel over a lane at the right of a wide board and confirm it stays under the pointer,
    then drag a card while zoomed out and confirm the ghost matches the card's size.
- [x] **1rem padding for both views as a Content App.** ✅ **done 2026-08-01.** In the hosts, as
  planned. The board could *not* take ordinary padding, though: it sizes its viewport in JS from its own
  top to the bottom of the window, so padding around it pushes the board past the bottom of its region —
  a mistake its own styles already record having made once. It turned out the board element already
  exposed `--kanban-viewport-padding`, which pads inside the border-box, JS-sized scroll container and
  so costs no height and leaves the scrollbars flush; nothing had ever set it. The content-app board
  host now sets it to `1rem`. The calendar is a plain block that measures nothing, so its host takes
  real `padding: 1rem`.
- [x] **1rem padding on the x-axis for both views in a List View.** ✅ **done 2026-08-01.** Same split:
  `--kanban-viewport-padding: 0 1rem` on the collection board host, `padding: 0 1rem` on the collection
  calendar host. Horizontal only, both because the collection already spaces the view vertically and
  because the board's styles record that a second full gutter doubled the list view's inset.
- [ ] **Optionally confirm a card move before committing it.** A board setting (so it needs a field on
  `KanbanBoardConfiguration` plus a row in `property-editors/board/manifests.ts`) that makes a drop ask
  before it writes. The interesting part is the interaction, not the dialog: the board currently commits
  optimistically and reconciles from the server, so a cancel has to put the card back where it came from
  without the reconciliation treating that as a second move. Core's `UMB_CONFIRM_MODAL` is the dialog.
- [x] **Sticky calendar date headings on scroll.** ✅ **done 2026-08-01.** Not purely a CSS change, for
  two reasons.
  - `overflow: hidden` on the week grid host (and the agenda's list) made each of them a *scroll
    container*, and a scroll container is what a sticky element sticks to — the headings would have
    stuck to a box that never scrolls, which looks identical to doing nothing. Both are now
    `overflow: clip`, which clips the rounded corners the same way but creates no scroll container, so
    the headings stick to the page. (Chrome 90+/Firefox 81+/Safari 16+.)
  - The month grid had no weekday headings to stick, so it got them: a sticky row whose labels are read
    off the first rendered week rather than a first-day-of-week setting, so they cannot disagree with
    the cells beneath them.
  - The week grid's two heading rows are wrapped in one sticky box rather than stuck individually,
    which avoids hard-coding the header row's height as the all-day row's offset. The agenda's date
    rail is sticky within its own day (`align-self: flex-start`, or it would stretch and have nothing to
    move within).
  - Needs a browser check: sticky depends on the whole ancestor chain, and nothing in the test suite
    can see layout.
- [x] **Sticky calendar toolbar on scroll.** ✅ **done 2026-08-01.** The month/week/agenda toggle and
  previous/today/next now stay visible while the grid scrolls, so the title never names a month you
  can no longer see. Two details make it work with the date headings above:
  - The headings were already sticky at `top: 0`, so a sticky toolbar would have covered them. The
    calendar measures its toolbar with a `ResizeObserver` and publishes the height as
    `--kanban-calendar-sticky-top` on its host; the three grids stick at that offset instead of `0`.
    Measured, not a constant, because the toolbar wraps at narrow widths — and a custom property
    because it inherits through shadow roots, so no grid needs to know the calendar element.
  - The toolbar's spacing below the buttons became `padding-bottom` rather than `margin-bottom`: a
    margin is transparent, so cards surfaced in the gap before sliding under the bar.
  - Same browser-check caveat as the headings above: nothing in the test suite can see layout.

## Non-goals (explicitly out of v1 per the design — not gaps)

- Custom SignalR hub, presence indicators, "who is editing" avatars
- Card reordering within a lane via `sortOrder` — deliberately deferred out of the canvas/drag-ghost work to its own spec (`2026-07-31-milestone-4-canvas-and-drag-ghost.md:24`); still needs that spec written
