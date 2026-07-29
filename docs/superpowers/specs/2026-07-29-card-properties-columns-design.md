# Card properties as List View columns

**Date:** 2026-07-29
**Status:** Implemented
**Parent design:** [2026-07-28-umbraco-community-kanban-design.md](2026-07-28-umbraco-community-kanban-design.md)
**Supersedes:** [ENHANCEMENTS.md](../../ENHANCEMENTS.md) items 2 and 3
**Sibling:** [2026-07-29-lane-order-design.md](2026-07-29-lane-order-design.md) — built together, independent of this

---

## 1. Problem

Card properties are a bare list of aliases. Umbraco's own List View column configuration stores more per
row and shows it better, and cards want the same things for the same reasons:

- **No display label.** A card shows the property's own name, so `bookingOwner` reads as "Booking
  Owner" when "Owner" is wanted.
- **No formatting.** A boolean renders as whatever its value editor produces; there is no way to say
  "Yes"/"No", or to resolve a member picker to a name.
- **No system properties.** `createDate` and `updateDate` cannot be shown at all: the picker excludes
  them, `IKanbanPropertyDataTypeLookup` finds no data type for them, and `KanbanCardMapper` reads
  content properties only. A fresh board therefore shows cards with nothing but a title.
- **Reordering is ↑ ↓ buttons**, where the rest of the backoffice drags.

## 2. Scope

**In**

- The stored value becomes a list of objects: alias, header, label template, and a system flag.
- The editor becomes the List View's column control — drag handle, header input, alias, label template,
  Remove, and a full-width **Choose**.
- System properties end to end: offered by the picker, resolved by the server, rendered on cards.
- Label templates rendered on cards through Umbraco's UFM renderer.
- New board configurations default to the created and updated dates, which can be removed like any
  other row.
- Reading the old `string[]` shape, so existing boards keep working.

**Out**

- **Sorting or filtering cards by these properties.** They are display only, as they are today.
- **The calendar editor's `dateProperty`**, which is a different setting with a different job.
- **Lane order**, which is the sibling design, though both use the same sorter.
- **A card properties *preview*.** Unlike lanes, nothing needs resolving from the server to show the
  rows: the editor already knows every alias it holds.

## 3. Design

### 3.1 The stored shape

`KanbanCardProperty`, mirroring Umbraco's `UmbCollectionColumnConfiguration` so the control and the
model agree without translation:

| Field | Meaning |
| --- | --- |
| `Alias` | the property alias, or a system field name |
| `Header` | the label shown on the card; falls back to the property's own name |
| `NameTemplate` | a UFM template, e.g. `{umbMemberName: value}` or `${ value ? 'Yes' : 'No' }` |
| `IsSystem` | true for `createDate` and friends, which are not content type properties |

`IsSystem` is stored rather than derived. A content type is free to declare a property whose alias
happens to be `published`, and only the editor that added the row knows which was meant. Umbraco's own
column configuration stores it for the same reason — as `0`/`1`, which this design keeps rather than
inventing a boolean the control would have to be adapted to.

**The old shape must still load.** Every board configured before this change stores
`["status","company"]`. A converter reads a JSON array of strings as a list of rows with only `Alias`
set, and a JSON array of objects as itself. It never throws: an unreadable entry is skipped, because a
card missing a summary item is recoverable where a failed configuration deserialisation takes down the
whole board.

The old shape is read, never written. A board's stored value converts on the next save of that data
type, and until then it keeps working.

### 3.2 System properties

The five Umbraco's own document column picker offers, with the same aliases so an editor moving between
the two sees the same names: `createDate`, `updateDate`, `creator`, `sortOrder`, `published`.

They need three things the current pipeline has none of:

- **Offering them.** The property picker gains them as a group, ahead of the content type's own
  properties. Choosing one sets `IsSystem`.
- **Reading them.** `KanbanCardMapper` reads them off `IContent` directly rather than through
  `Properties`. This is the one place they are genuinely different from a content property, and it is a
  switch on the alias, kept in its own function so it is testable without a content type at all.
- **Rendering them.** A card property carries an `EditorAlias` the client hands to
  `umb-value-summary-extension` to choose a renderer. A system field has no data type and so no real
  editor alias, so the mapper supplies the alias of the editor whose renderer suits the value:
  `Umbraco.DateTime` for the two dates, `Umbraco.TrueFalse` for `published`, and `Umbraco.Integer` for
  `sortOrder` and `creator`. These are presentation choices, not claims about a data type, and the
  mapper says so where it makes them. (`creator` was specified as `Umbraco.TextBox`; it is the
  creator's **id**, so an integer renderer is correct. Resolving it to a user name would need the user
  service and is not in this scope.)

