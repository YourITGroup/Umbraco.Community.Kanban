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

Of two open questions this left, one remains genuinely open: a **fixed-transform 2D pan/zoom canvas**
was considered and deliberately not chosen in favour of the simpler self-scrolling box, so zoom is
still unbuilt — and now costs more, since the ghost, hit-test and auto-scroll all work in viewport
coordinates a canvas transform would invalidate. Whether controls rendering below the board need a
reserved buffer has not come up in practice.

---

## Known issues

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

- **Board/calendar configuration picker styling: partially done.** The picker built 2026-07-28 originally
  stacked its buttons in a column, unlike anything else in the backoffice; it now uses the same
  ref-row/dashed-placeholder pattern as the Collection and "Allowed child node types" fields (a ref row
  with name + editor alias and **Choose**/**Remove** actions when set, a full-width dashed **Choose**
  button when empty). Two related editors still need the same treatment:
  - [ ] **Manual lanes editor** (`property-editors/manual-lanes/manual-lanes.element.ts`) still renders
    its own ad-hoc row layout (a `uui-input` pair plus a colour picker per row, `+ Add lane` placeholder
    button) rather than the row styling the **lane appearance (override)** editor already has
    (`property-editors/lane-overrides/lane-overrides.element.ts`, which reuses
    `<uui-color-swatches>` via `lane-colour.element.ts` and `UmbSorterController` for drag-reorder).
    Worth checking whether the shared parts (colour swatch input, row shell) can be factored out for
    both editors to reuse rather than duplicated a second time.
  - [ ] **Lane property editor** (`property-editors/lane-property/lane-property.element.ts`) needs to
    replicate the built-in Umbraco content picker's appearance more closely. It already uses
    `uui-ref-node`/`uui-button look="placeholder"` for its chosen/empty states
    (`lane-property.element.ts:80-95`), so the gap is in the details (icon, layout, action-bar
    treatment) rather than the overall pattern — compare directly against a real
    `Umbraco.PropertyEditorUi.DocumentPicker` field to find the specific differences before changing
    anything.
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

- [ ] Only show the Unassigned lane if the lane property is optional and has children.

## Non-goals (explicitly out of v1 per the design — not gaps)

- Section dashboard host (architecture must not preclude it; not being built now)
- Week/day time-gridded calendar views
- Event durations or end dates
- Custom SignalR hub, presence indicators, "who is editing" avatars
- Card reordering within a lane via `sortOrder` — deliberately deferred out of the canvas/drag-ghost
  work to its own spec (`2026-07-31-milestone-4-canvas-and-drag-ghost.md:24`); still needs that spec
  written
- 2D pan/zoom canvas (fixed-transform) — considered and deliberately not chosen in favour of a
  self-scrolling `.viewport`/`.canvas` pair (see "Grab the board to pan it sideways" above)
