# Milestone 3 — Drag write-back, pending state, publish-all

**Date:** 2026-07-30
**Status:** Approved for planning
**Parent design:** [2026-07-28-umbraco-community-kanban-design.md](2026-07-28-umbraco-community-kanban-design.md)
**Builds on:** milestone 2 (read-only board), milestone 6 (Contentment lane source, merged ahead of this)

Milestone 2's board can only be looked at. This milestone makes it usable: dragging a card between
lanes writes the lane property back (save only, never publish), a moved card immediately shows a
pending-changes state, and a toolbar action publishes every pending card in one confirmed step.

---

## 1. Scope

**In**

- `PUT /card/{key}/lane` — sets the card's lane property, save only.
- Pointer-driven drag from a card to a lane, gated on the board's `allowDrag` and the card's
  `canUpdate`.
- Optimistic move: the card relocates immediately, the write fires in the background, and a failure
  snaps it back with an error notification.
- The moved card's publish-state badge flips to pending immediately, then reconciles to whatever the
  server actually persisted.
- A "Publish pending changes (N)" toolbar action, reusing Umbraco's own client-side publishing
  repository rather than a new server endpoint (see §3).

**Out** (so the plan cannot drift into them)

- Calendar drag-to-reschedule — milestone 4.
- Real-time reconciliation when another editor moves a card — milestone 5. This milestone is
  single-editor optimistic-write-and-confirm only.
- Validating a dropped lane value against the property's own legal options — the board only ever
  offers drop targets it resolved as real lanes with `acceptsDrops: true`, so this cannot occur through
  the UI. A hand-crafted request bypassing the UI is out of scope the same way it is for every other
  write endpoint in this package.
- Server-side discovery of pending cards beyond what the board has loaded. See §3 for why this is a
  deliberate scope line, not an oversight.

---

## 2. Server: `PUT /card/{key}/lane`

A new `CardController`, alongside `BoardController` and `LanesController`:

```
PUT /card/{key}/lane
Body: { laneValue: string, culture?: string }
```

Flow:

1. Load the card by key (`IKanbanContentLoader.GetById(Guid)`, already exists — used today to load the
   board's own parent). 404 if missing.
2. Resolve its parent and that parent's board configuration, the same way `KanbanBoardService`
   already does (parent → content type → configuration). 400 with the same "no configuration" /
   "configuration not found" problem details the board endpoint already returns on the same failure —
   this reuses `IKanbanBoardConfigurationResolver`, not a second copy of that logic.
3. Reject with 400 if the resolved configuration's `AllowDrag` is off. A disabled-drag board must
   refuse this write even called directly, not just hide the UI for it.
4. Require **Update** permission on the card (`IContentPermissionAuthorizer`, `ActionUpdate`) — 403
   otherwise. This is the same permission `CanUpdate` on the card model already reports, so a client
   respecting that flag never hits this path, but the server does not trust the client.
5. Set the lane property value and save through a new `IKanbanContentWriter` — a narrow wrapper over
   `IContentService`, mirroring how `IKanbanContentLoader` wraps its own read slice so the service stays
   testable against a fake rather than a live `IContentService`:

   ```csharp
   public interface IKanbanContentWriter
   {
       KanbanCardSaveResult SetLaneValue(IContent content, string laneProperty, string laneValue, string? culture);
   }
   ```

   Culture targeting follows `KanbanCardMapper`'s own rule: the property's own variation, not the
   document's — an invariant property on a varying document still writes with no culture. `Save`,
   never `SaveAndPublish` or any publish call — the whole point is that a drag is reversible before it
   goes live.
6. Return the card's resulting state, computed by the same `KanbanCardStateResolver.Resolve` the board
   already uses (`content.Published`/`Edited`, or the culture-specific pair) — the client applies what
   was actually persisted rather than trusting its own optimistic guess.

**Why a bespoke endpoint instead of core's own `PUT /document/{id}`:** that endpoint
(`UpdateDocumentController`) takes a full `values` array via `IContentEditingService` — a
whole-document replace, not a single-property patch. The board's card model only carries the
configured summary properties, not every property on the document, so reusing it would mean fetching
the full document first and resending everything back — the same "top-level spread replaces the whole
array" hazard already documented for block values, applied to an entire document instead of one
property. A minimal endpoint touching exactly the lane property is deliberately narrower and safer
than routing through the generic editing pipeline for a single scalar write.

### `AllowDrag` reaches the client

`KanbanBoardConfiguration.AllowDrag` already exists server-side but stops at the composer today.
Milestone 3 threads it through, the same way `ShowChildItems` already is:
`KanbanBoardComposer` → `KanbanBoardResponseModel.AllowDrag` → client `KanbanBoardModel.allowDrag` →
`KanbanBoardState.allowDrag`.

The board element's `readonly` property — currently hardcoded `true` by every host, with a comment
marking it for this milestone — is retired. Dragging is gated on `_board.allowDrag && card.canUpdate`,
read from the response, not a host-supplied attribute: only the server knows both the configuration and
the per-card permission, and a host has neither.

---

## 3. Client: publish pending changes — no new server endpoint

Umbraco's own document list-view bulk "Publish" action
(`publish.bulk-action.js`, verified against the installed backoffice package) has no server-side bulk
endpoint behind it either: it loops the single-document `UmbDocumentPublishingRepository.publish(id,
variants)` per selected item, client-side, counting successes for its notification. This milestone
follows the same shape rather than inventing a `/publish-pending` controller:

- `pendingCards(state: KanbanBoardState): KanbanCardModel[]` — a pure `board.model.ts` function
  filtering every lane's held cards to `state === 'publishedPendingChanges'`. This is scoped to what
  the board currently holds in memory, the same way the core bulk action is scoped to `this.selection`
  — neither one server-queries for items that were never loaded/selected. A card sitting in an
  unpaged lane page, or beyond the board's truncation cap, will not appear here until it is paged in.
  This is a real, named scope line (not silently discovered later): a very large board's "Publish
  pending changes" is convenience-scoped to what's on screen, matching the rest of the backoffice's own
  convention rather than being exhaustive.
- The toolbar itself is not a custom-styled bar: it is a plain `uui-button` (`look="primary"
  color="positive" icon="icon-globe"`, the same icon Umbraco's own publish entity action and bulk
  action both use) with a `uui-badge` for the count — the identical component the lane header already
  uses for its total. No bespoke button styling, no reinvented publish iconography. It is **not** the
  same component as `umb-collection-selection-actions` (core's selection-driven bulk-action bar) —
  that component is keyed to the collection's checkbox selection, which this board has none of; ours
  is a standalone board-level action, rendered by the board element itself above `.lanes`, in the same
  place the existing truncation message already renders.
- The count and the confirmation dialog's card list (via `umbConfirmModal`, the same helper the core
  bulk action uses — `color: 'positive'`, `confirmLabel: this.localize.term('actions_publish')`) both
  come from `pendingCards`.
- On confirm: loop `UmbDocumentPublishingRepository.publish(card.key, [{ variantId }])`, one call per
  pending card, `variantId` built from the board's own `culture` (or the invariant variant when the
  content type doesn't vary) — mirroring `publish.bulk-action.js` exactly. Track success/failure per
  card; on success, flip that card's local `state` to `published` without a full board reload; on
  failure, leave it `publishedPendingChanges` and fold it into one summary notification ("Published 6
  of 8 — 2 failed") rather than one toast per card.

---

## 4. Client: drag interaction & optimistic move

### Pure model functions (`board.model.ts`, unit-tested like `mergeLanePage`)

- `moveCard(state, cardKey, fromLane, toLane): KanbanBoardState` — removes the card from its source
  lane's array (decrementing that lane's `total`), appends it to the target lane's array
  (incrementing `total`). Never mutates its input. The revert-on-failure path is the same function
  called with the lanes swapped back — no separate undo function.
- `nextStateAfterSave(state: KanbanCardState): KanbanCardState` — `published` → `publishedPendingChanges`,
  everything else unchanged. Drives the immediate optimistic badge flip; superseded by whatever the
  server actually returns once the write resolves.
- `pendingCards` — see §3.

### Pointer flow

Same `PointerEvent` + `setPointerCapture` shape the existing board-pan uses, initiated on
`kanban-card.element` instead of the board background:

```
pointerdown on a card, card.canUpdate && board.allowDrag, pointerType !== 'touch'
  → card.setPointerCapture(pointerId)
  → dispatch a 'kanban-drag-start' event (bubbles/composed) carrying the card key and source lane
  → board renders a drag ghost/placeholder; existing click-to-open is suppressed for this gesture

pointermove, same pointerId (retargeted to the card regardless of what's visually underneath)
  → board hit-tests the pointer position against its own lane elements' bounding rects
    (only the board can see every lane at once)
  → board sets the current candidate lane's value on a `dropTarget` state; the candidate lane
    itself renders a highlighted background/border when it acceptsDrops, a "not allowed" treatment
    when it does not; every other lane stays unstyled. Only ever one lane highlighted at a time.

pointerup over a lane with acceptsDrops: true
  → moveCard(...) optimistically, re-render
  → nextStateAfterSave(...) flips the badge
  → card marked `saving: true` (dimmed, not draggable again until this resolves)
  → PUT /card/{key}/lane fires

pointerup over a lane with acceptsDrops: false, or no lane at all
  → nothing moves, no write, drag state simply clears

pointercancel / lostpointercapture, mid-drag
  → identical cleanup to pointerup-over-nothing (same reasoning as the existing pan's handling of
    a capture the browser revokes without a pointerup ever arriving)
```

Cards are excluded from the existing board-background pan already (`event.target ===
event.currentTarget` on `.lanes`), so the two gestures cannot collide — this was true before this
milestone and needs no change.

### Lane highlight while dragging

`kanban-lane.element` gains two boolean properties driven by the board's hit-test result:
`is-drop-target` (this lane is the one currently under the pointer) and `accepts-drop` (whether it
would take the card if released now — mirrors the lane model's own `acceptsDrops`). Styling is a
`classMap` on the existing `.lane` container.

The highlight is a **variant of the lane's own colour**, not a generic accent — a lane already
resolves to a colour today (override, source, or the cycled palette; see the parent design's *Lane
colours* section) and exposes it as the `--kanban-lane-colour` custom property, currently set on the
`.header` div only. This milestone moves that variable one level up, onto `.lane` itself, so both the
header and the new highlight can read the same value without threading it through twice:

- **Drop target, accepts:** background uses `color-mix(in srgb, var(--kanban-lane-colour, var(--uui-color-border)) 15%, transparent)`
  and the border switches to a solid 2px `var(--kanban-lane-colour, var(--uui-color-border))` — a
  tinted version of the lane's own colour, so a red "Blocked" lane highlights red and a green "Done"
  lane highlights green, rather than every lane flashing the same generic positive colour.
- **Drop target, rejects:** no tint; a muted dashed border in `--uui-color-border`, independent of the
  lane's own colour — rejection reads as neutral/disabled, not as a variant of the lane's identity.
- **Not the drop target:** unchanged from today, regardless of drag state.
- **Fallback:** the `var(--kanban-lane-colour, var(--uui-color-border))` fallback chain is what covers
  a lane with no resolved colour — reachable today only via the (Unassigned) lane, which the parent
  design already pins to neutral grey and takes no part in the colour cycle, so this fallback is a
  safety net rather than a common case.

Because `dropTarget` lives on the board (the only element hit-testing every lane), the board passes
`is-drop-target`/`accepts-drop` down per lane on each `pointermove` re-render — the same top-down data
flow every other per-lane property (`lane`, `readonly`, `show-child-items`) already uses.

### Write resolution

- **Success:** apply the server-returned `state` (§2 step 6) in place of the optimistic guess, clear
  `saving`.
- **Failure:** call `moveCard` again with lanes swapped to put the card back exactly where it started,
  clear `saving`, show a `uui-toast-notification` ("Couldn't move '{card name}' — {reason}"). 403
  (permission changed mid-session) and 404 (card deleted concurrently) get distinct messages; anything
  else falls back to a generic one.

---

## 5. Testing

Following this codebase's existing split — pure functions unit-tested directly, server logic tested
against fakes, nothing browser-automated:

- **Client, pure:** `moveCard`, `nextStateAfterSave`, `pendingCards` — table-driven, no DOM, matching
  `board.model.test.ts`'s existing style.
- **Client, data source:** the `setLane` request shape (URL, body, culture handling), matching
  `kanban-data-source.test.ts`'s existing coverage of `buildBoardQuery`.
- **Server:** a card-lane-write test suite against fakes for `IKanbanContentLoader` and the new
  `IKanbanContentWriter`, covering: 403 on missing Update permission, 400 on `AllowDrag: false`,
  variant/culture targeting (varying vs. invariant property), and the returned state matching
  `KanbanCardStateResolver`'s own rule.
- **By hand** (no test harness for element-level pointer wiring, same as the existing pan and every
  other interaction in this package): dragging a card into an `acceptsDrops` lane moves it and persists
  on reload; dragging into a disabled/unassigned-incoming lane does nothing; a failed write snaps the
  card back and shows the notification; a card the user cannot update does not start a drag at all;
  "Publish pending changes" publishes exactly the loaded pending cards and reports partial failure
  correctly.

---

## 6. Files

**New**

- `src/Umbraco.Community.Kanban/Controllers/CardController.cs`
- `src/Umbraco.Community.Kanban/Services/IKanbanContentWriter.cs` + implementation
- `src/Umbraco.Community.Kanban/Models/Api/KanbanCardLaneRequestModel.cs` /
  `KanbanCardLaneResponseModel.cs`
- `tests/Umbraco.Community.Kanban.Tests/Controllers/CardControllerTests.cs` (or service-level
  equivalent, matching this package's existing test placement)

**Changed**

- `src/Umbraco.Community.Kanban/Services/KanbanBoardComposer.cs`,
  `Models/Api/KanbanBoardResponseModel.cs` — thread `AllowDrag` through
- `src/Umbraco.Community.Kanban/Client/src/data/kanban-board.types.ts`,
  `kanban-data-source.ts` (+ server implementation) — `allowDrag` on the board model, new `setLane`
  method
- `src/Umbraco.Community.Kanban/Client/src/core/board.model.ts` (+ test) — `moveCard`,
  `nextStateAfterSave`, `pendingCards`
- `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts` — drag pointer handlers,
  hit-testing, the publish-pending toolbar, retiring the hardcoded `readonly` property
- `src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts` — drag pointer handlers,
  `saving` visual state
- `src/Umbraco.Community.Kanban/Client/src/core/kanban-lane.element.ts` — `is-drop-target` /
  `accepts-drop` properties and their highlight styling
- Every host's `?readonly=${true}` binding removed (the collection-view host today; the content-app
  host arrives in milestone 5)
- `docs/ENHANCEMENTS.md` — item 8 ("add a card from the top of a lane") can now be picked up, since it
  explicitly builds on drag existing
