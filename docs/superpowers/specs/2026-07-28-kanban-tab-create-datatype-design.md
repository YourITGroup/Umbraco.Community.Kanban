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

`#onCreate` opens `UMB_DATATYPE_WORKSPACE_MODAL` (from `@umbraco-cms/backoffice/data-type`) via
`UMB_MODAL_MANAGER_CONTEXT` (from `@umbraco-cms/backoffice/modal`) — the real data type workspace,
rendered as a sidebar modal rather than a router navigation, so the editor never leaves the
Collection data type's own workspace.

```ts
const modalManager = await this.getContext(UMB_MODAL_MANAGER_CONTEXT);

const modalHandler = modalManager.open(this, UMB_DATATYPE_WORKSPACE_MODAL, {
  data: {
    entityType: UMB_DATA_TYPE_ENTITY_TYPE,
    preset: {
      editorUiAlias: KANBAN_BOARD_EDITOR_UI_ALIAS,
      name: `${this.#workspace?.getName() ?? 'List View'} Kanban Board`,
    },
  },
});

const value = await modalHandler.onSubmit().catch(() => undefined);
if (value?.unique) await this.#load();
```

This is exactly the `preset` mechanism core's own property-editor-UI picker flow uses
(`entity-detail-workspace-base.ts`'s scaffold-then-`{...scaffold, ...preset}` merge) — not a
bespoke API. The opened workspace is the full data type editor: name field (pre-filled, still
editable), the "Kanban Board" property editor UI already selected (no searching required), and its
full settings UI (`laneProperty`, `appliesTo`, lane overrides, etc.) ready for the editor to fill in
and save.

`onSubmit()` resolves with `{ unique }` on save, and rejects/never resolves on cancel — `.catch(() =>
undefined)` makes a cancelled modal a no-op: the empty state and its button are simply still there,
unchanged.

### 3.3 Naming

The preset `name` is `` `${listViewDataTypeName} Kanban Board` ``, where `listViewDataTypeName` is
the *current* Collection data type's own name — e.g. opening the tab on "List View - bookingList"
proposes "List View - bookingList Kanban Board". This is available with no extra request:
`UMB_DATA_TYPE_WORKSPACE_CONTEXT` (already consumed by this element to read `propertyEditorUiAlias`)
extends `UmbEntityNamedDetailWorkspaceContextBase`, which exposes `getName()` synchronously.

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

Same conventions as milestone 2: Vitest for client logic.

- Manifest/render test: zero configurations renders the button; one or more configurations renders
  the `<uui-select>` and never the button.
- `#onCreate` / modal interaction: fake `UMB_MODAL_MANAGER_CONTEXT` whose `open()` returns a fake
  modal handler; assert the `preset` passed to `open()` has the correct `editorUiAlias` and a `name`
  built from a faked workspace `getName()`.
- Cancelled modal (`onSubmit()` rejects): assert `#load()` is not called again and `_selected` stays
  unset.
- Successful modal (`onSubmit()` resolves with a `unique`): assert `#load()` re-runs and
  `setPropertyValue(KANBAN_BOARD_CONFIG_ID_KEY, unique)` is called with the new key.

Elements themselves are verified by `tsc --noEmit` plus `npm run build`, as in prior milestones —
no browser automation.

**Manual verification:** on a site with zero Kanban Board data types, open a Collection data type's
Kanban tab, click "Create Kanban Board data type", confirm the modal opens with the name pre-filled
and "Kanban Board" already selected as the property editor UI, save it, and confirm the Kanban tab
now shows the `<uui-select>` with the new configuration already selected.

## 5. What could go wrong

- **`UMB_DATATYPE_WORKSPACE_MODAL`'s `preset` shape could change across backoffice versions.** It is
  core's own mechanism (used by `data-type-picker-flow-modal.element.ts`), not something we invented,
  so it is no more fragile than the rest of this package's dependence on backoffice internals — but
  it is still an unexported-from-public-API surface worth re-checking on a CMS version bump.
- **Two editors creating a board data type at the same time from two different Collection data
  types.** Not a new hazard — `GET /configurations` and Umbraco's own data type save already have
  this property; this feature doesn't add any new shared-state risk beyond what creating a data type
  by hand already has.

## 6. Definition of done

From a Collection data type's Kanban tab with zero Kanban Board data types configured anywhere, an
editor can click one button, get Umbraco's real data type editor pre-seeded with the right property
editor UI and a sensible name, save it without leaving the workspace, and return to the Kanban tab
with that new configuration already selected.
