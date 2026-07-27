# Umbraco.Community.Kanban — Design

**Date:** 2026-07-28
**Status:** Approved for planning
**Target:** Umbraco CMS 18.x, .NET 10

## Purpose

A package that renders a document's child nodes as a **Kanban board** (cards grouped into swimlanes
by a property value) or a **monthly calendar** (cards placed on a date property), as alternatives to
the built-in table and grid list views.

Cards are draggable. Dragging writes back to the child document — a lane change sets the lane
property, a calendar drop sets the date property — saved as a draft, never published. Cards with
unpublished changes show the same pending state the content tree uses, and a toolbar action
publishes them in bulk.

Multiple editors viewing the same board see each other's changes in near-real-time.

## Non-goals for v1

- Section dashboard host (planned next iteration; the architecture must not preclude it)
- Contentment lane source (separate optional package)
- Week/day time-gridded calendar views
- Event durations or end dates
- Custom SignalR hub, presence indicators, "who is editing" avatars

---

## 1. Architectural constraints discovered

These were verified against the Umbraco 18 source and shape everything below.

| Finding | Source | Consequence |
|---|---|---|
| Any registered `collectionView` extension can be added as a list view layout | `property-editors/collection/config/layout/layout-configuration.element.ts:149` uses `<umb-input-manifest extension-type="collectionView">` | We add board/calendar layouts without forking core |
| The doc type Collection picker hard-codes `Umb.PropertyEditorUi.Collection` | `content-type/global-components/input-content-type-collection-configuration/…element.ts:24` | We **cannot** ship our own property editor UI for the Collection slot |
| `UmbContentCollectionManager` only forwards `layouts`, `orderBy`, `orderDirection`, `pageSize`, `includeProperties` into `UmbCollectionConfiguration` | `content/content/collection/manager/content-collection-manager.controller.ts` | Custom config aliases do not reach a collection view through the collection context |
| `ConfigurationEditor.FromConfigurationEditor()` returns the value dictionary unfiltered | `Umbraco.Core/PropertyEditors/ConfigurationEditor.cs:54` | Extra config aliases written to a data type survive save |
| The Data Type workspace accepts `workspaceView` extensions; its context exposes `getPropertyValue`/`setPropertyValue`/`propertyEditorUiAlias` | `data-type/workspace/manifests.ts`, `data-type-workspace.context.ts:326-390` | We can add a settings tab to an existing data type |
| Umbraco ships a SignalR server-event bus; `ContentSavedNotification` broadcasts `{eventSource, eventType, key}` to authorised users | `Umbraco.Cms.Api.Management/ServerEvents/*`, `DependencyInjection/ServerEventExtensions.cs` | Real-time needs no server infrastructure of our own |
| `umbraco-package.json` supports an `importmap`; `backofficeEntryPoint` is the current entry point type | `json-schema/umbraco-package-schema.ts:57-84`, `extension-registry/initializers/backoffice-entry-point-extension-initializer.ts` | Third-party hosts can import our elements; we can register manifests dynamically at startup |

---

## 2. Configuration model

A **configuration** is a data type instance. Two property editors:

### `Umbraco.Community.Kanban.Board`

| Setting | Notes |
|---|---|
| `laneProperty` | Alias of the child property that determines the lane |
| `laneSource` | Which `IKanbanLaneSource` resolves the lanes; defaults to auto-detect from the property's editor |
| `manualLanes` | Value / label / colour rows, used by the `Manual` source |
| `cardProperties` | Property aliases shown as summary items on cards |
| `allowDrag` | Default on |
| `appliesTo` | Content type keys this configuration provides a content app for |
| `tabName`, `tabIcon` | Content app label and icon |

### `Umbraco.Community.Kanban.Calendar`

