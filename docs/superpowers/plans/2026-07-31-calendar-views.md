# Calendar Views (Milestone 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read-only month + week + agenda calendar views placing cards by a configured date property, with category appearances, all three hosts, and slot-click creation — per `docs/superpowers/specs/2026-07-31-calendar-views-design.md`.

**Architecture:** Server: `IKanbanCardDateReader` (normalises every date editor family via core's `DateTimePropertyEditorHelper`) + `GET /calendar` mirroring the board pipeline. Client: pure tested models (`calendar.model.ts`, `overlap.model.ts`, `date-preset.model.ts`) under a `kanban-calendar` element with month/week grids and agenda; a standalone host exported from the importmap module; collection-view and workspace-tab adapters wrapping it.

**Tech Stack:** .NET (xUnit tests), Umbraco 18 backoffice, Lit 3, TypeScript, Vitest-in-Node.

## Global Constraints

- All work in `/Users/gandalf/Source/Repos/Umbraco.Community.Kanban` on branch `tasks/milestone-4-calendar` off `main`; commit per task. Always `git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban …`.
- Client checks from `/Users/gandalf/Source/Repos/Umbraco.Community.Kanban/src/Umbraco.Community.Kanban/Client`: `npx tsc --noEmit`, `npx vitest run`, `npm run build`. Server tests: `dotnet test` from the repo root. Always `cd` with absolute paths.
- Vitest runs in Node with **no DOM**: only pure models get tests; elements are verified by type-check + build. Never value-import `@umbraco-cms/backoffice/document` (or other DOM-touching core packages) from a file a test imports — use string-literal aliases with a comment, as `workspace-view.model.ts` does.
- No mocking frameworks — hand-written fakes (see `tests/Umbraco.Community.Kanban.Tests` and existing `*.test.ts` for the house style).
- Lit privates `#name`, `@state()` fields `_name`. C#: file-scoped namespaces, primary constructors, no underscore-prefixed private fields.
- **Timezone rule (from the spec):** values display **as stored** — never convert through `Date`'s local-timezone constructor in models. All model date maths uses `{year, month, day}` parts or ISO `yyyy-MM-dd` strings.
  - *Superseded 2026-08-01, after this plan shipped:* a value that states its own zone is now placed in the **viewer's** zone, matching how a board card's value summary renders the same property. `viewer-time.model.ts` is the one model allowed to interpret a real moment (`new Date(instant)` + `Intl` with an explicit `timeZone`); every other model still does date-part arithmetic only. See the design doc's revised timezone bullet.
- Never kill/start the Umbraco dev server on :44353.

---

## Phase 1 — configuration + server + month view (shippable)

### Task 1: Configuration extensions

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Models/KanbanCalendarConfiguration.cs`
- Modify: `src/Umbraco.Community.Kanban/Client/src/property-editors/calendar/manifests.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/property-editors/calendar/manifests.test.ts` (if settings are asserted there — extend, don't rewrite)

**Interfaces:**
- Produces: `KanbanCalendarConfiguration` gains `EndDateProperty: string?`, `CategoryProperty: string?`, `CategoryManualValues: KanbanManualLane[]`, `CategoryOverrides: KanbanLaneOverride[]` (reusing the existing lane models). Task 3's service consumes them.

- [ ] **Step 1: Create the branch**

```bash
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban checkout -b tasks/milestone-4-calendar
```

- [ ] **Step 2: Extend the server configuration model**

In `KanbanCalendarConfiguration.cs`, after the existing `DateProperty` field, add (matching the file's `[ConfigurationField]` style):

```csharp
    /// <summary>
    /// Optional end-date property giving cards a span. Absent or invalid values fall back to a
    /// nominal one-hour block. Never a system property — an "updateDate end" is meaningless.
    /// </summary>
    [ConfigurationField("endDateProperty")]
    public string? EndDateProperty { get; set; }

    /// <summary>Optional property whose values categorise cards (colour/icon accents).</summary>
    [ConfigurationField("categoryProperty")]
    public string? CategoryProperty { get; set; }

    /// <summary>Manual category values, used when the category property's editor has no source.</summary>
    [ConfigurationField("categoryManualValues")]
    public KanbanManualLane[] CategoryManualValues { get; set; } = [];

    /// <summary>Per-category appearance overrides, same precedence rules as lanes.</summary>
    [ConfigurationField("categoryOverrides")]
    public KanbanLaneOverride[] CategoryOverrides { get; set; } = [];
```

Also add doc-comment text to `AllowDrag` noting it is **ignored** by the read-only calendar (kept for config compatibility). Do not remove it.

- [ ] **Step 3: Extend the property editor settings**

In `property-editors/calendar/manifests.ts`, import the shared UI aliases used by the board's manifest (see `property-editors/board/manifests.ts`): `KANBAN_MANUAL_LANES_UI_ALIAS`, `KANBAN_LANE_OVERRIDES_UI_ALIAS`, `KANBAN_CARD_PROPERTIES_UI_ALIAS` from `@/constants.js`. Then:

- Change `cardProperties` to use `KANBAN_CARD_PROPERTIES_UI_ALIAS` (parity with the board editor).
- After `dateProperty`, add:

```ts
          {
            alias: 'endDateProperty',
            label: 'End date property',
            description:
              'Optional. Gives cards a span for the week grid and agenda; items without a valid end use a one-hour block.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.TextBox',
          },
          {
            alias: 'categoryProperty',
            label: 'Category property',
            description: 'Optional. Its values colour and badge cards, like lanes colour a board.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.TextBox',
          },
          {
            alias: 'categoryManualValues',
            label: 'Manual categories',
            description: 'Used when the category property’s editor provides no options of its own.',
            propertyEditorUiAlias: KANBAN_MANUAL_LANES_UI_ALIAS,
          },
          {
            alias: 'categoryOverrides',
            label: 'Category appearance',
            description: 'Override the colour, icon or label of individual categories.',
            propertyEditorUiAlias: KANBAN_LANE_OVERRIDES_UI_ALIAS,
          },
```

- Update `allowDrag`'s description to 'Ignored: the calendar is read-only.' (field kept for compatibility).

- [ ] **Step 4: Verify**

```bash
cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban && dotnet build src/Umbraco.Community.Kanban/Umbraco.Community.Kanban.csproj
cd src/Umbraco.Community.Kanban/Client && npx tsc --noEmit && npx vitest run
```

Expected: both clean. If `property-editors/calendar/manifests.test.ts` asserts the settings list, extend its expectations for the four new aliases.

- [ ] **Step 5: Commit**

```bash
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban add -A src/Umbraco.Community.Kanban/Models src/Umbraco.Community.Kanban/Client/src/property-editors/calendar
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban commit -m "feat: calendar configuration gains end date, category property and category appearances"
```

---

### Task 2: `IKanbanCardDateReader` (TDD)

**Files:**
- Create: `src/Umbraco.Community.Kanban/Services/IKanbanCardDateReader.cs`
- Create: `src/Umbraco.Community.Kanban/Services/KanbanCardDateReader.cs`
- Create: `tests/Umbraco.Community.Kanban.Tests/KanbanCardDateReaderTests.cs`
- Modify: `src/Umbraco.Community.Kanban/Services/KanbanBoardComposer.cs` (register)

**Interfaces:**
- Produces: `KanbanCardDate?` `ReadDate(IContent content, string propertyAlias, string? culture)` where `KanbanCardDate` is `readonly record struct KanbanCardDate(DateOnly Date, TimeOnly? Time)`. Task 3 consumes it for both `DateProperty` and `EndDateProperty`.

- [ ] **Step 1: Write failing tests**

Follow the house fake style already used in `tests/Umbraco.Community.Kanban.Tests` (hand-built `IContent` stubs — copy the existing helper the card service tests use). Cover:

```csharp
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests;

public class KanbanCardDateReaderTests
{
    // Fakes: reuse/extend the test content builder the existing service tests use.

    [Fact]
    public void Reads_update_date_from_the_content_itself() { /* content.UpdateDate = 2026-08-15 09:30 → Date 2026-08-15, Time 09:30 */ }

    [Fact]
    public void Reads_create_date_from_the_content_itself() { /* createDate alias */ }

    [Fact]
    public void Reads_a_legacy_datetime_string_value() { /* raw "2026-08-15 09:00:00" → 2026-08-15, 09:00 */ }

    [Fact]
    public void Reads_a_modern_json_value_as_stored_ignoring_the_offset() { /* {"date":"2026-08-15T09:00:00+10:00"} → 2026-08-15, 09:00 — NOT converted */ }

    [Fact]
    public void Midnight_reads_as_date_only() { /* time null when stored time is exactly 00:00 */ }

    [Fact]
    public void Missing_or_unparseable_values_read_as_null() { /* null value, "not a date" */ }
}
```

Write real assertions (the comments above are the scenarios, not the code). Run: `dotnet test --filter KanbanCardDateReader` — expected: FAIL (type not found).

- [ ] **Step 2: Implement**

```csharp
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Infrastructure.PropertyEditors; // DateTimePropertyEditorHelper
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core.Serialization;

namespace Umbraco.Community.Kanban.Services;

/// <summary>A card's calendar placement: the date, and the time when one is meaningfully stored.</summary>
public readonly record struct KanbanCardDate(DateOnly Date, TimeOnly? Time);

public interface IKanbanCardDateReader
{
    /// <summary>
    /// Reads a calendar date (+ optional time) from a property, or null when the value is missing
    /// or unparseable. Values are read AS STORED — the offset in a with-timezone value is ignored,
    /// so a 09:00+10:00 booking is 09:00 on that date for every viewer, matching the editor.
    /// </summary>
    KanbanCardDate? ReadDate(IContent content, string propertyAlias, string? culture);
}

public sealed class KanbanCardDateReader(
    IJsonSerializer jsonSerializer,
    ILogger<KanbanCardDateReader> logger) : IKanbanCardDateReader
{
    public KanbanCardDate? ReadDate(IContent content, string propertyAlias, string? culture)
    {
        if (string.Equals(propertyAlias, KanbanCalendarConfiguration.UpdateDateAlias, StringComparison.OrdinalIgnoreCase))
        {
            return FromDateTime(content.UpdateDate);
        }

        if (string.Equals(propertyAlias, "createDate", StringComparison.OrdinalIgnoreCase))
        {
            return FromDateTime(content.CreateDate);
        }

        object? raw = content.GetValue(propertyAlias, culture: culture);

        // Core's own helper normalises every date editor family — legacy raw strings and the four
        // modern JSON editors — to a DateTimeDto. dto.Date.DateTime is the wall-clock value as
        // stored; taking it (and never converting) is the whole timezone policy.
        if (!DateTimePropertyEditorHelper.TryParseToIntermediateValue(raw, jsonSerializer, logger, out var dto) || dto is null)
        {
            return null;
        }

        return FromDateTime(dto.Date.DateTime);
    }

    private static KanbanCardDate FromDateTime(DateTime value)
    {
        var time = TimeOnly.FromDateTime(value);
        return new KanbanCardDate(DateOnly.FromDateTime(value), time == TimeOnly.MinValue ? null : time);
    }
}
```

Note: verify the helper's exact namespace/signature against the local Umbraco clone
(`~/source/github/umbraco/Umbraco-CMS/src/Umbraco.Infrastructure/PropertyEditors/DateTimePropertyEditorHelper.cs`)
— if it is `internal`, replicate its two branches (string parse → `DateTime.TryParse` with invariant culture; JSON parse → deserialise `{date, timeZone}`) inside `KanbanCardDateReader` with a comment naming the core source file it mirrors.

Register in `KanbanBoardComposer.cs` beside the other services:
`builder.Services.AddSingleton<IKanbanCardDateReader, KanbanCardDateReader>();` (match the lifetime the neighbouring registrations use — check whether they're singleton or scoped and follow suit).

- [ ] **Step 3: Verify** — `dotnet test --filter KanbanCardDateReader` → PASS; full `dotnet test` → PASS.

- [ ] **Step 4: Commit**

```bash
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban add -A src/Umbraco.Community.Kanban/Services tests/
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban commit -m "feat: date reader normalising every date editor family, as stored"
```

---

### Task 3: `GET /calendar` (models, service, controller — TDD on the service)

**Files:**
- Create: `src/Umbraco.Community.Kanban/Models/Api/KanbanCalendarRequestModel.cs`
- Create: `src/Umbraco.Community.Kanban/Models/Api/KanbanCalendarResponseModel.cs`
- Create: `src/Umbraco.Community.Kanban/Services/IKanbanCalendarService.cs`
- Create: `src/Umbraco.Community.Kanban/Services/KanbanCalendarService.cs`
- Create: `src/Umbraco.Community.Kanban/Controllers/CalendarController.cs`
- Create: `tests/Umbraco.Community.Kanban.Tests/KanbanCalendarServiceTests.cs`
- Modify: `src/Umbraco.Community.Kanban/Services/KanbanBoardComposer.cs`, `Constants.cs` (add `CalendarConfigIdKey = "kanban.calendarConfigId"` and `DefaultCalendarCap = 500`)

**Interfaces:**
- Consumes: `IKanbanCardDateReader` (Task 2), existing `IKanbanContentLoader`, `IKanbanBoardConfigurationResolver` (**check**: it resolves by data-type key + kind — if it is board-only, add a calendar equivalent following its shape), `IContentPermissionAuthorizer`, `KanbanCardMapper`, `IKanbanLaneResolver` (for categories).
- Produces (client-visible response):

```csharp
public sealed class KanbanCalendarItemModel
{
    public required string Date { get; init; }        // "2026-08-15"
    public string? Time { get; init; }                 // "09:00"
    public string? EndDate { get; init; }
    public string? EndTime { get; init; }
    public string? Category { get; init; }             // raw category property value
    public required KanbanCardModel Card { get; init; }
}

public sealed class KanbanCalendarResponseModel
{
    public required IReadOnlyList<KanbanCalendarItemModel> Items { get; init; }
    public required IReadOnlyList<KanbanLaneModel> Categories { get; init; } // resolved like lanes
    public string? DatePropertyEditorAlias { get; init; }                    // null for system properties
    public required int UndatedCount { get; init; }
    public required bool Truncated { get; init; }
}
```

- [ ] **Step 1: Failing service tests** — mirror `KanbanBoardServiceTests`' fakes. Scenarios: parent not found → `ParentNotFound`; browse denied → `ParentAccessDenied`; unknown config → `ConfigurationNotFound`; happy path returns items **only inside the inclusive from/to range**; undated children counted not listed; end-before-start → End fields null; category value carried raw; categories resolved through the lane resolver with the calendar's manual values/overrides; 500-cap sets `Truncated`. Run → FAIL.

- [ ] **Step 2: Implement `KanbanCalendarService`** following `KanbanBoardService.GetBoardAsync`'s exact pipeline (same permission sets, same status flow — copy its head, swap composition):

```csharp
public sealed class KanbanCalendarService(
    IKanbanContentLoader contentLoader,
    IKanbanCalendarConfigurationResolver configurationResolver, // or the generalised existing resolver
    IKanbanLaneContentTypeResolver laneContentTypeResolver,
    IKanbanLaneResolver laneResolver,
    IContentPermissionAuthorizer permissionAuthorizer,
    IKanbanCardDateReader dateReader,
    IKanbanCardMapper cardMapper) : IKanbanCalendarService
```

Composition: load children (`Constants.DefaultChildCap` loader page as the board does), permission-filter, then per child read `Date = dateReader.ReadDate(child, config.DateProperty, culture)`; null → increment `undated`; outside `[from, to]` → skip; else map the card and read the optional end (`config.EndDateProperty` set → `ReadDate`; end < start → null both). Categories: when `config.CategoryProperty` is set, resolve exactly as lanes do (content-type key via `laneContentTypeResolver.ResolveAsync(parent.ContentType.Key, config.CategoryProperty)` then `laneResolver.ResolveAsync` with a `KanbanBoardConfiguration`-shaped adapter carrying `CategoryManualValues`/`CategoryOverrides` as its manual lanes/overrides — **read `IKanbanLaneResolver`'s actual signature first and adapt**; if it demands a full board configuration, construct one inline with only the lane-relevant fields populated and a comment saying why). Cap items at `Constants.DefaultCalendarCap` (500), set `Truncated` when the cap cut real items. `DatePropertyEditorAlias`: `content type property → editor alias` lookup via the same path `KanbanCardMapper` uses for card properties; null for `updateDate`/`createDate`.

Configuration resolution: check `IKanbanBoardConfigurationResolver`/`KanbanConfigurationService` — calendar configurations are already parsed (`KanbanConfigurationKind.Calendar`). Add `ResolveCalendarAsync(Guid? configId, ...)` beside the board path following its exact shape (status enum reuse is fine).

- [ ] **Step 3: Controller** — copy `BoardController`'s shape:

```csharp
[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = "Calendar")]
public sealed class CalendarController(
    IKanbanCalendarService calendarService,
    IBackOfficeSecurityAccessor backOfficeSecurityAccessor) : KanbanControllerBase
{
    [HttpGet("calendar")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(KanbanCalendarResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Calendar([FromQuery] KanbanCalendarRequestModel request)
    { /* same status switch as BoardController; From > To → BadRequest("Invalid range") */ }
}
```

`KanbanCalendarRequestModel`: `ParentId (Guid)`, `ConfigId (Guid?)`, `Culture (string?)`, `From (DateOnly)`, `To (DateOnly)`.

- [ ] **Step 4: Verify** — targeted then full `dotnet test`; `dotnet build`. Register service in the composer.

- [ ] **Step 5: Commit** — `feat: GET /calendar returns date-placed cards with categories`

---

### Task 4: Client data layer

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/data/kanban-calendar.types.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/data/kanban-data-source.ts` (+`getCalendar`, `buildCalendarQuery`)
- Modify: `src/Umbraco.Community.Kanban/Client/src/data/kanban-data-source.test.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/data/kanban-server-data-source.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/constants.ts` (`KANBAN_CALENDAR_ENDPOINT`, `KANBAN_CALENDAR_CONFIG_ID_KEY = 'kanban.calendarConfigId'`)

**Interfaces:**
- Produces:

```ts
// kanban-calendar.types.ts — mirror the server response exactly
export interface KanbanCalendarItem {
  date: string; time?: string | null;
  endDate?: string | null; endTime?: string | null;
  category?: string | null;
  card: KanbanCard; // the existing board card type from kanban-board.types.ts
}
export interface KanbanCalendarData {
  items: KanbanCalendarItem[];
  categories: KanbanLaneSummary[]; // existing lane type
  datePropertyEditorAlias?: string | null;
  undatedCount: number;
  truncated: boolean;
}
export interface KanbanCalendarQuery {
  parentId: string; configId?: string; culture?: string; from: string; to: string;
}
export type KanbanCalendarOutcome =
  | { type: 'data'; data: KanbanCalendarData }
  | { type: 'error'; message: string };
```

(Adjust the reused type names to what `kanban-board.types.ts` actually exports — read it first.)

- [ ] **Step 1: Failing test** for `buildCalendarQuery` (same file/style as `buildBoardQuery`'s tests): always includes `parentId`, `from`, `to`; includes `configId`/`culture` only when truthy. Run → FAIL.
- [ ] **Step 2: Implement** `buildCalendarQuery` beside `buildBoardQuery` (same shape), add `getCalendar(query: KanbanCalendarQuery): Promise<KanbanCalendarOutcome>` to the `KanbanDataSource` interface, implement in `kanban-server-data-source.ts` following `getBoard`'s fetch/error pattern (`disableNotifications`, error → `{type:'error'}`).
- [ ] **Step 3: Verify** — `npx tsc --noEmit && npx vitest run`. Note: adding a method to the interface breaks any test fake datasources — extend those fakes with a stub `getCalendar`.
- [ ] **Step 4: Commit** — `feat: calendar query + datasource method`

---

### Task 5: `calendar.model.ts` (pure, TDD)

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/core/calendar.model.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/core/calendar.model.test.ts`

**Interfaces (produces — later tasks consume these exact names):**

```ts
export interface CalendarCell { date: string; inMonth: boolean; isToday: boolean; }
export interface CalendarWeek { cells: CalendarCell[]; } // always 7

/** Weeks covering the month; firstDayOfWeek: 0=Sunday..6=Saturday. today as 'yyyy-MM-dd'. */
export function monthGrid(year: number, month: number, firstDayOfWeek: number, today: string): CalendarWeek[];

/** Inclusive fetch range covering the visible month grid (leading/trailing days included). */
export function monthRange(year: number, month: number, firstDayOfWeek: number): { from: string; to: string };

/** Inclusive 7-day range containing `date`, starting on firstDayOfWeek. */
export function weekRange(date: string, firstDayOfWeek: number): { from: string; to: string };

/** date → items ordered by time (null time first) then card name. */
export function placeByDay(items: KanbanCalendarItem[]): Map<string, KanbanCalendarItem[]>;

/** First `capacity` items + overflow count for a month cell. */
export function partitionCell<T>(items: T[], capacity: number): { visible: T[]; more: number };

/** Days in ascending order, each with its ordered items; empty days omitted. */
export function agendaDays(items: KanbanCalendarItem[]): Array<{ date: string; items: KanbanCalendarItem[] }>;

/** Date-part helpers used by navigation: addMonths/addDays on 'yyyy-MM-dd' strings, no Date-timezone traps. */
export function addDays(date: string, days: number): string;
export function addMonths(year: number, month: number, delta: number): { year: number; month: number };
```

Implementation rule: `Date` may be used **only** as `new Date(Date.UTC(y, m-1, d))` + UTC getters (weekday arithmetic), never via string parsing or local-time constructors — state this in a file-head comment.

- [ ] **Step 1: Failing tests.** Cover: February leap/non-leap grids; a month starting exactly on `firstDayOfWeek` (no leading strip); Sunday vs Monday week starts; `monthRange` spanning three calendar months (e.g. May 2027, Monday start → from Apr 26 to Jun 6); `weekRange` crossing a month boundary; `placeByDay` ordering (null-time first, then time, then name); `partitionCell` exact-capacity edge (`more: 0` at capacity, not `more: 1` showing one); `agendaDays` order and empty-day omission; `addDays` across a month end and a year end; `addMonths` wrapping December→January. Run → FAIL.
- [ ] **Step 2: Implement.** Straightforward date-part arithmetic; ~120 lines.
- [ ] **Step 3: Verify** — targeted then full `vitest run`, `tsc --noEmit`.
- [ ] **Step 4: Commit** — `feat: calendar month/agenda model, tested across boundaries`

---

### Task 6: Month grid + calendar element + standalone host (month-only milestone-in-milestone)

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/core/kanban-month-grid.element.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/core/kanban-calendar.element.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/hosts/kanban-standalone-calendar.element.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/bundle.manifests.ts` (export the standalone calendar class)
- Modify: `src/Umbraco.Community.Kanban/Client/src/constants.ts` as needed

**Interfaces:**
- `kanban-month-grid`: properties `weeks: CalendarWeek[]`, `itemsByDay: Map<string, KanbanCalendarItem[]>`, `appearanceFor: (category: string | null | undefined) => {colour?: string; icon?: string}`; dispatches `kanban-open-document` (`{key}`) on chip click and `kanban-create-at` (`{date}`) on empty-cell click. Chips: content-type icon (the card model carries it, as board cards do) + name with `text-overflow: ellipsis; white-space: nowrap; overflow: hidden` + time; category colour as a left-border accent, category icon trailing. "+N more" toggles an `expanded` set on the element.
- `kanban-calendar`: properties `parentId`, `configId`, `culture`, `datasource`, `configuration` (the calendar config subset: `showAgenda`); owns `_view: 'month' | 'week'` (persisted to `localStorage` key `kanban-calendar-view`), `_anchor` date, fetches on connect + navigation via `monthRange`/`weekRange`, renders toolbar (prev/today/next, view toggle, month title), the grid, the "N items have no date" note, the truncation note, an error note in place of the grid when the fetch fails (navigation retries), and (Phase 2) the agenda. Re-dispatches child events upward unchanged.
- `kanban-standalone-calendar`: attributes `parent-id`/`config-id`, property `culture` — the standalone board host's structure **minus the actions context/bar** (read-only): datasource, `UMB_WORKSPACE_MODAL` registration under path segment `kanban-standalone-calendar-document`, `kanban-open-document` → edit path (copy the handler from `kanban-standalone-board.element.ts` verbatim), reload on modal submit, loader until required attributes are set. `kanban-create-at` handling arrives in Task 11 — until then the event is not wired.

- [ ] **Step 1: Write the three elements.** Follow the standalone board element file for the host's plumbing; follow `kanban-lane.element.ts`/`kanban-card.element.ts` for CSS token usage (`--uui-*` variables, sizing). Month grid: CSS grid `repeat(7, 1fr)`, cells `min-height: 96px`, out-of-month cells dimmed (`opacity: .45`), today's cell number badged with `--uui-color-current`.
- [ ] **Step 2: Export from the importmap module** beside the board export:

```ts
export { UmbCommunityKanbanStandaloneCalendarElement } from './hosts/kanban-standalone-calendar.element.js';
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit && npx vitest run && npm run build`, then grep the built `umbraco-community-kanban.js` for `UmbCommunityKanbanStandaloneCalendarElement`.
- [ ] **Step 4: Hand-check (user):** point a test page at a calendar config (`<umb-community-kanban-standalone-calendar>` can be exercised through the Bookings workspace by temporarily pointing it at a calendar config, or wait for Task 12's tabs). Month renders, navigation works, chips ellipsise, undated note shows.
- [ ] **Step 5: Commit** — `feat: month calendar view with standalone host`

---

## Phase 2 — week grid + agenda

### Task 7: `overlap.model.ts` (pure, TDD)

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/core/overlap.model.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/core/overlap.model.test.ts`

**Interfaces (produces):**

```ts
export interface SpanItem<T> { start: number; end: number; category: string | null; item: T; }

/** Minutes-from-midnight span for one day's item: no time → null (all-day strip);
 *  no/invalid end → start + 60; end beyond the day → clamped to 1440. */
export function toDaySpan<T>(item: KanbanCalendarItem & T, day: string): SpanItem<T> | null;

export interface LaidOutItem<T> extends SpanItem<T> { column: number; columns: number; }

/** Cluster transitively-overlapping spans; within a cluster assign columns —
 *  ordered by category (nulls last, then alphabetical), then start time.
 *  `columns` is the cluster's width so blocks can size as 1/columns. */
export function layoutSpans<T>(spans: SpanItem<T>[]): LaidOutItem<T>[];

/** Percent geometry for a week-grid block within a 24h column. */
export function blockGeometry(span: { start: number; end: number }): { topPct: number; heightPct: number };
```

- [ ] **Step 1: Failing tests.** Disjoint spans → all `column 0, columns 1`; two overlapping different-category spans → side-by-side ordered by category; same category overlapping → next column; chain A∩B, B∩C, A∌C → one cluster of 3 columns wide as needed (transitive); identical start/end; no-time → null from `toDaySpan`; missing end → +60; end before start → +60; multi-day end → clamped 1440; `blockGeometry` maths (540→600 = top 37.5%, height ~4.17%). Run → FAIL.
- [ ] **Step 2: Implement** (interval clustering + greedy column assignment, ~80 lines).
- [ ] **Step 3: Verify**, **Step 4: Commit** — `feat: overlap layout model for week grid and agenda`

---

### Task 8: Week grid + agenda, wired into the calendar element

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/core/kanban-week-grid.element.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/core/kanban-agenda.element.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-calendar.element.ts`

**Interfaces:**
- `kanban-week-grid`: properties `days: string[]` (7 dates), `itemsByDay`, `appearanceFor`; renders an all-day strip (null-time spans) above hour rows (24 × `3rem`, hour labels in a leading gutter column); per day, `toDaySpan` → `layoutSpans` → absolutely-positioned blocks (`top/height` from `blockGeometry`, `left/width` from `column/columns`); block content = time + content-type icon + ellipsised name, category accent. Dispatches `kanban-open-document`; empty-cell click dispatches `kanban-create-at` (`{date, time: 'HH:00'}`) — compute the hour from the click's offset within the day column.
- `kanban-agenda`: properties `days` (from `agendaDays`), `appearanceFor`; per day a heading + items; overlapping items rendered side-by-side using the same `layoutSpans` output (columns as flex-basis percentages); no-time items listed first full-width.
- Calendar element: view toggle now renders `kanban-week-grid` for `'week'` (fetching via `weekRange`, prev/next step ±7 days), and the agenda under either view when `configuration.showAgenda`.

- [ ] **Step 1: Implement the three files.**
- [ ] **Step 2: Verify** — `tsc`, `vitest run` (models untouched but fakes may need nothing), `npm run build`.
- [ ] **Step 3: Hand-check (user):** week view shows blocks at correct hours, overlaps share width ordered by category, all-day strip, agenda side-by-side, toggle persists.
- [ ] **Step 4: Commit** — `feat: time-gridded week view and overlap-aware agenda`

---

### Task 9: Category appearances through the lane-colour model

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-calendar.element.ts`
- Possibly modify: `src/Umbraco.Community.Kanban/Client/src/core/lane-colour/lane-colour.model.ts` (only if its API needs a value-keyed lookup extracted; keep changes additive)
- Test: extend `lane-colour.model.test.ts` only if a new pure function is added

**Interfaces:** the calendar element builds `appearanceFor(category)` from the response's `categories` (already override-resolved server-side) + the existing colour-cycle rules in `lane-colour.model.ts` for values the server didn't list — the same precedence lanes get. Unknown/null category → no accent.

- [ ] **Step 1:** Read `lane-colour.model.ts`; if the cycle function is directly reusable, wire it; if it's lane-array-shaped, add a small exported adapter (with a test) rather than duplicating the cycle.
- [ ] **Step 2: Verify** — full client suite + build.
- [ ] **Step 3: Commit** — `feat: category colour/icon accents with lane precedence`

---

## Phase 3 — remaining hosts + slot-click creation

### Task 10: `date-preset.model.ts` (pure, TDD)

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/core/date-preset.model.ts` + `.test.ts`

**Interfaces (produces):**

```ts
/** The property value a create-preset needs for a slot, or undefined when the editor can't be
 *  preset (system properties, unknown editors). Modern JSON editors: { date: 'yyyy-MM-ddTHH:mm:00' }
 *  (+ no timeZone — the editor fills its default). Legacy Umbraco.DateTime string storage:
 *  'yyyy-MM-dd HH:mm:00'. Slot with no time → midnight.
 *  NOTE: verify the modern editors' FromEditor shape against the local Umbraco clone
 *  (DateTimePropertyEditorHelper + the editor's value editor) during implementation and encode
 *  what is actually persisted; the tests lock it in. */
export function datePresetValue(
  editorAlias: string | null | undefined,
  slot: { date: string; time?: string },
): unknown | undefined;
```

- [ ] **Step 1: Failing tests** per family: `Umbraco.DateTime` (JSON in 18 — confirm; if legacy string, tests say so), `Umbraco.DateTimeUnspecified`, `Umbraco.DateTimeWithTimeZone`, `Umbraco.DateOnly` (date only, time ignored), null/`updateDate`/unknown alias → `undefined`.
- [ ] **Step 2: Implement, verify, commit** — `feat: per-editor date preset values for slot creation`

### Task 11: Slot-click creation in the standalone host

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/hosts/kanban-standalone-calendar.element.ts`

**Interfaces:** consumes `datePresetValue` (Task 10) and the response's `datePropertyEditorAlias` + the config's `dateProperty` (both already fetched). Handler for `kanban-create-at`:

- Resolve allowed child types the same way the board's create flow does (find it: grep `kanban-create-child` handling + the chooser in the board/card-children code and reuse the same chooser); single type goes straight in.
- Open the create path (copy `#onCreateChild` from the standalone board element) with the modal's `onSetup` returning `preset: { values: [{ alias: dateProperty, culture: this.culture ?? null, segment: null, value }] }` where `value = datePresetValue(datePropertyEditorAlias, slot)`; when `value === undefined`, do not offer creation at all — set a `disable-create` state on the grids (system-property date sources) so empty cells don't dispatch.
- Reload on submit (already wired).

- [ ] **Step 1: Implement**, **Step 2: Verify** (`tsc`/build), **Step 3: Hand-check (user):** week hour click pre-fills date+time; month day click pre-fills date; `updateDate` config offers no creation. **Step 4: Commit** — `feat: create content from a calendar slot`

### Task 12: Collection-view + workspace-tab hosts

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/hosts/collection-view-calendar.element.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/hosts/kanban-workspace-view-calendar.element.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/hosts/manifests.ts` (calendar `collectionView`, alias `KANBAN_COLLECTION_VIEW_CALENDAR_ALIAS`, label 'Calendar', icon `icon-calendar`, pathName `kanban-calendar`)
- Modify: `src/Umbraco.Community.Kanban/Client/src/hosts/workspace-view.model.ts` + `.test.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/hosts/manifests.test.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/constants.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/workspace-views/data-type-kanban.element.ts` (the Kanban tab on data types writes `kanban.calendarConfigId` beside `kanban.boardConfigId` — follow its existing board field exactly)

**Interfaces:**
- `workspace-view.model.ts`: the Calendar skip is replaced by a branch — Calendar-kind configurations produce manifests with element `() => import('./kanban-workspace-view-calendar.element.js')`, pathname `kanban-calendar-<key>`, default icon `icon-calendar`, same alias prefix + conditions. **TDD:** update the "skips calendar" test to assert the calendar manifest's shape instead; keep board assertions unchanged.
- `kanban-workspace-view-calendar.element.ts`: the board wrapper (`kanban-workspace-view-board.element.ts`) verbatim, rendering `<umb-community-kanban-standalone-calendar>`.
- `collection-view-calendar.element.ts`: follow `collection-view-board.element.ts` — same collection-context config resolution, reading `KANBAN_CALENDAR_CONFIG_ID_KEY` instead.

- [ ] **Step 1: Failing model tests** (calendar manifests derived, board untouched) → **Step 2: implement all files** → **Step 3: full verify** (`tsc`, `vitest`, `build`) → **Step 4: hand-check (user):** Calendar tab on an `appliesTo` document; Calendar layout selectable on a collection; both render. **Step 5: Commit** — `feat: calendar collection view and workspace tabs`

### Task 13: Docs + merge

- [ ] **Step 1:** `docs/TODO.md`: mark milestone 4 built (link the spec, note read-only re-scope, list hand-checks outstanding); move the week/day-view exclusion note if stale.
- [ ] **Step 2:** Full final verify: `dotnet test`, client `tsc` + `vitest run` + `build`.
- [ ] **Step 3: Merge**

```bash
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban add -A docs src tests
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban commit -m "docs: milestone 4 status"
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban checkout main
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban merge --no-ff tasks/milestone-4-calendar -m "Merge calendar views (milestone 4)"
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban branch -d tasks/milestone-4-calendar
```

(Stage paths explicitly — never bare `git add -A` at the repo root; the `.claude/` worktree gitlink incident.)
