# Milestone 2 — Read-only board via the collection view host

**Date:** 2026-07-28
**Status:** Approved for planning
**Parent design:** [2026-07-28-umbraco-community-kanban-design.md](2026-07-28-umbraco-community-kanban-design.md)
**Builds on:** milestone 1 (`docs/superpowers/plans/2026-07-28-foundation.md`, merged)

Milestone 2 makes the package do something visible for the first time: a document's children
rendered as a Kanban board, reachable from the standard Collection (list view) layout picker.

Everything here is read-only. No drag, no write-back, no publish action.

---

## 1. Scope

**In**

- `GET /board` — lanes with their cards, paged per lane, permission-filtered.
- Server-side resolution of *which* board configuration a collection is using.
- `<umb-community-kanban-board>` — the core rendering element, `readonly` for this milestone.
- `KanbanDataSource` — the injectable client data interface plus its server-backed implementation.
- The `Umb.Community.Kanban.CollectionView.Board` collection-view host adapter.
- A **Kanban** `workspaceView` on the Data Type workspace, so an editor can pick which board
  configuration a Collection data type's board layout uses.
- Cards: title, content type icon, configured summary properties, publish-state badge, entity
  actions menu.
- Per-lane "Show more" paging, and lane totals that are honest about being lower bounds.
- Refetch when the collection's own reload signal fires.

**Out** (named here so the plan cannot drift into them)

- Drag, write-back, pending-changes state, publish-all — milestone 3.
- Calendar layout and `GET /calendar` — milestone 4.
- Content app host, `backofficeEntryPoint` configuration registration, SignalR real-time —
  milestone 5.
- Contentment lane source — milestone 6.
- Inline (unsaved) configuration on `GET /board`. The endpoint takes a saved configuration only.
  The injected host that needs inline config does not exist yet.
- **Media picker thumbnails on cards.** Verified against the installed backoffice: no built-in
  `valueSummary` extension is registered for any media picker editor alias, so a thumbnail means
  authoring our own `valueSummary` extension plus media-URL resolution. Until then a media property
  configured as a card property renders through the default value summary. Documented as a known
  limitation, deferred to a later milestone.
- Wiring `POST /lanes/preview` into the lane override editor's `lanes` input — the gap deliberately
  left by milestone 1. It belongs to the *data type settings* surface, not the board surface, and is
  tracked separately; see §8.

---

## 2. The central problem: finding the configuration

A collection view extension cannot be told which board configuration to use.
`UmbContentCollectionManager` forwards only `layouts`, `orderBy`, `orderDirection`, `pageSize` and
`includeProperties` into `UmbCollectionConfiguration` (parent design §1), so a custom
`kanban.boardConfigId` alias written onto the Collection data type never reaches the element that
needs it, even though it survives save.

What the collection view element *does* know is the parent document it is rendering the children of.
That is enough, because the chain from there is deterministic:

```
parentId → the parent's content type → its `ListView` (collection) data type key
         → that data type's configuration → kanban.boardConfigId
         → the Kanban Board data type → KanbanBoardConfiguration
```

The first hop is cheaper than it looks: `IContent.ContentType` is an `ISimpleContentType`, which
carries `ListView` as a `Guid?` directly, so no content-type lookup is needed to find the collection
data type.

**Decision: the server walks that chain.** `GET /board` takes `parentId` and an *optional*
`configId`. When `configId` is absent the server resolves it from the parent as above. The client
element stays ignorant of data types entirely.

Rejected: having the client walk the chain through the Management API. It is three round trips
before the first card renders, it duplicates knowledge of the Collection data type's shape in
TypeScript, and none of it is unit-testable without a browser.

The resolution lives in a new `IKanbanBoardConfigurationResolver` beside the existing
`IKanbanConfigurationService`, so the walk is testable against fake content-type and data-type
services with no HTTP involved.

Failure modes are explicit, not silent:

| Situation | Result |
|---|---|
| `configId` supplied and is a Kanban Board data type | Used. `parentId` resolution is skipped |
| `configId` supplied but is not a Kanban Board data type | `400` |
| No `configId`, parent's collection data type has no `kanban.boardConfigId` | `400` with a message naming the missing setting |
| No `configId`, the referenced board data type has been deleted | `400`, same shape |
| Parent document does not exist, or the user cannot browse it | `404` / `403` per Umbraco's convention |

