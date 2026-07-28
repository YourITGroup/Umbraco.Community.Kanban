# Enhancements backlog

Agreed but not built. Each entry records enough of the *why* and the *where* to be picked up cold.
Design decisions live in `docs/superpowers/specs/`; this file only tracks intent and priority.

---

## Next up: Contentment lane source (milestone 6, pulled ahead of 3)

**Reprioritised 2026-07-28.** The Contentment Data List lane source was scheduled last. It needs to
come next instead, because the property boards are actually wanted for — a booking's `status` — is a
Contentment Data List backed by an enum, and nothing else can read it. Milestone numbering is
unchanged; only the build order is.

Today `CoreListEditorLaneSource` claims only `Umbraco.DropDown.Flexible`,
`Umbraco.RadioButtonList` and `Umbraco.CheckBoxList`. A Contentment Data List property is claimed by
no source at all, so a board configured against `status` collapses to the single unassigned lane. The
only workaround is the "Define lanes manually" toggle, which duplicates the enum by hand and drifts
from it the moment the enum changes — exactly the failure the resolver was designed to avoid.

Scope is already specified: see *Contentment lane source* in
[the main design](superpowers/specs/2026-07-28-umbraco-community-kanban-design.md), including the
separate `Umbraco.Community.Kanban.Contentment` project and NuGet package (so the core package never
drags Contentment in), resolution through `IContentmentDataSource` rather than any one data source,
`Disabled` items rendering as lanes that reject drops, and the guard test on Contentment's
hard-coded editor alias — its alias constants are `internal`.

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

## 2. Card properties: use the List View's own column control

The card properties editor built on 2026-07-28 stores a bare list of aliases. Umbraco's Collection
column configuration stores more per row, and shows it better: a drag handle, an editable **header**
(so "bookingOwner" can display as "Owner"), the alias, a **label template** (UFM, e.g.
`{umbMemberName: value}` or `${ value ? 'Yes' : 'No' }`), and a Remove.

Cards want all of that for the same reasons a list does. The board already renders summary values
through `umb-value-summary-extension`, so a label template has somewhere to land.

This is not a drop-in swap:

- **The stored shape changes** from `string[]` to a list of objects (alias, header, template,
  `isSystem`). `KanbanBoardConfiguration.CardProperties` and `KanbanCardMapper` both change, and
  deserialisation has to stay lenient enough to read the old `string[]` — every board configured
  before the change stores it.
- **Core's element is not a public export.** `umb-property-editor-ui-collection-column-configuration`
  and its inner input live under `dist-cms`. Either rebuild it from public parts, as
  `pickContentTypeProperty` already does for the pick sequence, or accept the internal dependency
  deliberately.
- It supersedes the current editor rather than extending it.

## 3. Default card properties to the created and updated dates

A board with no card properties configured shows cards with nothing but a title. Created and updated
dates are the sensible default, matching what a fresh List View shows.

**Blocked on system property support.** `createDate` and `updateDate` are not content type
properties: `IKanbanPropertyDataTypeLookup` finds no data type for them, the picker deliberately
excludes them (offering a property that silently renders nothing is worse than not offering it), and
`KanbanCardMapper` reads content properties only. So this needs system properties handled end to end —
which is also what item 2's `isSystem` flag is for, and why these two belong together.

Once they resolve, the default itself is one `defaultData` entry on the board's `propertyEditorUi`
manifest, beside `lanePageSize` and `allowDrag`.

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
