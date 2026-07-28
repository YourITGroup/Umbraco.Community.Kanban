# Kanban tab: create a Kanban Board data type inline

**Date:** 2026-07-28
**Status:** Approved for planning
**Parent design:** [2026-07-28-umbraco-community-kanban-design.md](2026-07-28-umbraco-community-kanban-design.md)
**Builds on:** milestone 2 (`docs/superpowers/plans/2026-07-28-milestone-2-board-collection-view.md`, merged)

---

## 1. Problem

The Kanban tab on a Collection (List View) data type — `UmbCommunityKanbanDataTypeViewElement`
(`workspace-views/data-type-kanban.element.ts`) — lets an editor pick which Kanban Board data type
a collection's board layout uses, from the list returned by `GET /configurations`. When that list is
empty (no Kanban Board data type exists anywhere yet), the tab only says:

> "No Kanban Board data types exist yet. Create one under Settings → Data Types."

The editor has to leave the workspace, find Settings → Data Types, create a data type, search for
and select the "Kanban Board" property editor UI, save, come back to the Collection data type, and
only then can they pick it. This is friction for a step that is required before the tab does
anything at all.

## 2. Scope

**In**

- A "Create Kanban Board data type" button in the empty-state, replacing pure prose with prose plus
  an action.
- Opening Umbraco's own data type workspace as a modal, pre-seeded with our property editor UI alias
  and a generated name — the same mechanism Umbraco core itself uses for inline property-editor
  creation (`data-type-picker-flow-modal.element.ts`), not a bespoke flow.
- On successful save, refreshing the configuration list and auto-selecting the newly created data
  type, so the editor lands back on the Kanban tab with it already chosen.

**Out**

- Any change to what the created data type contains beyond the property editor UI preset and name.
  `laneProperty`, `appliesTo`, lane overrides, etc. are left for the editor to fill in inside the same
  modal — identical to creating one by hand today. No inference from the parent content type's
  allowed children.
- Any change to the server/API surface. This is entirely client-side, using an existing core modal
  token; `GET /configurations` is unchanged and is simply re-called after creation.
- A "fully automatic, no button" flow. The button is an explicit, cancellable action.
- Any change to the read path (`GET /board`) or to how a *document*'s Kanban content-app tab is
  created. This only touches the empty state of the Collection data type's Kanban tab.

## 3. Design

### 3.1 Trigger

`UmbCommunityKanbanDataTypeViewElement.render()` currently renders, when `_configurations.length ===
0`:

```html
<span slot="editor" class="empty">No Kanban Board data types exist yet. Create one under Settings → Data Types.</span>
```

This becomes:

```html
<span slot="editor" class="empty">
  No Kanban Board data types exist yet.
  <uui-button label="Create Kanban Board data type" look="secondary" @click=${this.#onCreate}></uui-button>
</span>
```

The button is only ever shown in the zero-configurations state — once at least one Kanban Board data
type exists, the tab reverts to the `<uui-select>` and the button never appears again. This mirrors
the existing binary in `render()` (`_configurations.length ? select : empty-message`); no new state
variable is needed for visibility.

### 3.2 Opening the create modal

The modal is `UMB_DATATYPE_WORKSPACE_MODAL` (from `@umbraco-cms/backoffice/data-type`) — the real
data type workspace, rendered as a sidebar modal rather than a router navigation, so the editor never
leaves the Collection data type's own workspace.

It is opened through a **modal route registration**, not `UMB_MODAL_MANAGER_CONTEXT.open()`. This is
not a stylistic choice: `UmbDataTypeWorkspaceContext` is route-driven, and create mode exists *only*
as the route `create/parent/:entityType/:parentUnique` (verified in
`data-type-workspace.context.js`). The modal element itself just renders
`<umb-workspace .entityType=...>`, so opening it imperatively with no route would render a workspace
with nothing to resolve. Every core inline-data-type-creation path
(`umb-input-content-type-collection-configuration`, the data type picker flow) uses the route
registration for the same reason.

```ts
this.#createModal = new UmbModalRouteRegistrationController(this, UMB_DATATYPE_WORKSPACE_MODAL)
  .addAdditionalPath('kanban-board')
  .onSetup(() => ({
    data: {
      preset: {
        editorUiAlias: KANBAN_BOARD_EDITOR_UI_ALIAS,
        name: buildBoardDataTypeName(this.#workspace?.getName()),
      },
    },
  }))
  .onSubmit((value) => {
    if (value?.unique) this.#onCreated(value.unique);
  })
  .observeRouteBuilder(() => {
    this._canCreate = true;
  });

// on click:
this.#createModal.open({}, `create/parent/${UMB_DATA_TYPE_ENTITY_TYPE}/null`);
```

Three details that are load-bearing:

- **The `open()` second argument** is the inner workspace's create route, appended to the modal path.
  Without it the modal opens on no route and renders nothing.
- **`entityType` is not passed** in `onSetup`. The token already defaults it to `data-type`, and
  `UmbModalContext` merges passed data over the token defaults with `umbDeepMerge(args.data,
  defaultData)` — source wins, so the defaults survive and our `preset` is not clobbered by the
  default `preset: {}`. The token's data type `Omit`s `entityType` accordingly.
- **`addAdditionalPath('kanban-board')`.** The token's alias is the *generic* `Umb.Modal.Workspace`,
  so the generated route would otherwise be the bare `modal/Umb.Modal.Workspace`, shared with any
  other workspace modal registered in the same routing scope.