`IKanbanPropertyDataTypeLookup` is **not** involved. It exists to resolve *lane* properties, where a
data type's configuration is what produces lanes; a card property only needs a value and something to
render it with. Leaving it alone also means system properties cannot accidentally become lane
properties, which they cannot be.

### 3.3 Label templates

`NameTemplate` is rendered by `umb-ufm-render` from `@umbraco-cms/backoffice/ufm`, which takes
`.markdown` and `.value` — the same component and the same syntax Umbraco's List View uses, so a
template copied from a column configuration behaves identically.

A row with no template renders as it does today, through `umb-value-summary-extension`. Keeping both
paths matters: the summary extension is what makes a picker or a dropdown render sensibly with no
configuration, and a template is the escape hatch when it does not.

### 3.4 The editor

Rebuilt to match the List View's column control: rows carrying a drag handle, a header `uui-input`, the
alias as `<code>`, a label template `uui-input`, and a **Remove**; below them a full-width **Choose**
that opens the existing pick sequence.

Reordering uses `UmbSorterController`, as the sibling design's lane rows do. **Corrected during
implementation:** this section originally said `umb-sortable-list`, which exists only in Umbraco `main`
and not in the `18.0.2` this package builds against.

The pick sequence itself is unchanged — `pickContentTypeProperty`, built from public parts because
Umbraco's `umb-input-collection-content-type-property` is not exported. It gains the system group.

Removing asks for confirmation, as core's does, because a removed row takes its header and template with
it.

`addCardProperty`, `removeCardPropertyAt` and `moveCardProperty` are replaced: the first two by
equivalents over the new shape, and reordering by the sortable list, which hands back a whole array.
`moveItem` stays — the manual lanes editor still uses it.

### 3.5 Defaults

A new Board configuration starts with the created and updated dates, as a fresh List View does:

```
[ { alias: 'createDate', header: 'Created', isSystem: 1 },
  { alias: 'updateDate', header: 'Last edited', isSystem: 1 } ]
```

One `defaultData` entry on the board's `propertyEditorUi` manifest, beside `lanePageSize` and
`allowDrag`. Defaults apply to newly created data types only, so no existing board gains them — and
either row can be removed like any other.

## 4. Testing

Server, xUnit:

- **The configuration converter** — a JSON array of strings reads as rows with aliases only; an array
  of objects reads as itself; a mixed array reads both; an unreadable entry is skipped rather than
  throwing; `null` and `[]` read as empty. Plus a round trip through the real
  `KanbanBoardConfigurationEditor`, which is where the old shape actually arrives from.
- **`KanbanCardMapper`** — a header overrides the property's name and its absence falls back to it; a
  template is carried through untouched; each of the five system fields maps to the right value and
  editor alias; a system alias that also exists as a content property is read as the system one when
  `IsSystem` is set and as the property when it is not; an alias matching nothing is skipped; culture
  handling is unchanged.

Client, Vitest (`environment: 'node'`, so no element behaviour):

- **`addCardProperty` / `removeCardPropertyAt`** over the new shape — appends with the picked label as
  the header, drops a duplicate alias case-insensitively, never mutates its input.
- **`toPropertyPickerItems`** — unchanged for content properties, and the system group offers the five
  aliases with their labels.
- **Manifest test** — the `cardProperties` default is the two dates, in order.

**Manual verification** (needs a running site): add a content property and a system property; set a
header and see it on the card; set `${ value ? 'Yes' : 'No' }` on a boolean and see it render; drag to
reorder and confirm the card follows; remove a row and confirm the confirmation appears; create a new
Board data type and confirm it starts with the two dates; open a board configured before this change
and confirm its aliases still render.

## 5. What could go wrong

- **The stored shape changes.** This is the main risk in the design. The converter is what contains it,
  and it is tested against the old shape first. A board is only rewritten when its data type is saved.
- **UFM templates can reference filters that are not registered.** A template copied from a List View
  may use a filter the backoffice registers only in a collection context. `umb-ufm-render` degrades to
  showing the unresolved template rather than failing, which is visible but not broken — worth
  confirming by hand rather than assuming.
- **`published` and `sortOrder` are of limited use on a card**, and offering all five invites a card
  configured with noise. They are included because matching core's list is more predictable than
  curating a subset, and any row can be removed.
- **System property values are not localised or formatted server-side.** A date arrives as a date and is
  rendered by the client's summary extension. If that renders an ISO string rather than a formatted
  date, the fix is a label template — which is exactly what templates are for.

## 6. Definition of done

A card shows the properties an editor chose, in the order they dragged them, labelled how they named
them and formatted how they templated them — including the created and updated dates, which a new board
starts with and any board can remove.
