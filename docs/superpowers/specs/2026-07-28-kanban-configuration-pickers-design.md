# Pick, don't type: board configuration and lane property pickers

**Date:** 2026-07-28
**Status:** Implemented
**Parent design:** [2026-07-28-umbraco-community-kanban-design.md](2026-07-28-umbraco-community-kanban-design.md)
**Builds on:** [2026-07-28-kanban-tab-create-datatype-design.md](2026-07-28-kanban-tab-create-datatype-design.md)

---

## 1. Problem

Three settings asked an editor to know something they cannot see:

1. **Board configuration** (Collection data type → Kanban tab) was a `<uui-select>`. Once chosen, the
   only way to change the data type behind it was to leave the workspace, and there was no way to
   see or edit it in place.
2. **Lane property** was a text box holding a property alias. An alias that does not exist on the
   content type produces a board with no lanes and no error — the resolver falls through to the
   unassigned lane. Nothing in the UI listed the aliases that would work.
3. **Lane source** was a text box whose only meaningful value was the literal string `manual`,
   documented in the field's own description. Every other value was either empty or wrong.

Umbraco already answers (2) for its own Collection columns: choose a content type, then choose one of
its properties. That sequence is the model here.

## 2. Scope

**In**

- The board configuration becomes a picker with edit and remove, alongside the existing create.
- The lane property becomes a content-type-then-property pick, storing the property alias.
- The lane source text box is replaced by a "Define lanes manually" toggle.
- A new `laneContentTypeKey` configuration field recording the content type browsed to.

**Out**

- Reading lanes into the lane overrides editor. `POST /lanes/preview` now *can* be called from the
  data type workspace (§3.4), but nothing calls it yet — the overrides editor still shows "Choose a
  lane property first".
- Validating that the stored lane property still exists on the content types the board applies to.
  A property renamed after configuration still resolves to no lanes, exactly as before.
- The calendar editor's `dateProperty`, which has the same text-box problem and is left alone.

## 3. Design

### 3.1 Board configuration picker

`UmbCommunityKanbanDataTypeViewElement` renders one of three states in the property's editor slot:

| State | Renders |
| --- | --- |
| A configuration is chosen | `uui-ref-node` with its name, **Edit**, **Remove** |
| None chosen, some exist | **Choose**, **Create Kanban Board data type** |
| None exist at all | "No Kanban Board data types exist yet.", **Create** |

**Choose** opens `UMB_DATA_TYPE_PICKER_MODAL` with `multiple: false` and a `pickableFilter` limited to
the keys `GET /configurations` returned. Filtering by key rather than by property editor alias is not
a shortcut: a data type *tree item* carries no editor alias, and `/configurations` is already the
authority on what counts as a Board.

**Edit** and **Create** share one `UmbModalRouteRegistrationController` registration; the path passed
to `open()` decides which. Those paths are now generated from core's own
`UMB_CREATE_DATA_TYPE_WORKSPACE_PATH_PATTERN` and `UMB_EDIT_DATA_TYPE_WORKSPACE_PATH_PATTERN` (public
exports) instead of the hand-written `create/parent/data-type/null` string the parent design warned
about — the version-fragility risk it recorded is retired, not merely documented.

`onSubmit` reloads the configuration list either way, so a rename made inside the modal shows
immediately. It only *writes* the setting when the saved unique is not already selected, so editing
the chosen configuration does not mark the Collection data type dirty for no reason.

A configuration key that no longer resolves renders as "Unknown configuration / This data type no
longer exists" rather than an empty picker, so the editor can see there is something to remove.

### 3.2 Lane property picker

A new property editor UI, `Umb.Community.Kanban.PropertyEditorUi.LaneProperty`, reproducing core's
column sequence: document type tree picker → "Select a property from *X*" item picker. Umbraco's own
`umb-input-collection-content-type-property` is not a public export, so this is built from the parts
that are (`UMB_DOCUMENT_TYPE_PICKER_MODAL`, `UmbDocumentTypeDetailRepository`, `UMB_ITEM_PICKER_MODAL`).

Two deliberate differences from core's version:

- **Document types only.** A board reads a document's children, so media and member types are not
  candidates; element types are filtered out for the same reason. Only one content type kind means
  core's first modal — the Document Type / Media Type choice — has nothing to ask, so it is skipped.
- **No system properties.** Core offers `createDate`, `sortOrder` and friends for columns. Lanes are
  resolved by looking up the data type behind a content type property, and a system property has
  none, so offering them would let an editor configure a board that silently produces no lanes.