The board element renders a plain "This board is not configured yet — choose a Kanban configuration
on the Collection data type" message for the `400` cases rather than an error toast. Reaching this
state is a normal step in setting a board up, not a fault.

---

## 3. Server

### 3.1 `GET /umbraco/kanban/api/v1/board`

Query: `configId?` (Guid), `parentId` (Guid, required), `culture?` (string),
`lane?` (string), `skip?` (int), `take?` (int).

Two modes, one endpoint:

- **Initial load** — no `lane`. Returns every lane, each with its first page of cards
  (`lanePageSize` from the configuration, default 25).
- **Show more** — `lane` supplied. Returns that lane only, with `skip`/`take` applied. The
  response shape is unchanged; the `lanes` array simply has one entry. The client merges it in.

One endpoint rather than two keeps the grouping code, the permission filter and the card projection
on a single path. A separate `/board/lane` endpoint would duplicate all three.

`lane` matches a lane's `Value`, case-insensitively, consistent with the rest of the lane pipeline.
The unassigned lane is addressed by the empty string.

### 3.2 Response models

```csharp
KanbanBoardResponseModel
    IReadOnlyList<KanbanBoardLaneModel> Lanes
    bool Truncated          // the child cap was hit
    int ChildCount          // always exact — GetPagedChildren reports the true total

KanbanBoardLaneModel        // superset of KanbanLane, which it is projected from
    string Value
    string Name
    string? Colour
    string? Icon
    bool IsUnassigned
    bool AcceptsDrops
    int Total
    bool TotalIsExact       // false once the cap has been hit
    int Skip
    IReadOnlyList<KanbanCardModel> Cards

KanbanCardModel
    Guid Key
    string Name
    string ContentTypeAlias
    string? Icon            // content type icon, verbatim, colour suffix and all
    string State            // "published" | "publishedPendingChanges" | "draft", for the requested culture
    bool CanUpdate          // always populated; nothing reads it until milestone 3
    IReadOnlyList<KanbanCardPropertyModel> Properties

KanbanCardPropertyModel
    string Alias
    string Name
    string EditorAlias      // lets the client choose a renderer
    object? Value           // the draft value for the requested culture
```

`Icon` is passed through unmodified, including any `"icon-x color-y"` suffix: `<umb-icon>` splits and
resolves the colour itself, so nothing on our side parses it. This closes milestone 1's deferred
minor about the suffix.

### 3.3 Grouping, paging and totals

Children load via `IContentService.GetPagedChildren`, which returns draft values — the same call
milestone 3's drag depends on, so an unpublished lane change shows immediately. Grouping is in
memory, on the resolved lane value, case-insensitively.

A cap of 1000 children (configurable) bounds the work:

- Under the cap, every `Total` is exact and `TotalIsExact` is `true`.
- Over the cap, only the first 1000 children are read. Every lane's `Total` becomes a lower bound
  with `TotalIsExact` `false`, and the response sets `Truncated`. `ChildCount` stays exact — the
  paged read reports the true total regardless of how many rows it returned.

Lane totals are counted **after** the permission filter, so a lane never advertises cards the user
cannot see.

Lane order is whatever `IKanbanLaneResolver` returns, unchanged — it is also what drives colour
assignment, so the board must not re-sort it. Cards within a lane keep Umbraco's default child
ordering (sort order), matching what the table layout shows.

### 3.4 Which content type the lanes resolve against

`IKanbanLaneResolver.ResolveAsync` takes a content type key, because a dropdown-backed lane source
reads its options from the lane property's data type. Milestone 1 never had to decide *whose* content
type that is; a board does.

It is the **child** content type, not the parent's — the lane property lives on the cards. A parent
may allow several child types, so the choice is: the first of the parent's allowed child content
types that declares a property with the configured `laneProperty` alias. If none declares it (or the
configuration uses manual lanes and has no `laneProperty`), the resolver is called with
`Guid.Empty`, which yields manual lanes plus unassigned and no dropdown-derived lanes.

Deliberately not "the content type of the first child" — that makes the lane set depend on which
documents happen to exist, so an empty parent would render no columns and adding the first card
would change the board's shape.

### 3.5 Permissions

