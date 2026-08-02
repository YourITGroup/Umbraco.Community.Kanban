# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Two NuGet packages that add **Kanban board** and **Calendar** collection views to the Umbraco 18 backoffice, rendering a document's children as draggable cards grouped by a property value (board) or placed on a date property (calendar).

- `Umbraco.Community.Kanban` — the main package: server-side property editors + Management API, plus the backoffice client under `Client/`.
- `Umbraco.Community.Kanban.Contentment` — optional add-on letting a Contentment "Data List" property supply lanes/categories.

Target: **.NET 10**, **Umbraco CMS 18.x**, **Lit 3**, **Node 22+**. The repo ships **no demo site** — manual verification requires installing the built package into a separate Umbraco 18 site.

`README.md` documents the end-user configuration surface (every data type setting, and where lanes come from). Read it before changing configuration options — it is the contract, and it should be updated alongside them.

## Commands

The client is built by Vite into `src/Umbraco.Community.Kanban/wwwroot/App_Plugins/UmbracoCommunityKanban` and picked up by the .NET project as static web assets. **Build the client before the solution**, in that order — this is what CI does.

```bash
# Client (from src/Umbraco.Community.Kanban/Client)
npm ci
npm run build        # tsc --noEmit && vite build
npm run watch        # vite build --watch, while iterating
npm run test         # vitest run
npm run test:watch
npx vitest run src/core/lane.model.test.ts        # a single test file
npx vitest run -t 'name of the test'              # a single test by name
npx tsc --noEmit                                  # type-check only

# Solution (from the repo root)
dotnet build Umbraco.Community.Kanban.slnx
dotnet test Umbraco.Community.Kanban.slnx
dotnet test tests/Umbraco.Community.Kanban.Tests --filter FullyQualifiedName~KanbanBoardServiceTests
```

## Architecture

### Server pipeline (board and calendar share it)

A request for a board or calendar flows: **controller → configuration resolver → content loader → group resolver → composer/mapper → response model**.

- `Controllers/` — Management API controllers, all deriving from `KanbanControllerBase` (backoffice-access policy, `[MapToApi("kanban")]`, routed under `/umbraco/kanban/api/v{version}` via `KanbanVersionedRouteAttribute`).
- `Services/` — one interface per responsibility, all registered as singletons in `Extensions/UmbracoBuilderExtensions.AddKanban()`, which is idempotent (guards on `IKanbanGroupResolver` already being registered) and invoked by `Composers/KanbanComposer`.
- `Grouping/` — turns the lane/category property's *data type configuration* into groups. This is the package's main extension point:
  - `IKanbanGroupSource` implementations (`ManualGroupSource`, `CoreListEditorGroupSource`, `ContentInstanceGroupSource`, and the Contentment package's `ContentmentDataListGroupSource`) each claim a family of property editors via `CanHandle`.
  - Registration order matters: manual is appended first so a configuration pinning it wins; Contentment appends last.
  - "Group" is deliberately view-neutral vocabulary — a board renders one as a swimlane, a calendar as a category. One source feeds both; don't reintroduce lane-specific naming in `Grouping/`.
- `Constants.cs` — aliases and caps (`DefaultGroupCap`, `DefaultChildCap`, `DefaultCalendarCap`, …). Several constants are **mirrored** in `Client/src/constants.ts` (notably `kanban.boardConfigId` / `kanban.calendarConfigId`); change both together.

### Client (`src/Umbraco.Community.Kanban/Client/src`)

Vite builds a single ES module from `bundle.manifests.ts`, which is both the extension bundle registered by `public/umbraco-package.json` **and** the package's public API — it re-exports the standalone board/calendar custom elements consumed via the `@umbraco-community/kanban` importmap entry.

- `core/` — the board/calendar elements plus **pure, framework-free models** (`*.model.ts`) holding all the logic: lane paging, drag hit-testing, calendar overlap, pan, zoom, realtime queueing, viewer time zone.
- `data/` — `KanbanDataSource` interface, query/body builders, and the `umbHttpClient`-backed server implementation.
- `hosts/` — the three ways a board/calendar is surfaced: collection view, per-document-type workspace tab, and standalone custom element. `hosts/entry-point.ts` also swaps core's `Umb.Collection.Document` manifest `element` (keeping its `api`/`meta`) so Kanban views can suppress the list-view pager; `onUnload` restores it.
- `property-editors/` and `workspace-views/` — the data type configuration UI, including the "Kanban" tab added to Collection data types that picks/creates a board or calendar configuration.

The split matters for testing: **Vitest runs in Node with no DOM**, so only pure models get unit tests; Lit elements are verified by `tsc --noEmit` plus the build. Never value-import a DOM-touching core package (e.g. `@umbraco-cms/backoffice/document`) from a file a test transitively imports — use string-literal aliases with a comment, as `workspace-view.model.ts` does.

## Conventions

**C#** — file-scoped namespaces, primary constructors, no underscore prefix on private fields, nullable enabled. Tests are xUnit + FluentAssertions (both via `GlobalUsings.cs`) with **hand-written fakes only, no mocking frameworks** — see `tests/*/Fakes/`. `InternalsVisibleTo` is set for the main test project.

**TypeScript/Lit** — private members use `#name`, `@state()` fields use `_name`, imports carry explicit `.js` extensions (`verbatimModuleSyntax`), `@/` aliases `src/`. `strict`, `noUnusedLocals`, and `noUnusedParameters` are on.

**Dates/time zones** — models do date-part (`{year, month, day}` / ISO `yyyy-MM-dd`) arithmetic and never construct a local-zone `Date`. `core/viewer-time.model.ts` is the single exception: it is the only model allowed to interpret a real moment, rendering a zone-carrying value in the *viewer's* zone via `Intl` with an explicit `timeZone`.

**Comments** — the existing code explains *why* a non-obvious choice was made (see `entry-point.ts`, `kanban-server-data-source.ts`) rather than restating the code. Match that.

## Versioning and release

Version lives in **both** `.csproj` files (`<Version>`) and is the source of truth for CI — `build.yml`/`release.yml` parse it out of `Umbraco.Community.Kanban.csproj`. Keep the two packages in lockstep. NuGet dependency versions are managed centrally in `Directory.Packages.props`; framework/nullable settings in `Directory.Build.props`.

Pushing to a `release/*` branch packs both projects, publishes to NuGet, and creates a `v{version}` tag. A version with a `-suffix` is published as a pre-release.

## Documentation workflow

`docs/superpowers/specs/` holds dated design documents (decisions and their rationale) and `docs/superpowers/plans/` the task-by-task implementation plans built from them. `docs/TODO.md` tracks status against the original design's milestones and the ad-hoc backlog — it is the fastest way to learn what is built, what was deliberately scoped out, and what has only ever been proven by unit test rather than by hand in a browser. Read it before starting feature work, and update it when a feature lands.

Note the numbering trap `docs/TODO.md` calls out: plan filenames like `…milestone-4-canvas-and-drag-ghost.md` are named in *build* order and do not correspond to the design's own milestone numbers.
