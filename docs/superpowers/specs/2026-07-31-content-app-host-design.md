# Content-app host — Design

**Date:** 2026-07-31
**Status:** Approved for planning
**Target:** Umbraco CMS 18.x, .NET 10
**Parent design:** [2026-07-28-umbraco-community-kanban-design.md](2026-07-28-umbraco-community-kanban-design.md), §3 host #1 and milestone 5

## Purpose

A document type can carry one or more **board tabs** — one per Kanban configuration that names it —
so an editor opens a document and sees its children as a board without the document type needing a
Collection at all. Several configurations can target the same type ("By status", "By priority"),
each appearing as its own tab with its own label and icon.

This is milestone **5b**, the second half of the original design's milestone 5; **5a** (real-time
sync) shipped 2026-07-31 and comes free in this host, because sync lives in the board element.

## Non-goals

- Calendar tabs — the calendar view does not exist yet (design milestone 4). Configurations of kind
  `Calendar` are filtered out of registration until it does.
- Live tab registration — configurations are read once at startup, so a configuration created or
  renamed mid-session appears after a backoffice reload. This is the lifecycle of every manifest.
- Composition/inheritance matching for `appliesTo` — it names document types exactly, not families.
- The section dashboard host (outside v1 per the parent design).

## Approach

One `workspaceView` registered **per board configuration** at startup — each tab is a first-class
workspace tab with its own label and icon, individually conditioned. The rejected alternative, a
single "Kanban" tab listing boards inside itself, would fight the workspace's own tab UI and give
configurations no individual identity.

The mechanism rests on three facts verified against the installed 18.0.2 dist:

| Fact | Where | Consequence |
|---|---|---|
| `UmbWorkspaceViewElement` receives its own `manifest` (`ManifestWithView`) | `core/workspace/extensions/workspace-view.model.d.ts` | One element class serves every configuration: the config key travels in `meta`, read back from `this.manifest.meta` |
| `UMB_DOCUMENT_WORKSPACE_CONTEXT` and `UMB_DOCUMENT_WORKSPACE_ALIAS` are public via `@umbraco-cms/backoffice/document` | `documents/index.d.ts → constants.js → workspace/constants.js` | The condition and the host element consume the workspace directly; `contentTypeUnique` is an observable on the context |
| Core ships `Umb.Condition.WorkspaceEntityIsNew` with a `match` flag | `core/workspace/conditions/workspace-entity-is-new` | No tab on an unsaved document (it has no children) without custom code |

`GET /configurations` already returns everything registration needs
(`{key, name, kind, appliesTo, tabName, tabIcon}`), and the client's `getBoardConfigurations()`
(`data/kanban-configuration-data-source.ts`) already fetches and kind-filters it.

## Components

### 1. Manifest derivation — `hosts/workspace-view.model.ts` (pure, tested)

```ts
boardWorkspaceViewManifests(configurations: KanbanConfigurationModel[]): UmbExtensionManifest[]
```

For each configuration, in input order:

- **Skipped** when `kind !== 'Board'` (`getBoardConfigurations` filters this already, but the rule
  belongs to the derivation so its tests state it) or when `appliesTo` is empty — a configuration
  that names no types provides no tab anywhere.
- Otherwise yields:
  - `type: 'workspaceView'`, `alias: 'Umb.Community.Kanban.WorkspaceView.Board.<key>'`,
    `name: 'Kanban Board Workspace View (<name>)'`
  - `element: () => import('./kanban-workspace-view-board.element.js')`
  - `weight: 90` — after core's Content/Info tabs, consistent for every board tab; ties broken by
    registration order, which follows configuration order
  - `meta: { label: tabName || name, pathname: 'kanban-<key>', icon: tabIcon || 'icon-columns', kanbanConfigId: key }`
    — pathname carries the key so two boards on one document type route distinctly
  - `conditions`:
    1. `{ alias: 'Umb.Condition.WorkspaceAlias', match: UMB_DOCUMENT_WORKSPACE_ALIAS }`
    2. `{ alias: 'Umb.Condition.WorkspaceEntityIsNew', match: false }`
    3. `{ alias: KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS, oneOf: [...appliesTo] }`

### 2. Condition — `hosts/conditions/document-type-applies.condition.ts`

Alias `Umb.Community.Kanban.Condition.DocumentTypeApplies`, config
`{ oneOf: string[] }` of content-type **keys**. Mirrors the repo's existing
`data-type-is-collection.condition.ts` exactly: consume `UMB_DOCUMENT_WORKSPACE_CONTEXT`, observe
`contentTypeUnique`, `permitted = oneOf.includes(unique)` — compared case-insensitively, since GUID
casing is not guaranteed to agree between the server's serialisation and the client's. Registered
as a static `condition` manifest beside the entry point's other manifests (not per-configuration —
one condition type, many configs).

