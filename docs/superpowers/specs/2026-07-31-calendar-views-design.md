# Calendar Views (Milestone 4) — Design

**Date:** 2026-07-31
**Status:** Approved design, pending implementation plan
**Delivers:** Design milestone 4, substantially extended and re-scoped with the user:
read-only month + week + agenda views, category appearances, and slot-click creation. No
rescheduling.

## Scope decisions (made with the user)

- **Read-only.** No `PUT /card/{key}/date`, no drag-to-reschedule. The calendar answers "when is
  this card's date property set to" — the only write path is creating a new item via core's own
  create flow (below). The master design's `allowDrag`/`updateDate` drag rules are moot; the
  config field remains for compatibility but is ignored.
- **All date editor families.** Legacy `Umbraco.DateTime` string values and the four modern
  JSON-storing editors (`Umbraco.DateTime`, `DateTimeUnspecified`, `DateTimeWithTimeZone`,
  `DateOnly`; `TimeOnly` has no calendar date and is rejected at read time), plus the system
  properties `updateDate` and `createDate`.
- **Values display as stored.** A card whose value is `2026-08-15T09:00+10:00` sits on Aug 15 at
  09:00 for every viewer. No browser- or server-timezone conversion anywhere.
- **Undated cards are omitted** from all views; the response carries their count so the UI can show
  a quiet "N items have no date".
- **Two views: month and week (time-gridded)**, plus the agenda list (`showAgenda`).
- **Duration from an optional end-date property**; absent or invalid ends fall back to a nominal
  1-hour block.
- **Categories reuse the lane machinery** for value resolution and appearance precedence.
- **Slot-click creation**: clicking an empty week-grid hour (or a month day) starts core's
  create-document flow with the date property preset to the slot.

## 1. Configuration

`KanbanCalendarConfiguration` (server) and `calendar-config.element.ts` (client) gain:

| Setting | Notes |
|---|---|
| `endDateProperty` | Optional alias, same editor families as `dateProperty`. Gives cards a span; invalid/absent → 1-hour nominal block. Never a system property (an `updateDate` end is meaningless). |
| `categoryProperty` | Optional alias. Its values categorise cards. |
| `categoryManualValues` + `categoryOverrides` | The lane pattern verbatim: the source resolves from the category property's **editor alias** through the existing lane-source machinery (dropdown, content picker, Contentment; manual values as the fallback source), `POST /lanes/preview` lists real values while configuring, and appearance follows the tested precedence — override beats source beats stable colour cycle. The config editor reuses the manual-lanes and lane-overrides editor components. |

Existing settings keep their meaning: `dateProperty` (default `updateDate`), `cardProperties`,
`showAgenda`, `appliesTo`, `tabName`, `tabIcon`. `allowDrag` is ignored.

## 2. Server

### `IKanbanCardDateReader`

Given a content item, a property alias, and a culture, returns `(DateOnly Date, TimeOnly? Time)?`:

- `updateDate` / `createDate` → the content's own dates.
- Anything else → parse the **raw stored value** with core's `DateTimePropertyEditorHelper.
  TryParseToIntermediateValue`, which normalises both legacy strings and the modern
  `{date, timeZone}` JSON to a `DateTimeDto`. Use `dto.Date.DateTime` — the wall-clock value as
  stored, offset ignored, no conversion.
- `Time` is null when the stored time is exactly midnight (legacy date-only values store midnight),
  so date-only cards render without a time chip and land in the week view's all-day strip.
- Unparseable/missing → null (the card counts as undated).

xUnit-tested across every family plus system properties.

### `GET /calendar`

`CalendarController`, query `configId`, `parentId`, `culture`, `from`, `to` (inclusive ISO calendar
dates). Pipeline mirrors the board: resolve the Calendar-kind configuration by data-type key, load
children of `parentId`, permission-filter, map cards with `KanbanCardMapper`. Response:

```jsonc
{
  "items": [
    {
      "date": "2026-08-15",        // start calendar date (in range)
      "time": "09:00",             // null when midnight/date-only
      "endDate": "2026-08-15",     // null when no/invalid endDateProperty value
      "endTime": "10:30",          // null likewise
      "category": "workshop",      // raw categoryProperty value, null when unset
      "card": { /* same card model the board returns */ }
    }
  ],
  "categories": [ /* resolved like lanes: value, label, colour, icon — source + overrides applied */ ],
  "datePropertyEditorAlias": "Umbraco.DateTimeWithTimeZone", // null for system properties
  "undatedCount": 12,
  "truncated": false               // true when the 500-item cap cut the range
}
```

An end before its start is treated as invalid (nominal block). Errors follow the board
controller's contract (404 unknown config, 403, 400 bad range).

## 3. Client models (pure, Vitest — the testing heart)

- **`core/calendar.model.ts`** — month-grid cells (weeks of `{date, inMonth, isToday}`,
  `firstDayOfWeek`-aware), the visible range for a month (leading/trailing out-of-month days
  included) and for a week, day-keyed placement ordered time-then-name, "+N more" partitioning per
  cell capacity, and agenda grouping (days in order, undated omitted). String/date-part arithmetic
  only — no `Date` timezone traps. Tests: month boundaries, leap February, week-start variants,
  ordering.
- **`core/overlap.model.ts`** — the interval layout the week grid and agenda share: normalise each
  item to a span (start + end, nominal 1h when no end, all-day when no time), cluster transitively
  overlapping spans, assign side-by-side columns — **category orders the columns**; same-category
  overlaps take the next column. Also week-grid geometry: top/height percentages from times, and
  the all-day/no-time strip. Tests: disjoint, chains, identical times, cross-midnight ends
  (clamped to the day), category ordering.
- **Category appearance** — map `categories` + the config's overrides through the existing tested
  lane-colour model (`core/lane-colour/`): stable cycle for unlisted values, overrides win.
- **`core/date-preset.model.ts`** — `datePresetValue(editorAlias, slot)` builds the property value
  a create preset needs: `{date, timeZone?}`-shaped JSON value for the modern editors, raw
  datetime string for legacy, `undefined` for system properties (no slot-creation offered). Tested
  per family.

## 4. Elements

- **`core/kanban-calendar.element.ts`** — chrome and state: month/week toggle (last choice in
  `localStorage`), prev/next/today, range fetch through the datasource on navigation, the
  undated-count note, truncation note, delegation to the grids and agenda. Dispatches
  `kanban-open-document` (card click) and `kanban-create-at` (`{date, time?}`) upward — hosts wire
  them, exactly like the board's events.
- **`core/kanban-month-grid.element.ts`** — cells with compact chips: content-type icon +
  **ellipsised** name + time; category colour as the chip accent, category icon trailing. "+N
  more" expands the cell inline. Empty-area click → `kanban-create-at` with the date only.
- **`core/kanban-week-grid.element.ts`** — hour rows × 7 day columns; blocks positioned/sized by
  the overlap model's geometry, sharing width per overlap columns; all-day strip on top. Empty
  hour-cell click → `kanban-create-at` with date + hour.
- **Agenda** (in the calendar element or its own sub-element, per `showAgenda`) — day-by-day list;
  within a day, overlapping items sit side-by-side per the same overlap columns; category accent
  and icon shown.
- `KanbanDataSource` gains `getCalendar(query)`; server implementation beside `getBoard`.

## 5. Hosts — all three, thin

Mirror the board's final architecture:

- **`hosts/kanban-standalone-calendar.element.ts`** — `parent-id`, `config-id`, `culture`
  attributes; datasource; `UMB_WORKSPACE_MODAL` wiring for **open** (edit path) and **create**
  (create path with `preset: { values: [{ alias: dateProperty, value: datePresetValue(...) }] }` —
  core merges `modalContext.data.preset` over the scaffold, entity-detail-workspace-base). Reload
  on modal submit. No action bar — nothing pends. Exported from the importmap module beside the
  board element.
- **Collection view** — `…CollectionView.Calendar` manifest + host resolving its configuration
  from the data type the way the board collection view does.
- **Workspace tabs** — `boardWorkspaceViewManifests` generalises: Calendar-kind configurations no
  longer skipped; they register tabs with default icon `icon-calendar`, pathname
  `kanban-calendar-<key>`, same conditions; element is a thin wrapper resolving workspace contexts
  and rendering the standalone calendar.

Multiple allowed child types reuse the board's existing type/blueprint chooser flow before the
modal opens; a single allowed type goes straight in.

## 6. Error handling

- Unknown/missing configuration → the board's existing "no configuration" presentation.
- Fetch failure → error note in place of the grid; navigation retries.
- `TimeOnly` or unparseable date values → undated (omitted, counted).
- System-property date sources (`updateDate`/`createDate`) → slot-click creation disabled (nothing
  sensible to preset); the calendar is purely observational.
- Preset value rejected by the editor (shape drift in a future Umbraco) degrades gracefully: the
  document still scaffolds, the date is simply unfilled.

## 7. Out of scope (recorded)

- Rescheduling (`PUT /card/{key}/date`), drag of any kind.
- Realtime reconciliation for calendar views (board-only for now; backlog).
- Day view and any other granularities; week is the finest.
- Publish/pending UI — read-only views have nothing to publish.

## 8. Testing

- **xUnit:** date reader per editor family + system properties; range filtering inclusive bounds;
  category resolution reusing lane resolution (guard test that overrides apply).
- **Vitest:** everything in §3.
- **Type-check + build** for all elements (Node, no DOM); hand-check list in the plan (both views,
  agenda overlap, category colours, +N more, slot-create presets per editor, all three hosts).

## 9. Build phases (one spec, phased plan)

1. Configuration extensions + server (`IKanbanCardDateReader`, `GET /calendar`) + month view via
   the standalone host — shippable read-only month calendar.
2. Week grid + agenda with the shared overlap model.
3. Collection-view and workspace-tab hosts + slot-click creation.
