# Real-time board sync — Design

**Date:** 2026-07-31
**Status:** Approved for planning
**Target:** Umbraco CMS 18.x, .NET 10
**Parent design:** [2026-07-28-umbraco-community-kanban-design.md](2026-07-28-umbraco-community-kanban-design.md), §5 *Real-time* and milestone 5

## Purpose

Multiple editors viewing the same board see each other's changes within a moment of them happening.
A colleague saving, moving, creating, trashing or deleting a child document updates the board without
a manual refresh, with a brief highlight on the changed card so the change is visible rather than
silent.

This is the first half of the original design's milestone 5, split out by agreement on 2026-07-31.
The **content-app host** is the other half and gets its own spec and cycle after this one; it was
deliberately ordered second because real-time benefits the collection-view host editors use today,
while the content app adds a new surface.

## Non-goals

- Presence indicators, "who is editing" avatars, custom SignalR hubs (out of v1 per the parent design)
- Reacting to DocumentType or DataType events — a configuration change already requires re-opening
  the board, and nothing on a board renders type metadata that can change without its documents also
  being republished
- Batching events server-side, or any server push beyond what Umbraco already broadcasts
- Browser automation tests (out of v1 per the parent design)

## Architectural facts this design rests on

Verified against the installed `@umbraco-cms/backoffice` **18.0.2** dist and the Umbraco-CMS source:

| Finding | Where | Consequence |
|---|---|---|
| The server-event context is a **public export** in 18.x: `UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT` from `@umbraco-cms/backoffice/management-api` | `dist-cms/packages/management-api/index.d.ts` re-exports `server-event/constants.js` → the token | Core code can consume it without touching `dist-cms` paths. The parent design's name for it, `UMB_SERVER_EVENT_CONTEXT`, is stale — this spec supersedes it |
| The context exposes `events` (all), `byEventSourcesAndEventTypes(sources, types)` (filtered observable) and `isConnected` (`UmbBooleanState`, starts `undefined`) | `server-event.context.ts` | Filtering and reconnect detection need no code of our own |
| The event model is `{ eventSource, eventType, key, clientTimestamp }` — nothing else | `server-event/global-context/types.ts` | Every event costs one fetch to learn what actually changed; there is no payload to reconcile from directly |
| Document events arrive as `eventSource: 'Umbraco:CMS:Document'` with `eventType` `'Created'`, `'Updated'`, `'Deleted'`, `'Trashed'` | `ServerEventSender.cs`; consumed identically by core's own `document-item.server.cache-invalidation.manager` | These four strings are the subscription filter. Core's own cache invalidation uses the same channel, so authorisation is already handled server-side and events only reach users allowed to see them |
| A **save** raises `Updated`; a **publish** also raises `Updated`; restore-from-recycle-bin raises `Updated`; `Trashed` and `Deleted` are distinct types | `ServerEventSender.cs` | `Deleted` and `Trashed` can skip the fetch and go straight to removal; everything else fetches |
| No endpoint exists to fetch one card — `GET /board` composes whole boards only | this repo, `BoardController.cs` | The parent design's "refetch that single item" requires a new server endpoint, specified below |

## Server: `GET /card/{key}`

New action on the existing `CardController`, following `GET /board`'s conventions exactly (versioned
route, backoffice auth, ProblemDetails on 400).

**Query:** `parentId` (required), `configId` (optional), `culture` (optional) — resolved through the
same `IKanbanBoardConfigurationResolver` path as `GET /board`: an explicit `configId` wins, otherwise
the parent's list-view data type supplies it.

**Response — `KanbanCardResponseModel`:**

```
{ isChild: true,  laneValue: "confirmed", card: { …KanbanCardModel… } }
{ isChild: false }
```

- `isChild: true` — the document is a browseable child of `parentId`. `card` is composed by the same
  `KanbanCardMapper` the board uses: same card properties, same `canUpdate`/`canCreate` permission
  flags (fetched for this one key), same child list when the configuration's `showChildItems` is on
  (one `GetPagedChildren` of the card, capped by `Constants.CardChildDisplayCap`). `laneValue` is
  read by `KanbanLaneValueReader` for the requested culture — the raw stored value, which the client
  matches to a lane the same case-insensitive way `KanbanBoardComposer` does.
