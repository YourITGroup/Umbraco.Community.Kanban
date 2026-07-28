# Contentment Data List lane source

**Date:** 2026-07-28
**Status:** Approved for planning
**Parent design:** [2026-07-28-umbraco-community-kanban-design.md](2026-07-28-umbraco-community-kanban-design.md) — *Contentment lane source*, milestone 6
**Priority:** built ahead of milestone 3, per [ENHANCEMENTS.md](../../ENHANCEMENTS.md)

---

## 1. Problem

A board groups cards by the value of one property. Which lanes exist is decided by an
`IKanbanLaneSource` claiming that property's data type. Two ship today: `ManualLaneSource` (lanes typed
by hand) and `CoreListEditorLaneSource` (`Umbraco.DropDown.Flexible`, `Umbraco.RadioButtonList`,
`Umbraco.CheckBoxList`).

A Contentment Data List property is claimed by neither. `KanbanLaneResolver` finds no source, returns
no lanes, and the board collapses to the single unassigned lane — no error, just an empty board.

This is not hypothetical: the first real board's lane property is a booking's `status`, a Contentment
Data List over a .NET enum. The only workaround is the "Define lanes manually" toggle, which
duplicates the enum by hand and drifts from it the moment the enum changes — the exact failure the
resolver exists to prevent.

## 2. Scope

**In**

- A new project and NuGet package, `Umbraco.Community.Kanban.Contentment`, holding one lane source for
  data types whose editor alias is `Umbraco.Community.Contentment.DataList`.
- A `tests/Umbraco.Community.Kanban.Contentment.Tests` project, both wired into the solution.
- A `ProjectReference` from `YourITTeam` so the booking status board can be tried immediately.

**Out**

- **Data Picker** (`Umbraco.Community.Contentment.DataPicker`). Its sources are built around search and
  paging rather than a bounded option set, which is not what a lane needs.
- **Lane colours from item data.** `DataListItem` has no colour field. Extra keys can ride along in its
  `Properties` bag, and reading a `colour` from there was considered and rejected: it is a convention
  Contentment does not define, and lane colour already has two working sources (a per-lane override, or
  the palette cycle).
- **Any change to the core package.** No new interface, no change to `IKanbanLaneSource`, the resolver,
  or the value reader. If this design needs a core change to work, the design is wrong.
- **Contentment's content context** (§6).

## 3. What Contentment actually does

Worth recording, because the parent design's citation is wrong and the correct path is not the obvious
one. The parent design quotes `DataListValueConverter.cs:80-95` as resolving items. It does not: that
code resolves `IDataSourceValueConverter` to work out a property's *value type*. Items come from
`Api/Management/Controllers/DataList/DataListController.GetEditor`:

```csharp
var source = utility.GetConfigurationEditor<IContentmentDataSource>(key);   // key from config
var items = source.GetItems(sourceConfig) ?? [];
```

The interface is `IContentmentDataSource` as the parent design says — `IDataListSource` is obsolete and
removed in Contentment 8 — but the call site and the config shape come from two different places, so
both are worth stating exactly:

- **Where the key and config live.** A Data List data type's `ConfigurationData["dataSource"]` is a
  `JsonArray` of one entry: `[ { "key": "<type name with assembly>", "value": { … } } ]`. The `key`
  identifies the data source implementation; `value` is that source's own configuration.
  `DataListValueConverter` reads exactly this shape, and is the reference for it.
- **How the config is deserialised.** `_jsonSerializer.Deserialize<Dictionary<string, object>>(entry["value"]?.ToString() ?? "{}")`
  using Umbraco's `IJsonSerializer`. This is load-bearing: sources read their own config through
  `TryGetValueAs`, which leans on Umbraco's `TryConvertTo`, so a differently-serialised dictionary can
  silently fail to yield values. `EnumDataListSource.GetValueType` reading `enumType` as
  `List<string>` is a concrete example. **Replicate the deserialisation verbatim rather than
  improvising it.**

`DataListItem` carries `Value`, `Name`, `Icon`, `Disabled`, `Description`, `Group`, and a `Properties`
extension bag. Only the first four matter here.

## 4. Design

### 4.1 The lane source

`ContentmentDataListLaneSource : IKanbanLaneSource`, alias `contentment-data-list`.

`CanHandle` is an editor alias comparison, as `CoreListEditorLaneSource` already is — the alias is
hardcoded, because Contentment's constants are `internal` (§5 covers the guard).

`GetLanesAsync` reads the data source reference out of `context.ConfigurationData`, asks for its items,
and maps them:

| `DataListItem` | `KanbanLane` |
| --- | --- |
| `Value` | `Value` |
| `Name`, falling back to `Value` | `Name` |
| `Icon` | `Icon` |
| `Disabled` | `AcceptsDrops = false` |