The stored value stays the property alias alone. A board resolves lanes against the content type of
whichever document is being viewed, which may legitimately differ from the one browsed here — so the
browsed content type is *not* what the alias is scoped to.

### 3.3 Lane source toggle

`laneSource` leaves the settings UI. In its place, a new `useManualLanes` boolean bound to core's
`Umb.PropertyEditorUi.Toggle`.

`KanbanBoardConfiguration.PinnedLaneSource` derives what the resolver used to read directly:
an explicit `LaneSource` if present, else `"manual"` when the toggle is on, else nothing. `LaneSource`
survives on the model — it is the extension point for third-party sources registered through
`KanbanLaneSources()` — and wins over the toggle, so a board pinned to a third-party source is not
quietly reinterpreted as manual.

Deriving the *automatic* case needs no code at all: an empty pin already means "detect from the lane
property's editor", which is what `CoreListEditorLaneSource` does for dropdowns, radio button lists
and checkbox lists. The old text box was only ever a way to override that.

### 3.4 The remembered content type

`laneContentTypeKey` (a `Guid?`) is written by the lane property picker alongside its own value, via
the data type workspace context — the same `setPropertyValue` the Kanban tab already uses to write
`kanban.boardConfigId` onto a Collection data type, and like it, not declared as a visible setting.
An editor picks a property, not a content type *and* a property.

It earns its place twice: the picker shows "from *Booking*" under the alias on reload, and
`POST /lanes/preview` will accept a request with no `contentTypeKey` and fall back to it, which is
the only way the data type workspace — which has no document, and so no content type — can preview
lanes at all.

Two ordering details are load-bearing:

- The sibling write is **awaited before** the change event. Both writes land in the same
  configuration value list; overlapping them lets the second read the list as it was before the
  first and drop one of them.
- The value is **observed**, not read once. Stored configuration arrives asynchronously, and the
  content type also changes when the editor re-picks.

`Guid?` is read through a new `NullableGuidJsonConverter`, because a cleared picker stores `""` and
`Guid?` alone throws on it — taking the entire configuration object down, not just the one field.

## 4. Testing

Same constraint as the parent design: Vitest runs with `environment: 'node'`, so element behaviour is
not unit-testable here. Logic is extracted where it can be, and everything else is covered
server-side, where the semantics actually live.

- `toPropertyPickerItems` — labels by name, describes by alias, keeps declaration order, falls back
  to the alias when unnamed, drops alias-less properties.
- `KanbanBoardConfiguration.PinnedLaneSource` — nothing by default, `manual` from the toggle, an
  explicit alias wins, a blank alias is ignored.
- `ManualLaneSource.CanHandle` — true for the toggle, not only for the literal alias.
- `KanbanLaneResolver` — the toggle reaches the manual source ahead of a source that claims the
  editor.
- Round trip through the real `KanbanBoardConfigurationEditor` — the toggle's boolean shape, a
  content type key, and an emptied picker's `""` reduced to null without failing the whole object.
- `KanbanLanePreviewRequestModel.EffectiveContentTypeKey` — requested wins, configured stands in,
  neither is `Guid.Empty`.
- Manifest tests pin the settings list and both new editor UI bindings; constants tests pin
  `laneContentTypeKey` against the server's `ConfigurationField` key.

**Manual verification** (not done — needs a running site): pick a lane property and confirm the
document type picker then property picker appear as in the Collection column flow, that the alias and
"from *X*" persist across a reload, that the manual toggle switches lane resolution, and that the
board configuration picker's Choose / Edit / Remove all behave, including Edit reflecting a rename.

## 5. What could go wrong

- **`laneContentTypeKey` is stored under an alias the manifest does not declare.** Precedent: the
  Kanban tab already writes `kanban.boardConfigId` onto a Collection data type the same way, and
  that is how milestone 2 works at all. If Umbraco ever filtered configuration values against the
  declared settings, both would break together.
- **The lane property list is the content type's own.** `UmbDocumentTypeDetailModel.properties` does
  not include composed or inherited properties, so a property inherited from a composition cannot be
  picked. Core's column picker has the same limitation; typing such an alias is no longer possible,
  which is a real (if narrow) regression in reach.
- **`laneSource` is now settable only in code or by hand-editing a data type.** Intended — it exists
  for third-party sources — but a board configured with it before this change keeps working and
  shows an unticked toggle, which reads as "automatic" when it is not.

## 6. Definition of done

Neither a data type key nor a property alias nor a lane source alias has to be known by heart: each
is chosen from what exists, the choice can be seen, edited and removed in place, and the one lane
source decision an editor actually makes is a toggle.