Reads filter by browse permission on each child. `CanUpdate` is computed per card from the update
permission and returned, but nothing in this milestone consumes it. It is here because computing it
alongside the browse filter costs one extra check on data already loaded, and because milestone 3's
drag-disabled rendering needs a flag it can trust from day one rather than a shape change later.

### 3.6 Variants

Cards show values for the `culture` the request names. A null culture means invariant, not "the
site default" — no language service is involved anywhere in the read path; the collection supplies
its own display culture, and that is itself null on an invariant site, so reading invariant values
in that case is already correct. Property
values come from the requested culture where the property varies, and from the invariant value where
it does not. `State` is the document's state *for that culture*, not the node-wide state.

---

## 4. Client

Layered exactly as the parent design's §5 prescribes, because that separation is the whole reason
the content-app and injected hosts will be cheap later.

```
core/  board.element.ts          <umb-community-kanban-board>
       board.model.ts            view models + the pure page-merge reducer
       lane.element.ts, card.element.ts
data/  kanban-data-source.ts     the KanbanDataSource interface
       kanban-server-data-source.ts
hosts/ collection-view-board.element.ts
       manifests.ts
```

### 4.1 `core/`

`<umb-community-kanban-board>` props: `configId?`, `parentId`, `culture?`, `datasource`,
`readonly` (fixed `true` this milestone). It imports nothing from `hosts/` and nothing from any
collection or workspace package — enforced by review, since nothing in the toolchain checks it.

Lanes render as columns; each header carries its label, its colour, and its total — rendered
`"120+"` when `totalIsExact` is false. A lane with more cards than are loaded shows **Show more**,
which calls the data source for that lane alone and appends. Every other lane is untouched.

Lane colours render through `extractUmbColorVariable()` when the value is an Umbraco colour alias,
and pass through as a raw CSS colour otherwise, per the parent design's *Lane colours*.

The page-merge logic — take the current board state and a single-lane response, produce the next
board state — lives in `board.model.ts` as a pure function. It is the one piece of client state
management that is easy to get subtly wrong (duplicate cards on a double-click, a stale `skip`), so
it is pure and directly tested.

### 4.2 Cards

- Node name as the title.
- Content type icon via `<umb-icon>`, which resolves any colour suffix itself.
- Summary properties from `cardProperties`, rendered through `<umb-value-summary-extension>` — the
  same element the built-in document table collection view uses for arbitrary property values. It
  takes the property's **schema** editor alias as `valueType` plus the raw value, dispatches to a
  registered `valueSummary` extension, and falls back to rendering the value directly when none
  matches. It is a plain global custom element, usable outside a property-editor context.
- Publish-state badge: a `<uui-tag>` whose colour and label come from the card's state, copying the
  document table collection view's state column. There is no packaged badge element to reuse.