Items with a blank `Value` are skipped, matching `ManualLaneSource` — a lane with no value can never
match a card, and would collide with the unassigned lane's empty value. Source order is preserved,
because lane order drives the colour cycle.

Colour is left null so every lane joins the cycle unless overridden.

### 4.2 Three pieces, because one of them cannot be faked

`ConfigurationEditorUtility` is `public sealed` with no interface. A lane source depending on it
directly could not be unit-tested at all, so the work splits three ways:

1. **A pure configuration parser.** `ConfigurationData` → `{ key, valueJson }`, or nothing. All the
   shape-guessing lives here, where it is directly testable.
2. **A one-method seam** over Contentment: given that key and JSON, return `DataListItem`s. The only
   type that touches `ConfigurationEditorUtility` and `IJsonSerializer`, and the only one a test has to
   fake. This mirrors `IKanbanPropertyDataTypeLookup`, which exists in the core package for the same
   reason.
3. **The lane source**, which composes the two and does the mapping. Fully testable against a fake
   seam.

The parser is lenient about the container types, not about the shape: the canonical `JsonArray` of
`JsonObject` is what Umbraco hands over, but a configuration that has been through a JSON round trip
can arrive as `JsonElement`s or plain lists, and a source reference that cannot be read must yield *no
lanes* rather than throw. A missing `value` becomes `{}`, exactly as Contentment's own code does. Where
more than one entry is present the first wins, as it does everywhere else in the lane pipeline.

### 4.3 Registration

An `IComposer` in the new package appends the lane source and registers the seam implementation, so
installing the package is all it takes. A public `AddKanbanContentment()` extension sits behind it for
anyone composing by hand, and calls `AddKanban()` first — which is already idempotent.

Collection order does not matter here: no core source claims the Data List alias, so nothing competes,
and a configuration that pins `manual` still wins through `PinnedLaneSource`.

### 4.4 Versioning

`Umbraco.Community.Contentment` is pinned `[7.0.1, 8.0.0)` in `Directory.Packages.props` — the repo uses
central package management, so the supported range belongs there rather than on the reference. The
lower bound is the version the consuming site already runs; the upper bound is a real boundary, since
Contentment 8 removes `IDataListSource` and may move more.

## 5. Testing

xUnit, no Umbraco services, as everywhere else in this repo.

- **Configuration parser** — the canonical shape; a missing, empty or malformed `dataSource`; a missing
  `value` defaulting to `{}`; more than one entry taking the first; the round-tripped container shapes.
- **Lane mapping** — value, name, name falling back to value, icon, `Disabled` producing a lane that
  rejects drops, blank values skipped, order preserved.
- **`CanHandle`** — claims the Data List alias case-insensitively; rejects the core list editor aliases,
  an unrelated alias, and the empty string.
- **Through the real resolver** — a `KanbanLaneSourceCollection` holding this source plus the core ones
  resolves a Data List property to its items, and a configuration pinning `manual` still beats it.
- **The alias guard.** The alias must be hardcoded, so the test reflects the real
  `DataListDataEditor.DataEditorAlias` const out of the Contentment assembly and asserts ours equals
  it. A test asserting a constant against a literal would prove nothing; this one fails loudly when a
  Contentment upgrade renames the alias, which is the entire point of writing it.

**Manual verification** (needs the site): point a board's lane property at a booking's `status`, leave
"Define lanes manually" off, and confirm the lanes come out as the enum's values with the unassigned
lane last.

## 6. What could go wrong

- **Sources that depend on the current node return nothing.** `DataListController` calls
  `SetCurrentContentContextValues(...)` *before* `GetItems`, because sources like
  `UmbracoContentPropertyValueDataListSource` and the XPath one resolve relative to the content being
  edited. We have no such context — and none at all in the data type editor. Those sources will yield
  no lanes. Bounded sources (enum, user-defined, JSON, SQL, text-delimited) are unaffected, which
  includes the motivating case. `IContentmentContentContext` is public, so wiring it later is possible;
  it is backlog, not scope, and the limitation should be documented in the package README.
- **The hardcoded editor alias.** Mitigated by the reflection guard test above, which is why that test
  is worth more than its line count suggests.
- **A data source throwing.** `GetItems` runs third-party code — a SQL source with a bad connection
  string, an Examine source with no index. An exception must not take down `GET /board`; the seam
  swallows and logs, returning no items, so a misconfigured source degrades to an empty board rather
  than a 500.
- **Multi-value Data Lists.** A Data List using a checkbox list editor stores `["a","b"]`.
  `KanbanLaneValueReader` already unwraps a JSON array to its first non-empty value, so a card lands in
  one lane. No change needed — verified, not assumed.

## 7. Definition of done

A board whose lane property is a Contentment Data List shows one lane per item the data source
produces, named and iconed as Contentment names them, with disabled items visible but refusing drops —
and installing the package is the only step required to get it.