### 3. Registration — `hosts/entry-point.ts` (extends the existing entry point)

`onInit` (after the existing collection-manifest swap, which stays untouched):

```ts
const configurations = await getBoardConfigurations(host);
registered = boardWorkspaceViewManifests(configurations);
extensionRegistry.registerMany(registered);
```

`onUnload` unregisters them by alias, the same discipline the swap already applies. A fetch failure
logs one console warning and registers nothing — the backoffice must never be degraded by a Kanban
endpoint being unavailable.

### 4. Host element — `hosts/kanban-workspace-view-board.element.ts`

The third adapter, beside the collection view. Supplies the board element with:

- **`parentId`** — the open document, from `UMB_DOCUMENT_WORKSPACE_CONTEXT`'s `unique` observable.
- **`configId`** — `this.manifest?.meta.kanbanConfigId`. Passing it explicitly matters: this host
  has no Collection data type to resolve a configuration from, and `GET /board`, `GET /card` and the
  realtime controller all already accept it.
- **`culture`** — from `UMB_VARIANT_CONTEXT`, with the collection host's same falsy-guard (an
  `undefined` emission means "not yet known", never an answer). The variant context is provided by
  the workspace's split view above the tab.
- **Datasource** — `KanbanServerDataSource`, as every host.
- **Modals** — the same `UmbModalRouteRegistrationController(UMB_WORKSPACE_MODAL)` wiring the
  collection host has (distinct `addAdditionalPath` segment, reload on submit), so a card's title,
  child edit and child create all work identically. Opening a document inside that document's own
  workspace as a *sidebar modal* is exactly what the modal route gives us; no navigation occurs.
- **Reload signal** — this host has no collection `items` observable; the board's own realtime sync
  (5a) plus the modal's `onSubmit` reload cover what that signal covered in the collection host.
- **Action bar** — see §5; this element provides `UmbKanbanBoardActionsContext` (it is an ancestor
  of the board it renders) and renders the shared bar element at the tab's foot, shown only while
  the context reports `pending > 0`.

No `updated()`-driven load bookkeeping is copied blindly: this element loads when it has both a
parent and a culture, and reloads when either changes — the same `#loadedFor` token pattern the
collection host uses, minus the collection-settle special case that does not apply here.

### 5. Shared action bar — `core/kanban-action-bar.element.ts`

The bar markup and styles currently inlined in `hosts/kanban-document-collection.element.ts` move
to a small presentational element:

- Properties: `barState: KanbanBoardActionsState` (pending / canUndo / busy).
- Events: `kanban-publish`, `kanban-undo` (plain bubbling CustomEvents; no context knowledge).
- Styling: exactly the current `#board-actions` rules — `--uui-color-selected` surface,
  space-between layout, the same two buttons.

`kanban-document-collection.element.ts` keeps its footer-slot placement and context consumption,
rendering `<umb-community-kanban-action-bar slot="footer">` and translating its events into the
context's `publish()`/`undo()`. The workspace view does the same without a slot. One bar, two
placements — the two hosts cannot drift.

## Error handling

- `GET /configurations` fails at startup → warn once, register no tabs; everything else works.
- A configuration deleted after registration → the tab still shows; opening it has the board's
  existing `not-configured` guidance path (`GET /board` 400s with the explanatory ProblemDetails).
  Resolves itself on the next backoffice reload.
- A document type removed from `appliesTo` after registration → same: condition still passes until
  reload, board still renders (the server resolves the configuration by explicit key). Acceptable
  staleness, same class as any manifest.

## Testing

- `workspace-view.model.test.ts` (Node/Vitest): skips Calendar kind; skips empty `appliesTo`;
  alias/pathname carry the key; label falls back `tabName || name`; icon falls back to
  `icon-columns`; conditions carry the workspace alias, the not-new flag and the `appliesTo` keys;
  input order preserved.
- Condition matching extracted or covered via the model test if trivial (`oneOf` case-insensitive
  includes). The condition class itself, the entry-point wiring, the host element and the bar
  element are verified by `tsc --noEmit` + build, the repo's convention.
- Existing tests must stay green — notably `hosts/manifests.test.ts` and the collection element's
  behaviour after the bar extraction.

## Hand-verification (needs the running site)

1. A document whose type is in a configuration's `appliesTo` shows a board tab with the
   configuration's label and icon; children appear as cards; drag, publish and undo work from the
   tab's own bar.
2. Two configurations naming the same type → two tabs, distinct labels, distinct routes.
3. A document of a type in no configuration → no Kanban tab. A brand-new unsaved document → no tab.
4. The collection view still shows its bar in the footer slot, unchanged.