| Setting | Notes |
|---|---|
| `dateProperty` | Alias of a datetime property; defaults to `updateDate` |
| `cardProperties` | As above |
| `showAgenda` | Show the agenda list alongside the month grid |
| `allowDrag` | Forced off when `dateProperty` is `updateDate` (not writable) |
| `appliesTo`, `tabName`, `tabIcon` | As above |

Both value editors are label-style: they never write a property value, so placing one on a document
never marks it dirty.

Storing configurations as data types buys CRUD UI, GUID identity, and Deploy/uSync transfer with no
migrations and no custom connectors.

### Lane resolution

`IKanbanLaneSource` is a server-side extension point, registered through a collection builder:

```csharp
public interface IKanbanLaneSource
{
    string Alias { get; }
    bool CanHandle(IDataType dataType);
    Task<IReadOnlyList<KanbanLane>> GetLanesAsync(IDataType dataType, KanbanBoardConfiguration config);
}
```

Built-in sources read `items` from `ConfigurationData` for `Umbraco.DropDown.Flexible`,
`Umbraco.RadioButtonList` and `Umbraco.CheckBoxList`, plus a `Manual` source driven by
`manualLanes`. `Umbraco.Community.Kanban.Contentment` adds a Data List source in a separate optional
package, so the core package takes no Contentment dependency.

An **(Unassigned)** lane always exists, collecting children whose lane value is empty or matches no
known lane. It is drag-out-only — cards can leave it but not be dropped into it.

---

## 3. Hosts

Three ways to reach a board, all hitting the same API:

1. **Content app.** A `backofficeEntryPoint` fetches all configurations at startup and registers one
   `workspaceView` per configuration, conditioned on the content types in its `appliesTo` list. A
   doc type can therefore have several boards with different configurations — "By status", "By
   priority" — each as its own tab.
2. **Collection view.** Two `collectionView` extensions, `Umb.Community.Kanban.CollectionView.Board`
   and `…CollectionView.Calendar`, conditioned on `Umb.Collection.Document`. Editors add them in the
   standard Layouts setting. A **Kanban** `workspaceView` on the Data Type workspace — visible only
   when `propertyEditorUiAlias === 'Umb.PropertyEditorUi.Collection'` — lets them pick which
   configuration each layout uses, writing `kanban.boardConfigId` / `kanban.calendarConfigId` into
   the same data type.
3. **Injected.** A host element sets `config` and `parentId` on the core element directly. No data
   type involved. This is how the planned Bookings-section workspace will consume the package, and
   how the future section dashboard will work.

Injection is the primary API; the other two hosts are adapters that resolve a configuration and then
inject it.

---

## 4. Server

Project `Umbraco.Community.Kanban`, a Razor Class Library with embedded `wwwroot` assets.

### Endpoints

All under `/umbraco/kanban/api/v1`, using Umbraco's Management API conventions (backoffice auth,
`[MapToApi]`, Swagger document).

| Endpoint | Purpose |
|---|---|
| `GET /board` | `configId` *or* inline config, `parentId`, `culture`, optional `lane`, `skip`, `take`. Returns lanes with their cards, per-lane paged |
| `GET /calendar` | `configId` or inline config, `parentId`, `culture`, `from`, `to`. Returns cards placed by date property, plus agenda ordering |
| `PUT /card/{key}/lane` | Sets the lane property. Save only |
| `PUT /card/{key}/date` | Takes a **calendar date**; the server reads the existing value's time-of-day and reassembles. Save only |
| `POST /publish-pending` | Publishes every card in the supplied set that has pending changes |
| `GET /configurations` | Lists Kanban configurations, used by the entry point to register content apps |

Lane and date writes are save-only by design, so a drag is always reversible before it goes live.

The date endpoint takes a calendar date rather than a datetime specifically so the browser's timezone
never participates in the arithmetic.

### Data access

Children load through `IContentService.GetPagedChildren`, which returns draft values — necessary,
since a dragged-but-unpublished card must appear in its new lane. Grouping happens in memory.

