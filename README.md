# Project Boards for Umbraco


![Umbraco.Community.Kanban Logo](https://raw.githubusercontent.com/YourITGroup/Umbraco.Community.Kanban/master/GithubFiles/Logo/Kanban_Logo.png)

Kanban and Calendar views for Umbraco Content Collections

[![Umbraco.Community.Kanban - CI](https://github.com/YourITGroup/Umbraco.Community.Kanban/actions/workflows/build.yml/badge.svg)](https://github.com/YourITGroup/Umbraco.Community.Kanban/actions/workflows/build.yml)
[![Umbraco.Community.Kanban - Release](https://github.com/YourITGroup/Umbraco.Community.Kanban/actions/workflows/release.yml/badge.svg)](https://github.com/YourITGroup/Umbraco.Community.Kanban/actions/workflows/release.yml)

Nuget Packages:

| Package | Version | Downloads |
| -- | -- | -- |
| Umbraco.Community.Kanban | [![NuGet release](https://img.shields.io/nuget/v/Umbraco.Community.Kanban.svg)](https://www.nuget.org/packages/Umbraco.Community.Kanban/) | [![NuGet release](https://img.shields.io/nuget/dt/Umbraco.Community.Kanban.svg)](https://www.nuget.org/packages/Umbraco.Community.Kanban/) |

Umbraco Package: [![Umbraco.Community.Kanban project page](https://img.shields.io/badge/umbraco-marketplace-green.svg)](https://marketplace.umbraco.com/package/Umbraco.Community.Kanban)



## Features

- **Kanban Board collection view** – Adds a "Kanban" tab to any content Collection. Cards for each child item are grouped into columns ("lanes") by the value of a chosen property (e.g. a Status dropdown), giving editors an at-a-glance view of where every child item stands.
- **Drag-and-drop lane changes with safe publish** – Editors can drag a card to a different lane. The move saves immediately but is only published when the editor confirms "Publish pending changes", so a drag stays reversible (with Undo) until then. Cards an editor can't move, or that belong to a data type with dragging disabled, show a lock icon instead of failing silently.
- **Kanban Calendar collection view** – A "Calendar" tab alongside the board, placing each child item on a Month or Week grid (plus an optional Agenda list) by a chosen date property. An optional end-date property gives cards a visible time span. The calendar is read-only (no drag-to-reschedule).
- **Category colouring on the calendar** – An optional "category" property colours and badges calendar cards, mirroring lane colours on the board, with manual values and per-category colour/icon/label overrides when the source property has no built-in options.
- **Configurable card properties** – Pick which document properties appear as a compact summary on each card (dates, custom fields, etc.), using the same UI as List View column configuration.
- **Card children listing and inline create** – Optionally list each card's own children directly on the card, with buttons to edit an existing child or create a new one without leaving the board.
- **Click-to-open cards** – Clicking a card's title opens the underlying content item in Umbraco's normal edit modal.
- **Slot-click creation on the calendar** – Clicking an empty day (month view) or hour slot (week view) opens the create-content flow with the date property pre-filled.
- **Board UX polish** – Panning by dragging the empty background, equal-height lanes regardless of content, and a full drag "ghost" with auto-scroll near the board edges.
- **Real-time sync** – Boards and calendars update live when another editor changes, publishes, or trashes a card (via Umbraco's management API server-events), with a brief pulse to highlight what changed.
- **Content App tab support** – Beyond Collections, a board or calendar can be configured to apply to specific document types, in which case it appears as its own tab on the content editing screen (e.g. a "Bookings" tab on a "Venue" document type showing all of its reservation children as a board).
- **Standalone/embeddable host** – The package exposes `<umb-community-kanban-standalone-board>` and a calendar equivalent as public custom elements (via the `@umbraco-community/kanban` importmap module) so other backoffice extensions or sections can embed a board/calendar directly.
- **[Umbraco.Community.Kanban.Contentment](src/Umbraco.Community.Kanban.Contentment/README.md) add-on** – An optional companion package that lets a board's lane property (or a calendar's category property) be a Contentment "Data List" property. Lanes/categories are then derived automatically from the Data List's data source (Enum, JSON, SQL, User Defined, Countries, Currencies, etc.) instead of being typed manually. See its own README for setup and current limitations (e.g. Data Picker and node-relative data sources aren't supported).

## Configuring the Data Types

The package registers two content-editor-facing data types. Both are configured entirely on the **Settings** tab of the data type itself — the property value they store on content is read-only and never shows as unsaved changes.

### Kanban Board (`Umbraco.Community.Kanban.Board`)

| Setting | Purpose |
| -- | -- |
| Lane property | The child-document property whose value decides which lane a card lands in. |
| Define lanes manually | Off (default): lanes come from the lane property's own options — see "Where lanes come from" below. On: use the manual lane list below instead. |
| Manual lanes | A hand-typed list of lane values, used only when "Define lanes manually" is on. |
| Lane appearance | Per-lane colour/icon/label overrides, and drag-to-reorder the lane display order. |
| Card properties | Which document properties appear as a summary on each card, and in what order. Defaults to "Created" and "Last edited". |
| Show child items | Lists each card's own children on the card, with edit/add buttons. |
| Sort child items by / direction | Controls the order children are listed in when "Show child items" is on (Sort order, Name, Last edited, or Created). |
| Cards per lane | How many cards load per lane before showing a "Show more" link (default 25). |
| Allow drag | Whether editors can drag cards between lanes (default on). |
| Applies to content types | Optional document types that should show this board as a Content App tab. |
| Content app name / icon | Label and icon for that tab, when "Applies to" is set. |

### Kanban Calendar (`Umbraco.Community.Kanban.Calendar`)

| Setting | Purpose |
| -- | -- |
| Date property | The property that places a card on a given day (defaults to "Last edited" if unset). |
| End date property | Optional — gives a card a visible span in the week grid/agenda; falls back to a 1-hour block if absent or invalid. |
| Category property | Optional property whose value colours/badges cards, the calendar equivalent of a board's lanes. |
| Manual categories | Hand-typed category values, used when the category property has no built-in options. |
| Category appearance | Per-category colour/icon/label overrides. |
| Card properties | Same mechanism as the board's card properties. |
| Agenda view | Whether to offer an Agenda view alongside Month/Week (default on). |
| Applies to content types | Optional document types that should show this calendar as a Content App tab. |
| Content app name / icon | Label and icon for that tab, when "Applies to" is set. |

### Where lanes come from

Unless you define lanes by hand, they are read from the lane property's own data type — and a
calendar's categories are read the same way, from the category property. Which reader applies is
decided by the property's editor:

| Lane/category property is… | Lanes/categories become… |
| -- | -- |
| Dropdown, Radio button list, Checkbox list | The editor's configured options. |
| **Content picker or Multi node tree picker, restricted to one or more document types** | **Every document of those types.** Restrict a "Resource" picker to your "Meeting Room" type and you get a lane per room, named after the document and badged with its document type's icon. |
| Contentment Data List | The Data List's data source — needs the [Contentment add-on](src/Umbraco.Community.Kanban.Contentment/README.md). |
| Anything else | Nothing, so the board shows a single "Unassigned" lane. Use manual lanes instead. |

Notes on the document-instance lanes:

- The picker **must** name its allowed document types ("Accepted types" on a content picker,
  "Allow items of type" on a tree picker). An unrestricted picker offers no lanes, rather than every
  document on the site.
- Unpublished documents still appear, so a lane never disappears out from under its cards.
- Trashed documents do not. At most 200 lanes are offered; past that the package logs a warning.
- Dragging a card to one of these lanes writes that document's reference into the picker, exactly as
  picking it by hand would.
- A multi-value picker holding more than one document puts its card in "Unassigned" — a card belongs
  to one lane.
- Tree pickers rooted in Media or Members are ignored: those restrict media/member types, which are
  not documents.

### Wiring a Board/Calendar to a Collection

A Board or Calendar data type isn't added directly to a Collection. Instead, open the **Collection** data type you want to enhance and go to its new "Kanban" tab — it has two picker rows, "Board configuration" and "Calendar configuration", each letting you pick an existing Kanban Board / Kanban Calendar data type or create one inline. Once picked, the Collection's own list view gains the corresponding "Kanban" and/or "Calendar" tab for editors.

## Contributing

### Requirements

- .NET 10 SDK
- Node.js 22+
- An Umbraco 18 site to install the built package into for manual testing (the repo does not ship a demo site)

### Solution layout

- `src/Umbraco.Community.Kanban` – the main package (server-side property editors/controllers plus the backoffice client under `Client/`)
- `src/Umbraco.Community.Kanban.Contentment` – the optional Contentment integration
- `tests/Umbraco.Community.Kanban.Tests` and `tests/Umbraco.Community.Kanban.Contentment.Tests` – xUnit test projects for the two packages above

### Building

The backoffice UI lives in `src/Umbraco.Community.Kanban/Client` and is built separately from the .NET project, which picks up its output as static web assets:

```bash
cd src/Umbraco.Community.Kanban/Client
npm ci
npm run build      # tsc --noEmit && vite build
# or, while iterating on the client:
npm run watch       # vite build --watch
```

Then build the .NET solution:

```bash
dotnet build Umbraco.Community.Kanban.slnx
```

This mirrors what CI (`.github/workflows/build.yml`) runs on every push and pull request.

### Testing

```bash
# .NET tests
dotnet test Umbraco.Community.Kanban.slnx

# client-side tests (Vitest)
cd src/Umbraco.Community.Kanban/Client
npm run test
```

## Logo

The package logo uses the "kanban" (by Humam) icon from the <a href="https://thenounproject.com/browse/icons/term/kanban/" target="_blank" title="kanban Icons">Noun Project</a> (CC BY 3.0)