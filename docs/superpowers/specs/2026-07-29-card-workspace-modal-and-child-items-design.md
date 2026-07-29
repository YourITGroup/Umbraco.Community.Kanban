# Card workspace modal, child items, and the board icon

Design for [ENHANCEMENTS.md](../../ENHANCEMENTS.md) items **1** (open a card in the workspace modal),
**4** (`icon-columns` instead of `icon-grid`), **5** (create a child in the same modal) and **6**
(child items listed on a card).

Items 1, 5 and 6 are one feature wearing three hats: every one of them ends in the *same* document
workspace modal, opened from the *same* route registration, and item 6 is where item 5's create
control lives. Item 4 is unrelated and included because it is four lines.

---

## 1 + 5 + 6: one modal, one registration

The board is a dead end today: `UmbCommunityKanbanCardElement` dispatches `kanban-card-clicked` and
nothing listens. The host — `hosts/collection-view-board.element.ts` — becomes the listener, and owns
one `UmbModalRouteRegistrationController` that serves editing, creating, and editing a child alike:

```ts
this.#documentModal = new UmbModalRouteRegistrationController(this, UMB_WORKSPACE_MODAL)
  .addAdditionalPath('kanban-document')
  .onSetup(() => ({ data: { entityType: UMB_DOCUMENT_ENTITY_TYPE, preset: {} } }))
  .onSubmit(() => this.#board?.load())
  .observeRouteBuilder(() => { this._modalReady = true; });
```

This mirrors `workspace-views/data-type-kanban.element.ts` exactly, which already runs this pattern for
the data type workspace; only the entity type and the paths differ. The reasons that element gives for
a modal *route* rather than `UMB_MODAL_MANAGER_CONTEXT.open()` hold identically here — the document
workspace is route-driven, and create, create-from-blueprint and edit are three routes into it:

| Action | Path passed to `open()` |
| --- | --- |
| Edit a card, or a card's child | `UMB_EDIT_DOCUMENT_WORKSPACE_PATH_PATTERN.generateLocal({ unique })` |
| Create a child | `UMB_CREATE_DOCUMENT_WORKSPACE_PATH_PATTERN.generateLocal({ parentEntityType: UMB_DOCUMENT_ENTITY_TYPE, parentUnique, documentTypeUnique })` |
| Create from a blueprint | `UMB_CREATE_FROM_BLUEPRINT_DOCUMENT_WORKSPACE_PATH_PATTERN.generateLocal({ …, blueprintUnique })` |

All three patterns are public exports of `@umbraco-cms/backoffice/document`. `UMB_WORKSPACE_MODAL` is
the generic `Umb.Modal.Workspace` token — v18 ships no document-specific one — so the additional path
segment is what keeps our route distinct from any other workspace modal in the same routing scope,
for the same reason the data type view adds `kanban-board`.

`_modalReady` gates every control that opens the modal, because `open()` silently does nothing until
the router hands over a builder. A card whose title is not yet clickable renders as plain text rather
than a dead button.

### Refresh on close

`onSubmit` reloads the board explicitly. Item 1 wondered whether the collection's `items` observable
covers this for free; it does not — the collection context has no idea a document was saved inside
our modal, and nothing requests a collection reload on its behalf. The existing `#loadToken` guard in
`kanban-board.element.ts` makes a redundant load harmless, so the explicit reload is safe even if a
future collection change starts emitting too.

A dismissed modal does nothing, which is correct: nothing changed.

### The events

Cards do not know about modals, routes or entity types. They report intent and the host acts:

| Event | Detail | Raised by |
| --- | --- | --- |
| `kanban-open-document` | `{ key: string }` | a card's title; a child row's edit button |
| `kanban-create-child` | `{ parentKey: string; documentTypeUnique: string; blueprintUnique?: string }` | a card's child section |

`kanban-open-document` **replaces** `kanban-card-clicked`. The old name said which control was
clicked; the new one says what should happen, and it has to serve child rows as well as cards. Nothing
listens to the old event, so there is no compatibility to keep — it has never been part of a released
surface. Both events bubble and are composed, as `kanban-load-more` already does, so the host listens
once on `.lanes` rather than per card.

## Item 1: the title is the click target

`.card` loses `role="button"`, `tabindex="0"` and its click handler; the name becomes a real
`<button class="name">` that dispatches `kanban-open-document`. Three reasons, the first from the
enhancement itself: a whole-card click fights milestone 3's drag, a button is keyboard-accessible
without hand-rolling key handling, and the `@click` `stopPropagation` currently guarding
`umb-entity-actions-bundle` becomes unnecessary — nothing above it listens for clicks any more.

`cursor: pointer` moves from `.card` to the button. The card keeps its hover border: it is still the
thing you are pointing at.