- `isChild: false` — the document exists but is not a child of this parent, or the user may not
  browse it. One shape for both, deliberately: either way the client must not show it, and
  distinguishing them would leak the existence of documents the user cannot browse.
- `404` — no document with this key, **or** no parent with `parentId`. Both map to 404 at the
  controller and the client does not distinguish them: either way the fetched card cannot be shown,
  and if the parent itself is gone the whole board is moments from being torn down anyway.
- `400` ProblemDetails — configuration missing/not found, same wording as `GET /board`.

**Status enum:** `KanbanCardStatus { Success, NotChild, CardNotFound, ParentNotFound, ParentAccessDenied, ConfigurationNotFound, NotConfigured }`,
service method `GetCardAsync(KanbanCardRequest, IUser)` on the existing `IKanbanCardService` beside
`SetLaneAsync`. Browse permission on the parent gates the whole call, as `GetBoardAsync` does.

## Client

Three units, each with one job, respecting the existing `core / data / hosts` layering. Sync lives in
**core**, so the collection-view host gets it now and the future workspace-view and injected hosts
get it for free. Consuming a global context from core breaks no layering rule — `UMB_NOTIFICATION_CONTEXT`
is already consumed there; the rule is that core imports nothing from `hosts/`.

### 1. `data/` — `getCard` on the datasource

`KanbanDataSource` gains one member beside `getBoard`/`setLane`:

```ts
export interface KanbanCardQuery {
  key: string;
  parentId: string;
  configId?: string;
  culture?: string | null;
}

export type KanbanCardOutcome =
  | { kind: 'child'; laneValue: string; card: KanbanCardModel }
  | { kind: 'not-child' }   // isChild: false — remove if held
  | { kind: 'gone' }        // 404 — remove if held
  | { kind: 'error' };      // transient; do nothing, never remove on a failed fetch

getCard(query: KanbanCardQuery): Promise<KanbanCardOutcome>;
```

`buildCardQuery` mirrors `buildBoardQuery` (pure, tested — the empty-culture rule is the same).
The server data source implements it; test fakes implement it trivially.

### 2. `core/realtime.model.ts` — the reconciliation reducer

Pure functions over `KanbanBoardState`, in the exact style of `moveCard`/`mergeLanePage`
(never mutate, `sameLane` case-insensitive matching, unassigned lane addressed by `''`):

```ts
/** Folds one fetched card into the board. */
export function applyCardResult(
  state: KanbanBoardState,
  key: string,
  outcome: KanbanCardOutcome,
): { state: KanbanBoardState; changed: boolean }
```

- `child`, card already held, same lane → replace the card in place. `changed: true` only if the
  card actually differs (compare by reference is useless on a fresh fetch; compare name, state,
  laneValue, and property values — or simply always treat a `child` result as changed; simplicity
  wins: **always changed**, the highlight just re-pulses).
- `child`, card held in a *different* lane → remove from the old lane, append to the new lane's
  cards, totals −1/+1 (respecting `totalIsExact` exactly as `moveCard` does).
- `child`, card not held → append to its lane's card list, total +1. Appending rather than
  guessing sort position is deliberate; the next full load restores true order. If the lane value
  matches no lane, it belongs to the unassigned lane (`''`), same as the board composer's rule.
- `not-child` / `gone`, card held → remove from its lane, total −1. Covers deletion, trashing, a
  colleague moving the document to a different parent, and permission loss, in one rule.
- `not-child` / `gone`, card not held → no-op, `changed: false`.
- `error` → no-op. A transient fetch failure must never remove a card.
- **`saving` guard:** if the held card has `saving: true`, return the state unchanged. That is our
  own optimistic write's echo arriving before the `PUT` resolves; the write's own completion path
  owns that card's state.

`changed` drives the highlight and tells the board whether to re-render at all.

### 3. `core/kanban-realtime.controller.ts` — the subscription

A thin `UmbControllerBase` the board element instantiates, configured with callbacks rather than
reaching into the board:

- Consumes `UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT`; subscribes via
  `byEventSourcesAndEventTypes(['Umbraco:CMS:Document'], ['Created', 'Updated', 'Deleted', 'Trashed'])`.
- `Deleted`/`Trashed` → report `{ kind: 'gone' }` for that key directly, **no fetch** — the same
  `applyCardResult` reducer path a fetched 404 takes, so removal has exactly one implementation.
- `Created`/`Updated` → call `getCard` through the board's injected datasource and report the
  outcome. **In-flight coalescing:** a key whose fetch is already pending is skipped — the pending
  response is about to land and a fresh save would raise another event anyway.
- **Pause/flush:** the board tells the controller when a drag starts and ends. While paused, events
  queue (latest event per key wins); on resume the queue flushes. The board must never reorganise
  under the user's pointer.
- Observes `isConnected`: a transition to `true` from `false` (not from `undefined`, which is the
  initial connect) reports "resync needed" — the board answers with one full `load()`, because
  events during the gap are lost, not queued, and Umbraco's hub replays nothing.
- The event for a key the board's *parent* itself matches is ignored — the workspace above the
  board owns the parent's lifecycle.

### Board element wiring

- Instantiates the controller, handing it the datasource, the current `parentId`/`configId`/`culture`
  (re-supplied whenever they change), and callbacks that run the reducer and set `_board`.
- Keeps `_recentlyChanged: Set<string>`; a `changed` reconciliation adds the key and clears it after
  ~2 s. Passed to the card as a `highlight` boolean attribute driving a short CSS pulse
  (background/border flash using `--uui-color-selected` at low alpha; `prefers-reduced-motion`
  respected by dropping the animation and keeping a plain border tint).
- Drag start/end already dispatch through the board's orchestration — the same paths call
  `controller.pause()` / `controller.resume()`.

## Interaction with what exists

- **Own writes:** optimistic move → `PUT` → server raises `Updated` → echo event → fetch → reducer's
  `saving` guard skips it while in flight; afterwards re-applying the server's own answer is
  idempotent. No suppression protocol needed.
- **Publish pending changes:** publishing N cards raises N `Updated` events; each is one small,
  coalesced fetch that confirms the new published state — the same reconciliation the publish loop
  already does locally, arriving twice, idempotently.
- **The collection host's reload-on-`items`** signal stays as is; it covers this user's own
  list-view-adjacent actions, while server events cover other users. Both funnel through the same
  board state; double refreshes are harmless and rare.
- **Truncated boards:** an insert past the child cap still shows the card; the lane total was a
  lower bound already and stays one.

## Testing

Node/Vitest, no DOM, matching the repo's rules (pure models tested; elements verified by
type-check + build):

- **Reducer** (`realtime.model.test.ts`): same-lane replace; cross-lane move with both totals;
  insert-unknown into named lane; insert-unknown with unmatched lane value → unassigned; remove on
  `not-child`; remove on `gone`; no-op on `error`; no-op remove for unheld key; `saving` guard;
  `totalIsExact` preserved through each; unassigned lane addressed by `''`.
- **Query builder** (`kanban-data-source.test.ts` additions): culture omitted when empty, configId
  optional.
- **Server** (`KanbanCardServiceTests` additions): child of parent → card + lane value; not a child →
  `NotChild`; child but browse-denied → `NotChild` (not a distinct status); unknown key →
  `CardNotFound`; parent browse-denied → `ParentAccessDenied`; configuration resolution parity with
  `GetBoardAsync` (explicit configId wins, list-view fallback); culture-variant lane value read.
- **Controller**: kept thin enough that `tsc --noEmit` + build is its verification, like every other
  controller/element in the repo. The queue/coalesce logic, if it grows beyond trivial, is extracted
  into a pure `realtime-queue.model.ts` and tested (latest-event-per-key-wins, flush order).

## Milestone placement

This is milestone **5a**. Milestone **5b** (content-app host: per-configuration `workspaceView`
registration from `GET /configurations` + `appliesTo`, likely a custom content-type-key condition)
follows as its own spec → plan → implement cycle. `docs/TODO.md`'s milestone 5 entry tracks both.