- `<umb-entity-actions-bundle>` for the standard entity actions. Its `entityType`/`unique`
  properties are deprecated (removed in v19) and their fallback behaviour is
  provider-ordering-dependent, so the card provides its own `UmbEntityContext` (`document`, the
  card's key) instead — the ambient path the bundle itself already supports and relies on
  internally — and passes only `label`.

The card's state string is our own three-value vocabulary (§3.2), not Umbraco's
`UmbDocumentVariantState` enum, so the badge switch has no dependency on an enum whose serialised
values we would otherwise have to match exactly. `notCreated` is deliberately absent: every card on
a board is a document that exists.

### 4.3 `data/`

`KanbanDataSource` is an interface with two methods — load a board, load one lane's next page — so
the core element never sees `fetch`, and the plan's tests can supply a literal fake. The server
implementation goes through Umbraco's authenticated fetcher against `KANBAN_API_PATH`.

### 4.4 `hosts/collection-view-board.element.ts`

The `collectionView` manifest `Umb.Community.Kanban.CollectionView.Board`, conditioned on
`Umb.Collection.Document`. It:

1. reads the current parent's unique id and the display culture from the collection/workspace
   context,
2. renders the core element with that `parentId`, no `configId`, and the server data source,
3. refetches whenever the collection context signals a reload.

That last point is the reactivity the board needs in this milestone: after a card is edited and
saved elsewhere in the workspace, the collection reloads and the board reloads with it. Real-time
cross-user sync is milestone 5 and needs no change to this contract — it adds a second trigger for
the same refetch.

### 4.5 Data Type workspace — the Kanban tab

A `workspaceView` on the Data Type workspace, conditioned on
`propertyEditorUiAlias === 'Umb.PropertyEditorUi.Collection'`. It lists the Kanban Board
configurations from the existing `GET /configurations` and writes the chosen key to
`kanban.boardConfigId` via the workspace context's `setPropertyValue`.

Without this tab there is no way to select a configuration at all, which is why it is in this
milestone rather than deferred. It writes the board key only; `kanban.calendarConfigId` arrives with
the calendar in milestone 4.

---

## 5. Testing

Same conventions as milestone 1: xUnit with FluentAssertions and hand-written fakes under
`tests/Umbraco.Community.Kanban.Tests/Fakes/`, no mocking framework. Vitest for pure client logic.

**Server**

- Grouping: matched values, empty values and unmatched values all land in the right lane.
- Lane matching is case-insensitive, consistent with the lane pipeline.
- Per-lane paging: `skip`/`take` on one lane returns that lane only and leaves totals intact.
- Totals are exact under the cap; at the cap every lane flips to `TotalIsExact: false` and the
  response sets `Truncated`.
- Totals count post-filter: a card the user cannot browse is absent from both `Cards` and `Total`.
- `CanUpdate` reflects the update permission independently of the browse filter.
- Configuration resolution: each row of §2's failure table, plus the happy path both with and
  without `configId`.
- Variants: a culture-varying property returns the requested culture's value; an invariant one
  returns the invariant value regardless of `culture`.

**Client**

- The page-merge reducer: appending a lane page, appending twice, appending an empty page, and a
  response for a lane not currently in state.
- Lane total formatting: exact vs. `"120+"`.
- Manifest shape tests for the new `collectionView` and `workspaceView`, matching the pattern the
  milestone-1 manifests already use.

Elements themselves are verified by `tsc --noEmit` plus `npm run build`, as in milestone 1 — Vitest
runs in a Node environment with no custom-elements registry, and the parent design rules out browser
automation for v1.

**Manual verification**, once the milestone is complete: reference the package from a running site,
create a Kanban Board data type against a doc type with a dropdown property, add the Board layout to
that doc type's Collection data type, pick the configuration on the new Kanban tab, and confirm the
children render in the right lanes with correct totals and working "Show more".

---

## 6. What could go wrong

- **Card property values may render poorly for editors with no `valueSummary` extension.** Only
  Slider, ColorPicker and DateTimeWithTimeZone ship one; everything else falls back to the raw value.
  Acceptable for text, numbers and dropdowns — which is what a card summary is realistically for —
  and honestly bad for pickers. Hence the media thumbnail deferral in §1.
- **`UMB_COLLECTION_CONTEXT` does not expose the parent document's GUID.** Confirmed. The parent
  comes from `UMB_ENTITY_CONTEXT` instead — which is exactly how the collection context itself
  resolves its own parent — and the culture from `UMB_VARIANT_CONTEXT.displayCulture`.
- **A board on a doc type with thousands of children is slow before it is truncated.** The cap
  bounds it, and the truncation message is honest. A search-index-backed source stays a v2 concern.

---

## 7. Definition of done

An editor can add the Board layout to a document type's Collection, pick a Kanban configuration, and
see that document's children as columns of cards with accurate totals, working per-lane paging, live
publish-state badges and working entity actions — with everything read-only, and the board refreshing
when the collection does.

---

## 8. Carried forward

The milestone-1 lane-preview gap — `POST /lanes/preview` has no caller and the lane override
editor's `lanes` input is never set, so the lane appearance field on a Kanban Board data type always
reads "Choose a lane property first" — is **not** resolved by this milestone. It concerns the board
*settings* editor, not the board itself, and closing it means a settings-host component with no
relationship to anything else in scope here.

The honest consequence of deferring it: milestone 2 is the first milestone where lane colours are
visible, and with the override editor inert, step 1 of the colour precedence chain (explicit
override beats source beats cycle) cannot be exercised by an editor at all. Boards will render with
cycled palette colours only. That is a usable board, but not an art-directed one.

Scheduled for milestone 3, the next milestone to touch the configuration surface. Worth pulling
forward into this milestone if the cycled-colours-only limitation proves unacceptable in the manual
verification pass.