The `preset` mechanism is core's own (`entity-detail-workspace-base.js` merges
`{...scaffold, ...modalContext.data.preset}` after `createScaffold`), used verbatim by core's picker
flow. Only `editorUiAlias` is preset; the property editor *schema* alias and its default config are
derived from our UI manifest exactly as when an editor picks the editor by hand — which is what makes
the saved data type indistinguishable from a hand-made one, and therefore visible to
`GET /configurations`.

The opened workspace is the full data type editor: name field (pre-filled, still editable), the
"Kanban Board" property editor UI already selected (no searching required), and its full settings UI
(`laneProperty`, `appliesTo`, lane overrides, etc.) ready to fill in and save.

`onSubmit` fires only on save. A dismissed modal is a no-op — the empty state and its button are
simply still there.

**Button readiness.** `open()` silently does nothing until the router has handed over a route
builder, so a button rendered before then would be dead on click. `observeRouteBuilder` sets
`_canCreate`, and the empty state falls back to the original "Create one under Settings → Data Types."
text until then — never a dead end.

### 3.3 Naming

The preset `name` is `` `${listViewDataTypeName} Kanban Board` ``, where `listViewDataTypeName` is
the *current* Collection data type's own name — e.g. opening the tab on "List View - bookingList"
proposes "List View - bookingList Kanban Board". This is available with no extra request:
`UMB_DATA_TYPE_WORKSPACE_CONTEXT` (already consumed by this element to read `propertyEditorUiAlias`)
extends `UmbEntityNamedDetailWorkspaceContextBase`, which exposes `getName()` synchronously.

The logic lives in `buildBoardDataTypeName()` (`workspace-views/board-data-type-name.ts`) as a pure
function so it is directly testable — see §4. It trims, and falls back to a bare `"Kanban Board"` when
the name is absent or blank, rather than emitting a leading space or the literal word `"undefined"`.

Because this is a modal *preset*, not a locked value, the editor can change the name before saving —
this only removes the "come up with a name" step for the common case, it does not enforce a naming
convention.

### 3.4 After creation

On a resolved `onSubmit()`, `#load()` re-runs (the same method the constructor already calls for the
happy path): `getBoardConfigurations()` re-fetches the now-non-empty list, and `_selected` is set to
the newly created data type's key. Auto-selecting means writing `kanban.boardConfigId` immediately
via `this.#workspace?.setPropertyValue(...)` — the same write `#onChange` already performs — so the
editor doesn't have to also operate the `<uui-select>` for what is, at this point, the only board
configuration that could possibly be meant.

If `onSubmit()` resolves without a `unique` (shouldn't happen per the modal's contract, but guarded
defensively) or the created data type somehow still isn't returned by `GET /configurations` (e.g. a
`kind` mismatch), `_selected` stays at `''` and the empty state's button remains — no silent partial
state.

## 4. Testing

Same conventions as milestone 2. Vitest runs with `environment: 'node'` and there is no
custom-elements registry, so element behaviour is not unit-testable in this project — no existing test
instantiates an element, and this change does not introduce the first. The testable logic is therefore
extracted rather than mocked:

- `buildBoardDataTypeName()` — derives from the Collection data type's name; trims surrounding
  whitespace; falls back to a bare `"Kanban Board"` for `undefined`, `null`, `''` and whitespace-only.

The element itself is verified by `tsc --noEmit` plus `npm run build`, as in prior milestones — no
browser automation. Everything else about this change (route registration, preset merge, create-route
prepend, button readiness) was verified by reading the installed backoffice v18 implementation rather
than by test, and is recorded in §3.2 so the reasoning survives a version bump.

**Manual verification:** on a site with zero Kanban Board data types, open a Collection data type's
Kanban tab, click "Create Kanban Board data type", confirm the modal opens with the name pre-filled
and "Kanban Board" already selected as the property editor UI, save it, and confirm the Kanban tab
now shows the `<uui-select>` with the new configuration already selected.

## 5. What could go wrong

- **This leans on several backoffice internals at once**: the `preset` merge, the generic
  `Umb.Modal.Workspace` alias, and the literal `create/parent/:entityType/:parentUnique` route string.
  All are core's own mechanisms (used verbatim by `data-type-picker-flow-modal` and
  `input-content-type-collection-configuration`), so this is no more fragile than the rest of the
  package's dependence on backoffice internals — but the create-route string in particular is a
  hardcoded path into another package's router, and is the first thing to re-check on a CMS major bump.
  Verified against `@umbraco-cms/backoffice` 18.
- **`open()` failing silently** if the route builder is never handed over would leave a button that
  does nothing. Mitigated by gating the button on `_canCreate` (§3.2) rather than rendering it
  unconditionally.
- **Two editors creating a board data type at the same time from two different Collection data
  types.** Not a new hazard — `GET /configurations` and Umbraco's own data type save already have
  this property; this feature doesn't add any new shared-state risk beyond what creating a data type
  by hand already has.

**Superseded:** the hardcoded `create/parent/:entityType/:parentUnique` string is gone. It is now
generated from core's own exported `UMB_CREATE_DATA_TYPE_WORKSPACE_PATH_PATTERN` — see
[2026-07-28-kanban-configuration-pickers-design.md](2026-07-28-kanban-configuration-pickers-design.md),
which also replaces this design's `<uui-select>` empty-state binary with a picker.

## 6. Definition of done

From a Collection data type's Kanban tab with zero Kanban Board data types configured anywhere, an
editor can click one button, get Umbraco's real data type editor pre-seeded with the right property
editor UI and a sensible name, save it without leaving the workspace, and return to the Kanban tab
with that new configuration already selected.
