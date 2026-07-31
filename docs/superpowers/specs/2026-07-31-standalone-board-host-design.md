# Standalone Board Host + Bookings Reservations Workspace — Design

**Date:** 2026-07-31
**Status:** Approved design, pending implementation plan
**Closes:** Design milestone 5, host #3 (the injected host) — plus its first real consumer.

## Problem

The package's importmap module (`@umbraco-community/kanban` → the bundle built from
`bundle.manifests.ts`) exports only `manifests`. A third-party backoffice extension that wants to
render a Kanban board — the "injected host" the master design promised — has no public element to
import. The raw `<umb-community-kanban-board>` exists but a consumer would have to re-implement
everything the workspace-view host learned the hard way: the actions context, the Publish/Undo bar
with its measured `bottom-inset`, and the `UMB_WORKSPACE_MODAL` open/create wiring.

The first consumer is the your-it-team-cloud Bookings backoffice section: a **Reservations**
sidebar group whose menu item opens a workspace hosting a bookings board.

## Decisions already made (with the user)

- Parent node key and configuration key come from **appsettings** on the Bookings side, served to
  the client by a Bookings Management API endpoint — GUIDs differ per environment and survive
  content rebuilds.
- The sidebar gets a **new "Reservations" group above Settings** (Settings is weight 100), with a
  menu item that opens the workspace.
- Culture is not passed by Bookings — its content is invariant. The attribute stays supported for
  other consumers.

## Half 1 — Kanban package: `<umb-community-kanban-standalone-board>`

New element `src/hosts/kanban-standalone-board.element.ts`, tag
`umb-community-kanban-standalone-board`.

**Attributes/properties:**

- `parent-id` (string, required) — the board's parent document key.
- `config-id` (string, required for this host) — the board configuration key. Unlike the
  collection host there is no Collection data type to resolve one from, so it must be explicit.
- `culture` (property, string | null, optional) — omitted means invariant.

**It owns, moved from the workspace-view host:**

- Its own `KanbanServerDataSource`.
- `UmbKanbanBoardActionsContext` provision plus the shared `umb-community-kanban-action-bar`,
  rendered in flow below the board with the measured-height → `bottom-inset` handshake.
- The `UMB_WORKSPACE_MODAL` route registration (path segment `kanban-standalone-document`) with
  the open-document / create-child handlers and the reload-on-submit behaviour.
- The `#loadedFor` change-guard so re-renders are not re-fetches. For this element the guard keys
  on `parentId|configId|culture` — all three arrive as attributes and any may change.
- `:host { display: block }` only (the clips-aware viewport measurement from 5b makes this safe).

**Culture semantics differ from the workspace host:** attributes are the contract here, so there
is no "wait for the variant context" gate. If `culture` is unset the board loads invariant;
whatever host embeds it decides whether to wait for a culture before setting attributes.

**The workspace-view host becomes a thin wrapper.** `kanban-workspace-view-board.element.ts`
keeps only its workspace-specific concerns — consuming `UMB_DOCUMENT_WORKSPACE_CONTEXT` for the
parent key, `UMB_VARIANT_CONTEXT` for the culture (with its existing truthy-culture gate), and
reading `meta.kanbanConfigId` from its manifest — and renders the standalone element. The loader
placeholder while the parent is unknown stays in the wrapper. One implementation, three hosts.

**Public exports.** `bundle.manifests.ts` (the importmap module) additionally:

- imports `./hosts/kanban-standalone-board.element.js` for its side effect (element definition),
  and re-exports the class as `UmbCommunityKanbanStandaloneBoardElement`;
- keeps exporting `manifests` unchanged.

Nothing else becomes public. The raw board element, datasources, and contexts stay internal — the
standalone element *is* the third-party API surface.

## Half 2 — Bookings (your-it-team-cloud): Reservations workspace

### Server

- `src/Bookings/Configuration/ReservationsSettings.cs` — `[UmbracoOptions]` bound to
  `Bookings:Reservations`, properties `Guid? BookingsRootKey`, `Guid? KanbanConfigKey`. Follows
  the existing settings-class pattern (file-scoped namespace, no constructor DI needed).
- `src/Bookings/Controllers/Management/ReservationsController.cs` —
  `: BookingsManagementControllerBase`, `[VersionedBookingsManagementApiRoute("reservations")]`,
  `GET board` returning `ReservationsBoardResponseModel { Guid? ParentId, Guid? ConfigId }`.
  Nulls pass through when unconfigured; the client renders guidance, not an error.
- Client API regenerated with `npm run generate-client`.

### Client (`src/Bookings/Client`)

- `src/section/manifests.ts` — add a "Reservations" `sectionSidebarApp` kind:menu (weight 200,
  above Settings' 100) and a `menuItem` "Bookings Board" (`icon-columns`, entity type
  `reservations-board`), mirroring the Xero Connections pattern.
- `src/workspaces/reservations/` — `constants.ts`
  (`RESERVATIONS_BOARD_ENTITY_TYPE = 'reservations-board'`,
  `RESERVATIONS_WORKSPACE_ALIAS = 'YourBookings.Workspace.Reservations'`), `manifests.ts`
  (workspace manifest with `meta.entityType`), and the workspace element:
  - fetches `GET reservations/board` via the generated client;
  - when both GUIDs are present, imports `@umbraco-community/kanban` and renders
    `<umb-community-kanban-standalone-board parent-id config-id>` inside an `umb-body-layout`
    with a headline;
  - when either GUID is missing, shows guidance naming the two appsettings keys
    (`Bookings:Reservations:BookingsRootKey`, `Bookings:Reservations:KanbanConfigKey`);
  - a local `types/umbraco-community-kanban.d.ts` (`declare module '@umbraco-community/kanban'`)
    supplies types for the bare import, since the package is not an npm dependency.
- Vite: no change — the existing `external: [/^@umbraco/]` already externalises
  `@umbraco-community/kanban`, which resolves at runtime through the Kanban package's importmap.
- `YourITTeam` site: appsettings entries for the two GUIDs per environment (Development first).

### Board sizing in the workspace

The standalone element is `display: block` and the board's viewport measurement finds the nearest
clipping, definite-height ancestor — inside `umb-body-layout`'s scrolling main area this resolves
correctly, exactly as the 5b workspace tab does. No extra sizing CSS is expected; if the body
layout's main area does not clip, the hosting element adds `overflow-y: auto; height: 100%`.

## Error handling

- Kanban half: unchanged board behaviour; a missing/empty `config-id` surfaces the board's own
  "no configuration" state.
- Bookings half: endpoint failure or missing GUIDs → guidance panel, never a broken board. No
  retry logic — reopening the workspace refetches.

## Testing

- **Kanban:** no new pure logic (a re-composition of tested parts) → verified by `tsc --noEmit`,
  `vitest run` (existing suites), `npm run build`. Hand-check: existing workspace tab still works
  after the wrapper refactor.
- **Bookings:** no client test runner → `npm run build` (tsc + vite). Server half builds with the
  solution. Hand-check: Reservations menu appears, board loads, guidance shows when settings are
  removed.

## Repo etiquette

All git operations happen in the Kanban repo only. The your-it-team-cloud half is left uncommitted
for the user (standing rule: no git commands in that repo unless asked).