When the modal is not ready the title renders as a `<span>`, unchanged in appearance.

## Item 4: `icon-columns`

Four occurrences, changed together:

- [property-editors/board/manifests.ts:27](../../../src/Umbraco.Community.Kanban/Client/src/property-editors/board/manifests.ts#L27) — the property editor UI's `meta.icon`
- [hosts/manifests.ts:15](../../../src/Umbraco.Community.Kanban/Client/src/hosts/manifests.ts#L15) — the collection view, i.e. the layout switcher
- [workspace-views/manifests.ts:22](../../../src/Umbraco.Community.Kanban/Client/src/workspace-views/manifests.ts#L22) — the Kanban tab
- [workspace-views/data-type-kanban.element.ts:219](../../../src/Umbraco.Community.Kanban/Client/src/workspace-views/data-type-kanban.element.ts#L219) — the chosen configuration's ref-node

No test asserts an icon, so nothing else moves. `tabIcon` defaults are untouched, as the enhancement
notes: they are per-configuration values an editor chooses.

## Item 6: child items on a card

### Where the children come from

One extra query per board, not one per card. `IContentService.GetPagedDescendants` on the *board's*
parent, filtered to the grandchild level, is the only API that fetches the children of many parents at
once — `IContentService` has no "children of these ids".

```csharp
IQuery<IContent> filter = scopeProvider.CreateQuery<IContent>().Where(x => x.Level == level);
IEnumerable<IContent> grandchildren = contentService.GetPagedDescendants(
    parentId, pageIndex: 0, pageSize: cap, out var total, filter, ordering);
```

The level filter is what keeps the cap meaningful: without it a single deep subtree elsewhere under
the parent would consume the page and starve the cards that actually have children.

The query runs only when the board's `showChildItems` setting is on, so a board that lists no children
pays nothing — not the query, not the payload.

A "Show more" request for one lane runs the same query, because it goes through the same `ComposeAsync`
and its new cards need children too. It reads grandchildren for the whole parent to serve one lane's
page, which is the cost of keeping one code path; a lane-scoped variant would need the card keys before
the query and is not worth a second query shape.

`IKanbanContentLoader` gains one method beside `GetChildren`, keeping `IContentService` out of the
board service exactly as it is today:

```csharp
KanbanGrandchildPage GetGrandchildren(int parentId, int level, int cap, KanbanChildOrdering ordering);
```

`KanbanGrandchildPage(IReadOnlyList<IContent> Grandchildren, bool Capped)` — `Capped` is
`total > Grandchildren.Count`, and it is what makes per-card totals honest (below).

### Permissions

Grandchild keys join the existing bulk browse filter — one `FilterAuthorizedAsync` call for browse
covering children and grandchildren together, not a second round trip. A child the user may not browse
is dropped from the list *and* from its card's total, so the count never discloses a node the user
cannot see. This is the same rule the board already applies to cards.

### Model additions

```csharp
public sealed class KanbanCardChildModel
{
    public required Guid Key { get; init; }
    public required string Name { get; init; }
    public string? Icon { get; init; }
}
```

On `KanbanCardModel`:

| Field | Meaning |
| --- | --- |
| `Children` | Up to `Constants.CardChildDisplayCap` (5) children, in the configured order |
| `ChildTotal` | How many browse-permitted children of this card the page held |
| `ChildTotalIsExact` | False when the grandchild cap was hit, making `ChildTotal` a lower bound |
| `ContentTypeKey` | The card's content type GUID — item 5 needs it (see below) |
| `CanCreate` | Whether the user may create under this card |

And one field on `KanbanBoardResponseModel`:

| Field | Meaning |
| --- | --- |
| `ShowChildItems` | The board setting, so the client knows whether the section exists at all |

The board-level flag rather than inferring it from empty children: a card with no children and a user
who may create is indistinguishable from a board with the setting off unless the setting is stated.
`CanCreate` then means only "this user may create here", which is what its name says, and the two
conditions are combined where they belong — in the render.

`ChildTotalIsExact` deliberately reuses the vocabulary `KanbanBoardLaneModel.TotalIsExact` already
established, so the client renders "+3 more" against an exact total and "+3 or more" against a bound,
the way lane badges already distinguish the two. The name is `ChildTotal` rather than `ChildCount`
because it is permission-filtered — unlike `KanbanBoardResponseModel.ChildCount`, which is documented
as the parent's true count and must never be displayed.

The five children are the *first* five in the configured order; there is no per-card "show more". A
card is a summary. Anyone needing the full list opens the card.

`CanCreate` comes from a third bulk `FilterAuthorizedAsync`, with `ActionNew.ActionLetter`, beside the
browse and update ones the board service already makes. Without it the Add button would render for
users the workspace then refuses, which is worse than no button.

### Configuration

Three new settings on the Board data type, all optional, all inert on existing boards:

| Alias | Label | Editor | Default |
| --- | --- | --- | --- |
| `showChildItems` | Show child items | `Umb.PropertyEditorUi.Toggle` | off |
| `childItemsSortBy` | Sort child items by | `Umb.PropertyEditorUi.Dropdown` — Sort order / Name / Last edited / Created | `sortOrder` |
| `childItemsSortDirection` | Sort direction | `Umb.PropertyEditorUi.Dropdown` — Ascending / Descending | `asc` |

Stored as strings (`sortOrder` | `name` | `updateDate` | `createDate`, and `asc` | `desc`) rather than
an enum, matching how every other Board setting stores its value, and read through a pure mapper that
falls back to sort order ascending on anything unrecognised — a hand-edited or older configuration must
not fail a board:

```csharp
Ordering.By("name", direction, culture)   // name is the one that takes a culture
Ordering.By("sortOrder", direction)
```

The culture passed is the request's, so a varying document's children sort by the name the board is
actually showing.

Sorting by name or date is *global* across the query, then grouped by parent — which is exactly right,
because ordering within a group is preserved by the grouping. Sorting by `sortOrder` orders each
card's children among themselves, which is what an editor dragging children in the tree means by it.

Defaults live in `defaultData` on the property editor UI manifest and therefore apply to newly created
data types only, like `lanePageSize` and `cardProperties` before them. An existing board reads
`showChildItems` as `false` and is unchanged.

### The element

The child list is its own element, `core/kanban-card-children.element.ts`, not more markup inside the
card: it owns two repositories, a two-step popover and its own loading state, and `kanban-card.element.ts`
is already the busiest file in `core/`. The card renders it — passing `card` — only when the board's
`showChildItems` is on *and* the card has children or `canCreate`; a board with the setting off renders
nothing extra.

`showChildItems` reaches the card the way `readonly` already does: a property on the board element,
forwarded to each lane, forwarded to each card. It is board-wide state, not per-card data, so it does
not belong on the card model.

```
┌──────────────────────────────┐
│ 📄 Booking 1234          ⋯   │  ← title opens the workspace modal
│ Created  12 Mar              │
│ ─────────────────────────    │
│ 📄 Line item A          ✎    │  ← ✎ opens the child in the same modal
│ 📄 Line item B          ✎    │
│ +3 more                      │
│ ＋ Add                       │  ← item 5
│ Draft                        │
└──────────────────────────────┘
```

Rows are `icon`, `name`, and an edit button dispatching `kanban-open-document` with the child's key —
what item 6 asked for and nothing more. No publish state, no properties: those belong to a card, not
to a line in a card's list.

The overflow line renders from a pure function so it can be tested without an element:
`formatChildOverflow(childTotal, shown, isExact)` → `undefined`, `+3 more`, or `+3 or more`.

## Item 5: creating a child

An **Add** button at the foot of the child section, rendered when `canCreate` and the modal is ready.
It replicates the create action's own behaviour rather than inventing a shorter one, because an editor
who has learnt "create asks which type, then which blueprint" should not meet a different rule here:

1. **On click**, fetch allowed types:
   `UmbDocumentTypeStructureRepository.requestAllowedChildrenOf(card.contentTypeKey, card.key)`.
   Core's own repository, so allowed-type rules — including any that depend on the parent document —
   stay core's rather than being reimplemented server-side.
2. **No allowed types** → a disabled button with a "no allowed types" title. This is discoverable only
   on click, which is the price of not fetching allowed types for every card on every board load.
3. **One allowed type** → straight to step 4 with it.
   **More than one** → a `uui-popover-container` menu of types, each with its icon, exactly as
   `create-document-collection-action.element.ts` renders its dropdown.
4. **Blueprints** for the chosen type:
   `UmbDocumentBlueprintItemRepository.requestItemsByDocumentType(documentTypeUnique)`.
   None → dispatch `kanban-create-child` immediately. Some → a second popover offering **Blank** plus
   each blueprint, then dispatch with the chosen `blueprintUnique`.
5. The host opens the modal at the create path, or the create-from-blueprint path when a blueprint was
   chosen. `onSubmit` reloads the board, so the new child appears in its card's list.

`contentTypeKey` is a new card field because the repository needs a GUID and the card carries only
`contentTypeAlias`. It is read straight off `content.ContentType.Key` in `KanbanCardMapper`.

Both fetches happen on explicit user action and are not cached. A cache keyed by content type would go
stale the moment someone edits a document type's allowed children, and a per-card element cannot share
one anyway without module-level mutable state; core's tree create action re-fetches on every open for
the same reason.

**Not in scope:** `UMB_DOCUMENT_CREATE_OPTIONS_MODAL`. It is core's create-options modal and it would
have saved this whole flow, but it finishes with `history.pushState` to the *absolute* workspace path —
it navigates away, which is the exact behaviour item 5 exists to avoid.

## What this does not do

- **No drag.** Milestone 3 owns that. The title-only click target is chosen to leave room for it.
- **No add-at-the-top-of-a-lane** (item 8): that presets a lane property value and has its own
  unsolved questions.
- **No per-card "show more"** on the child list, and no child properties, publish state or actions.
- **No child-type filtering.** All child types are listed. A board whose cards have mixed children
  shows them all; the setting to turn the list off is the only control.

## Testing

**Server (`Umbraco.Community.Kanban.Tests`)** — the new logic is pure and tested directly, as the lane
and card mappers are:

- `KanbanChildOrderingTests`: each sortBy/direction pair maps to the expected `Ordering`; unknown
  values fall back to sort order ascending; `name` carries the culture and the others do not.
- `KanbanCardChildAssemblerTests`: grandchildren group to the right cards; the display cap truncates
  at five while `ChildTotal` counts every row; `ChildTotalIsExact` is false when the page was capped;
  a card with no children reports zero and an empty list; names resolve per culture.
- `KanbanCardMapperTests` (extended): `ContentTypeKey` and `CanCreate` are mapped.
- `KanbanBoardServiceTests` (extended): no grandchild query at all when `showChildItems` is off; one
  query when on; children the user cannot browse are absent from both the list and the total;
  `FakeKanbanContentLoader` gains `GetGrandchildren` recording its arguments.
- `KanbanBoardConfigurationTests` (extended): the three new settings round-trip, and a configuration
  written before they existed deserialises to the documented defaults.

**Client (vitest)** — `formatChildOverflow` gets its own model test, matching how `board.model.ts` and
`card-property.model.ts` are tested. `board.model.test.ts` is extended so `toBoardState` carries
`showChildItems` and, more easily missed, `mergeLanePage` preserves it when a "Show more" response
merges a single lane's page into an existing board. Elements are not unit-tested in this package; the existing
`manifests.test.ts` files cover the manifest changes item 4 and the new settings touch.

**By hand**, because no automated test in this package drives the backoffice: a card title opens the
document in a sidebar modal and saving updates the board; a child row's edit button opens the child;
Add with one allowed type and no blueprints goes straight to a new document; Add with several types
asks; Add with blueprints offers Blank plus each; and a board with `showChildItems` off looks exactly
as it does today.

## Files

**New**

- `src/Umbraco.Community.Kanban/Client/src/core/kanban-card-children.element.ts`
- `src/Umbraco.Community.Kanban/Client/src/core/card-children.model.ts` (+ `.test.ts`)
- `src/Umbraco.Community.Kanban/Services/KanbanChildOrdering.cs`
- `src/Umbraco.Community.Kanban/Services/KanbanCardChildAssembler.cs`
- `tests/…/Services/KanbanChildOrderingTests.cs`, `tests/…/Services/KanbanCardChildAssemblerTests.cs`

**Changed**

- `Client/src/hosts/collection-view-board.element.ts` — the modal registration and both handlers
- `Client/src/core/kanban-card.element.ts` — title button, child section, new event
- `Client/src/core/kanban-board.element.ts` — carries `showChildItems` from the response and forwards it
- `Client/src/core/kanban-lane.element.ts` — forwards `showChildItems` to its cards
- `Client/src/core/board.model.ts` — `showChildItems` on the board state `toBoardState` builds
- `Client/src/data/kanban-board.types.ts` — `KanbanCardChildModel`, five new card fields
- `Client/src/property-editors/board/manifests.ts` — three settings, `defaultData`, `icon-columns`
- `Client/src/hosts/manifests.ts`, `Client/src/workspace-views/manifests.ts`,
  `Client/src/workspace-views/data-type-kanban.element.ts` — `icon-columns`
- `Client/src/constants.ts` — the child sort setting keys, if referenced by the elements
- `Models/KanbanBoardConfiguration.cs` — `ShowChildItems`, `ChildItemsSortBy`, `ChildItemsSortDirection`
- `Models/Api/KanbanBoardResponseModel.cs` — `KanbanCardChildModel` and the new card fields
- `Services/IKanbanContentLoader.cs`, `Services/KanbanContentLoader.cs` — `GetGrandchildren`
- `Services/KanbanCardMapper.cs` — `ContentTypeKey`, `CanCreate`, children
- `Services/KanbanBoardService.cs` — the grandchild query, the `ActionNew` filter, assembly
- `Constants.cs` — `CardChildDisplayCap`, `DefaultGrandchildCap`
- `docs/ENHANCEMENTS.md` — items 1, 4, 5 and 6 marked done, pointing here