A configurable cap (default 1000 children) bounds the work. When a parent exceeds it, the response
carries a truncation flag and the view shows "showing first N of M" rather than silently omitting
cards.

A search-index-backed source is a v2 concern, not a v1 requirement.

### Permissions

Reads filter by browse permission. A lane or date write requires Update on that node.
`publish-pending` requires Publish. Cards the current user cannot update are returned with a flag and
render drag-disabled.

### Variants

Cards show values for the collection's display culture. A write targets that culture when the
property varies by culture, or the invariant value when it does not.

---

## 5. Client

Project `Umbraco.Community.Kanban.Client` — Vite, Lit, TypeScript — building into the RCL's
`wwwroot`.

### Layering

Strict separation, because it is what makes host reuse work:

```
core/     <umb-community-kanban-board>, <umb-community-kanban-calendar>
          props: config, parentId, datasource, readonly, culture
          events: kanban-card-moved, kanban-card-clicked, kanban-load-more
          imports nothing from collection / workspace / dashboard packages

data/     KanbanDataSource interface + server-backed implementation
          injectable, so hosts can substitute and tests can fake

hosts/    collection-view adapter, content-app adapter (dashboard adapter later)
          each resolves a configuration and a parent, renders a core element, wires events
```

Everything a third-party host needs is exported from a public entry module declared in
`umbraco-package.json`'s `importmap`.

### Cards

- Node name as title
- Content type icon and colour, matching the tree
- Configured summary properties, rendered through Umbraco's existing value-summary/UFM pipeline so
  custom editors format correctly
- Media picker properties render as thumbnails rather than text
- Publish state badge using the same visual language as tree nodes
- The standard entity actions menu

### Drag

Optimistic: the card moves immediately, the write fires, and on failure the card snaps back with an
error notification. Moved cards immediately show *pending changes*.

A "Publish pending changes (N)" toolbar button publishes them in one call, behind a confirmation
listing what will go live.

### Calendar

Month grid with previous/next/today navigation, cards on the day of the chosen date property,
"+N more" overflow per day, and an agenda list. Drag-to-reschedule preserves time-of-day and is
disabled when the date source is `updateDate`.

### Real-time

Subscribe to `UMB_SERVER_EVENT_CONTEXT` for `Document` events. When an event's `key` matches a card
in view or a child of the current parent, refetch that single item and re-place it, with a brief
highlight so a colleague's change is visible rather than silent. Deletes and recycle-bin moves remove
the card.

Because the payload is only `{eventSource, eventType, key}`, each event costs one small fetch. This
is the same channel that keeps the content tree in sync, so authorisation is already handled.

---

## 6. Repository

Standalone repo `YourITGroup/Umbraco.Community.Kanban`, wired into `YourITTeam.slnx` by
`ProjectReference` during development and switched to `PackageReference` on publish.

```
Umbraco.Community.Kanban/
├── src/Umbraco.Community.Kanban/             RCL: endpoints, lane sources, config, embedded wwwroot
├── src/Umbraco.Community.Kanban.Client/      Vite + Lit + TypeScript
├── src/Umbraco.Community.Kanban.Contentment/ optional Data List lane source
└── tests/
    ├── Umbraco.Community.Kanban.Tests/       xUnit
    └── (client Vitest suites live beside the client source)
```

## 7. Testing

Cover the logic that is easy to get wrong and invisible when broken:

- Lane grouping, including unassigned and unmatched values
- Month-grid date placement, including month boundaries
- Preserve-time-of-day arithmetic across DST transitions
- Permission filtering on read and write
- The server-event reconciliation reducer
- Lane source resolution per editor alias

No browser automation in v1.

## 8. Milestones

Each is independently useful:

1. Package skeleton, both configuration property editors, `GET /configurations`
2. Read-only board via the collection view host
3. Drag write-back, pending state, publish-all
4. Calendar month grid and agenda list
5. Content app host and real-time sync

Contentment lane source and the section dashboard sit outside v1.
