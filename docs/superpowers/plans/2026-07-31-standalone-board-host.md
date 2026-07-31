# Standalone Board Host + Bookings Reservations Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export a standalone Kanban board host element from the package (design milestone 5, host #3) and consume it in the your-it-team-cloud Bookings section as a "Reservations" workspace.

**Architecture:** The 5b workspace-view host's board plumbing (datasource, actions context, Publish/Undo bar with measured `bottom-inset`, workspace-modal wiring, load change-guard) moves into a new `<umb-community-kanban-standalone-board>` element whose contract is three attributes: `parent-id`, `config-id`, `culture`. The workspace-view host becomes a thin wrapper that resolves those three values from workspace contexts. The importmap module re-exports the element class, making it the package's public third-party API. Bookings then adds an appsettings-backed Management API endpoint returning the parent/config GUIDs, and a Reservations sidebar group + workspace whose element fetches them and renders the standalone board.

**Tech Stack:** Umbraco 18 backoffice (Lit 3, TypeScript, Vite, Vitest-in-Node), .NET 10 (Kanban) / Bookings project (.NET, `[UmbracoOptions]`, hey-api openapi-ts generated client).

## Global Constraints

- Kanban repo work happens on branch `tasks/standalone-board-host` off `main`; commit per task.
- **NEVER run git in /Users/gandalf/Source/Repos/your-it-team-cloud** — Tasks 4–8 change files there but are committed by the user, not by the agent. Always invoke git as `git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban …` so a reset shell cwd can never target the wrong repo.
- **Never kill or start the Umbraco dev server on :44353** — the user restarts it; poll until it is back.
- Lit privates use `#name`; `@state()` fields use `_name`. No mocking frameworks. Never import from `@umbraco-cms/backoffice/dist-cms/...`.
- C#: file-scoped namespaces, primary constructors where applicable, no underscore prefix on private fields.
- Kanban client checks run from `/Users/gandalf/Source/Repos/Umbraco.Community.Kanban/src/Umbraco.Community.Kanban/Client`: `npx tsc --noEmit`, `npx vitest run`, `npm run build`. Bookings client checks run from `/Users/gandalf/Source/Repos/your-it-team-cloud/src/Bookings/Client`: `npm run build` (no test runner). Always `cd` with the absolute path in the same command.
- Vitest runs in Node with no DOM: elements are verified by type-check + build only. No new pure logic is introduced by this plan, so no new tests are written.

---

### Task 1: `<umb-community-kanban-standalone-board>` element

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/hosts/kanban-standalone-board.element.ts`

**Interfaces:**
- Consumes: `KanbanServerDataSource`, `UmbKanbanBoardActionsContext`, `umb-community-kanban-board`, `umb-community-kanban-action-bar` (all existing).
- Produces: element class `UmbCommunityKanbanStandaloneBoardElement`, tag `umb-community-kanban-standalone-board`, attributes `parent-id` / `config-id`, property `culture: string | null | undefined`. Task 2 renders this tag; Task 3 exports the class.

- [ ] **Step 1: Create branch**

```bash
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban checkout -b tasks/standalone-board-host
```

- [ ] **Step 2: Write the element**

This is `kanban-workspace-view-board.element.ts` with the workspace/variant context consumption and `manifest` property replaced by public reactive properties. The modal path segment is its own (`kanban-standalone-document`) so it never collides with another host's registration in a shared routing scope. Full content:

```ts
import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbModalRouteRegistrationController } from '@umbraco-cms/backoffice/router';
import { UMB_WORKSPACE_MODAL } from '@umbraco-cms/backoffice/workspace';
import {
  UMB_CREATE_DOCUMENT_WORKSPACE_PATH_PATTERN,
  UMB_CREATE_FROM_BLUEPRINT_DOCUMENT_WORKSPACE_PATH_PATTERN,
  UMB_DOCUMENT_ENTITY_TYPE,
  UMB_EDIT_DOCUMENT_WORKSPACE_PATH_PATTERN,
} from '@umbraco-cms/backoffice/document';
import { KanbanServerDataSource } from '@/data/kanban-server-data-source.js';
import type { KanbanDataSource } from '@/data/kanban-data-source.js';
import {
  UmbKanbanBoardActionsContext,
  type KanbanBoardActionsState,
} from '@/core/board-actions.context.js';
import '@/core/kanban-board.element.js';
import '@/core/kanban-action-bar.element.js';

/**
 * The injected host — the package's public element for third-party backoffice extensions. Everything
 * a board needs beyond the board element itself lives here: the server datasource, the actions
 * context feeding the Publish/Undo bar, the bar's measured height handed to the board as its bottom
 * inset, and the workspace-modal wiring for opening and creating documents.
 *
 * The contract is attributes, not contexts: `parent-id` and `config-id` are required, `culture` is
 * optional (unset means invariant). Whatever host embeds this element decides where those values
 * come from — the workspace-view host resolves them from workspace contexts; a third-party section
 * fetches them from its own API. There is deliberately no "wait for culture" gate here; a host that
 * needs one gates before setting the attributes.
 */
@customElement('umb-community-kanban-standalone-board')
export class UmbCommunityKanbanStandaloneBoardElement extends UmbLitElement {
  /** The board's parent document key. Required; the element renders a loader until it is set. */
  @property({ attribute: 'parent-id' })
  parentId?: string;

  /**
   * The board configuration key. Required for this host: there is no Collection data type for the
   * server to resolve one from.
   */
  @property({ attribute: 'config-id' })
  configId?: string;

  /** Display culture for variant content; unset loads invariant. */
  @property({ attribute: false })
  culture?: string | null;

  #datasource: KanbanDataSource = new KanbanServerDataSource(this);

  /** Bridges the board's pending/undo state to the bar this element renders. */
  #boardActions = new UmbKanbanBoardActionsContext(this);

  @state()
  private _actions?: KanbanBoardActionsState;

  /**
   * The bar's measured height, handed to the board as its bottom inset so the viewport — and its
   * horizontal scrollbar — end above the bar rather than underneath it. Measured, not assumed: the
   * bar's height follows theme sizing variables.
   */
  @state()
  private _barInset = 0;

  /** The parent/config/culture triple the board was last loaded for, so a re-render is not a re-fetch. */
  #loadedFor?: string;

  /** See the collection host: open() silently no-ops until the router hands over a builder. */
  #modalReady = false;

  #documentModal: UmbModalRouteRegistrationController<
    typeof UMB_WORKSPACE_MODAL.DATA,
    typeof UMB_WORKSPACE_MODAL.VALUE
  >;

  constructor() {
    super();

    this.observe(
      this.#boardActions.state,
      (actionsState) => {
        this._actions = actionsState;
      },
      '_kanbanBoardActions',
    );

    // The same registration the other hosts use, under its own path segment so no two hosts'
    // modal routes collide in a shared routing scope.
    this.#documentModal = new UmbModalRouteRegistrationController(this, UMB_WORKSPACE_MODAL)
      .addAdditionalPath('kanban-standalone-document')
      .onSetup(() => ({ data: { entityType: UMB_DOCUMENT_ENTITY_TYPE, preset: {} } }))
      .onSubmit(() => {
        // Nothing tells the board a document was saved in our modal; realtime sync covers other
        // editors, not this same-session modal, so reload explicitly.
        this.#board?.load();
      })
      .observeRouteBuilder(() => {
        this.#modalReady = true;
      });
  }

  get #board() {
    return this.shadowRoot?.querySelector('umb-community-kanban-board') ?? undefined;
  }

  override updated() {
    // Idempotent and change-guarded, so the update it schedules settles in one pass.
    this.#measureBar();

    // All three inputs arrive as properties and any may change; load once the required two are
    // real, and again only when the triple actually changes.
    if (!this.parentId || !this.configId) {
      this.#loadedFor = undefined;
      return;
    }

    const key = `${this.parentId}|${this.configId}|${this.culture ?? ''}`;

    if (key === this.#loadedFor) return;

    this.#loadedFor = key;
    this.#board?.load();
  }

  #measureBar() {
    const bar = this.shadowRoot?.querySelector('umb-community-kanban-action-bar');
    const inset = bar ? Math.ceil(bar.getBoundingClientRect().height) : 0;

    if (Math.abs(this._barInset - inset) >= 1) {
      this._barInset = inset;
    }
  }

  #onOpenDocument(event: CustomEvent<{ key: string }>) {
    if (!this.#modalReady) return;

    this.#documentModal.open(
      {},
      UMB_EDIT_DOCUMENT_WORKSPACE_PATH_PATTERN.generateLocal({ unique: event.detail.key }),
    );
  }

  #onCreateChild(
    event: CustomEvent<{ parentKey: string; documentTypeUnique: string; blueprintUnique?: string }>,
  ) {
    if (!this.#modalReady) return;

    const { parentKey, documentTypeUnique, blueprintUnique } = event.detail;

    const path = blueprintUnique
      ? UMB_CREATE_FROM_BLUEPRINT_DOCUMENT_WORKSPACE_PATH_PATTERN.generateLocal({
          parentEntityType: UMB_DOCUMENT_ENTITY_TYPE,
          parentUnique: parentKey,
          documentTypeUnique,
          blueprintUnique,
        })
      : UMB_CREATE_DOCUMENT_WORKSPACE_PATH_PATTERN.generateLocal({
          parentEntityType: UMB_DOCUMENT_ENTITY_TYPE,
          parentUnique: parentKey,
          documentTypeUnique,
        });

    this.#documentModal.open({}, path);
  }

  #onUndo() {
    void this.#boardActions.undo();
  }

  #onPublish() {
    void this.#boardActions.publish();
  }

  #renderBar() {
    if (!this._actions || this._actions.pending === 0) return nothing;

    return html`
      <umb-community-kanban-action-bar
        .barState=${this._actions}
        @kanban-undo=${this.#onUndo}
        @kanban-publish=${this.#onPublish}></umb-community-kanban-action-bar>
    `;
  }

  override render() {
    if (!this.parentId || !this.configId) return html`<uui-loader></uui-loader>`;

    // The bar sits in flow below the board rather than overlaying it: the board is told to end
    // `bottom-inset` pixels early, so the bar lands exactly in the freed strip and neither the
    // vertical scroll's end nor the horizontal scrollbar hides underneath it.
    return html`
      <umb-community-kanban-board
        parent-id=${this.parentId}
        config-id=${this.configId}
        bottom-inset=${this._barInset}
        .culture=${this.culture}
        .datasource=${this.#datasource}
        @kanban-open-document=${this.#onOpenDocument}
        @kanban-create-child=${this.#onCreateChild}></umb-community-kanban-board>
      ${this.#renderBar()}
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-standalone-board': UmbCommunityKanbanStandaloneBoardElement;
  }
}
```

- [ ] **Step 3: Verify**

```bash
cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban/src/Umbraco.Community.Kanban/Client && npx tsc --noEmit && npx vitest run
```

Expected: clean type-check; all existing suites pass (nothing consumes the new file yet).

- [ ] **Step 4: Commit**

```bash
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban add src/Umbraco.Community.Kanban/Client/src/hosts/kanban-standalone-board.element.ts
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban commit -m "feat: standalone board host element (injected host)"
```

---

### Task 2: Workspace-view host becomes a thin wrapper

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/hosts/kanban-workspace-view-board.element.ts` (replace entire content)

**Interfaces:**
- Consumes: `UmbCommunityKanbanStandaloneBoardElement` tag from Task 1; `UMB_DOCUMENT_WORKSPACE_CONTEXT`, `UMB_VARIANT_CONTEXT`, `ManifestWorkspaceView` (existing).
- Produces: same tag `umb-community-kanban-workspace-view-board` with identical external behaviour — the workspace-view manifests from `workspace-view.model.ts` keep pointing at this module unchanged.

- [ ] **Step 1: Replace the element with the wrapper**

Behaviour preserved exactly: loader until the parent key arrives; the board never loads before a truthy culture (the variant context emits undefined synchronously on subscribe — only a truthy culture is an answer), which the wrapper enforces by not rendering the standalone element until both are resolved. Full new content:

```ts
import { customElement, html, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_VARIANT_CONTEXT } from '@umbraco-cms/backoffice/variant';
import { UMB_DOCUMENT_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/document';
import type { ManifestWorkspaceView } from '@umbraco-cms/backoffice/workspace';
import './kanban-standalone-board.element.js';

/**
 * Adapts the standalone board host to a document workspace tab — the content-app host. Its only
 * job is resolving the standalone element's three inputs: the open document is the board's parent,
 * the display culture comes from the variant context, and which configuration to use rides in this
 * view's own manifest meta, because this host has no Collection data type for the server to resolve
 * one from. Everything else — datasource, actions context, bar, inset, modal wiring — lives in the
 * standalone element.
 */
@customElement('umb-community-kanban-workspace-view-board')
export class UmbCommunityKanbanWorkspaceViewBoardElement extends UmbLitElement {
  /** Set by the extension slot. meta.kanbanConfigId names the configuration this tab serves. */
  @property({ attribute: false })
  manifest?: ManifestWorkspaceView;

  @state()
  private _parentId?: string;

  @state()
  private _culture?: string;

  constructor() {
    super();

    this.consumeContext(UMB_DOCUMENT_WORKSPACE_CONTEXT, (context) => {
      this.observe(
        context?.unique,
        (unique) => {
          this._parentId = unique ?? undefined;
        },
        '_kanbanWorkspaceUnique',
      );
    });

    this.consumeContext(UMB_VARIANT_CONTEXT, (context) => {
      this.observe(
        context?.displayCulture,
        (culture) => {
          // The variant context emits undefined synchronously on subscribe; only a truthy culture
          // is an answer — the same guard the collection host documents.
          if (!culture) return;

          this._culture = culture;
        },
        '_kanbanDisplayCulture',
      );
    });
  }

  get #configId(): string | undefined {
    return (this.manifest?.meta as { kanbanConfigId?: string } | undefined)?.kanbanConfigId;
  }

  override render() {
    // Held back until every input is real: rendering the standalone element earlier would load
    // the board invariant and then reload it when the culture arrives.
    if (!this._parentId || !this._culture) return html`<uui-loader></uui-loader>`;

    return html`
      <umb-community-kanban-standalone-board
        parent-id=${this._parentId}
        config-id=${this.#configId ?? ''}
        .culture=${this._culture}></umb-community-kanban-standalone-board>
    `;
  }
}

export { UmbCommunityKanbanWorkspaceViewBoardElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-workspace-view-board': UmbCommunityKanbanWorkspaceViewBoardElement;
  }
}
```

Note the wrapper deliberately has **no styles**: with no `:host { display: block }` it generates no box of its own, and the standalone element inside it provides the `display: block` the viewport measurement expects. (If the tab renders wrong in the hand-check, add `:host { display: contents }` — not `block` — so the wrapper can never become a measured ancestor.)

- [ ] **Step 2: Verify**

```bash
cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban/src/Umbraco.Community.Kanban/Client && npx tsc --noEmit && npx vitest run && npm run build
```

Expected: all pass. `workspace-view.model.test.ts` still passes untouched — the manifest contract did not change.

- [ ] **Step 3: Commit**

```bash
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban add src/Umbraco.Community.Kanban/Client/src/hosts/kanban-workspace-view-board.element.ts
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban commit -m "refactor: workspace-view host wraps the standalone board element"
```

---

### Task 3: Export the element from the importmap module + docs

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/bundle.manifests.ts`
- Modify: `docs/TODO.md` (milestone 5 injected-host line)

**Interfaces:**
- Produces: `import { UmbCommunityKanbanStandaloneBoardElement } from '@umbraco-community/kanban'` (and the side effect of defining the custom element) for any third-party consumer resolving through the importmap.

- [ ] **Step 1: Add the export**

Append to `bundle.manifests.ts` (after the existing `manifests` export):

```ts
// The importmap module doubles as the package's public API: importing it defines the standalone
// board element, and the class is re-exported for consumers that want the type.
export { UmbCommunityKanbanStandaloneBoardElement } from './hosts/kanban-standalone-board.element.js';
```

- [ ] **Step 2: Verify the built module actually exports it**

```bash
cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban/src/Umbraco.Community.Kanban/Client && npm run build && grep -o "UmbCommunityKanbanStandaloneBoardElement" ../wwwroot/App_Plugins/UmbracoCommunityKanban/umbraco-community-kanban.js | head -1
```

Expected: build succeeds and grep prints the class name (the export survived bundling; a missing match means vite tree-shook it — check the export syntax).

- [ ] **Step 3: Update docs/TODO.md**

Mark the milestone 5 injected-host line done, e.g. change its remaining "injected host" bullet to `[x] … — standalone board element exported from the importmap module (2026-07-31); first consumer: your-it-team-cloud Bookings Reservations workspace.` Adjust milestone 5's summary line to fully complete if this was its last item.

- [ ] **Step 4: Commit, merge to main**

```bash
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban add -A
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban commit -m "feat: export standalone board element from the importmap module"
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban checkout main
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban merge --no-ff tasks/standalone-board-host -m "Merge standalone board host (injected host, milestone 5 complete)"
git -C /Users/gandalf/Source/Repos/Umbraco.Community.Kanban branch -d tasks/standalone-board-host
```

---

### Task 4: Bookings server — ReservationsSettings (NO GIT in this repo)

**Files:**
- Modify: `/Users/gandalf/Source/Repos/your-it-team-cloud/src/Bookings/Constants/Configuration.cs`
- Create: `/Users/gandalf/Source/Repos/your-it-team-cloud/src/Bookings/Configuration/ReservationsSettings.cs`
- Modify: `/Users/gandalf/Source/Repos/your-it-team-cloud/src/Bookings/Extensions/AppExtensions.cs` (the `AddApplicationOptions` chain at ~line 83–85)

**Interfaces:**
- Produces: `IOptions<ReservationsSettings>` with `Guid? BookingsRootKey`, `Guid? KanbanConfigKey`, bound to `Bookings:Reservations`. Task 5 injects it.

- [ ] **Step 1: Add the configuration key constant**

In `Constants/Configuration.cs`, after `ConfigLocalisation`:

```csharp
    public const string ConfigReservations = $"{ConfigPrefix}Reservations";
```

- [ ] **Step 2: Create the settings class**

`src/Bookings/Configuration/ReservationsSettings.cs`:

```csharp
using Umbraco.Cms.Core.Configuration.Models;

namespace Bookings.Configuration;

/// <summary>
/// Points the backoffice Reservations workspace at its Kanban board. Both keys are environment
/// data — content GUIDs differ between environments and survive nothing — so they live in
/// appsettings rather than code or content.
/// </summary>
[UmbracoOptions(Constants.Configuration.ConfigReservations)]
public class ReservationsSettings
{
    /// <summary>The bookings root document whose children the board shows.</summary>
    public Guid? BookingsRootKey { get; set; }

    /// <summary>The Kanban board configuration (data-type configuration key) to render.</summary>
    public Guid? KanbanConfigKey { get; set; }
}
```

- [ ] **Step 3: Register it**

In `Extensions/AppExtensions.cs`, extend the existing chain (currently `AddApplicationOptions<MessagingSettings>().AddApplicationOptions<SchedulingSettings>().AddApplicationOptions<LocalisationSettings>();`) with:

```csharp
                .AddApplicationOptions<ReservationsSettings>()
```

(match the file's indentation; keep `LocalisationSettings` last with the semicolon or reorder — just ensure all four are registered).

- [ ] **Step 4: Verify**

```bash
cd /Users/gandalf/Source/Repos/your-it-team-cloud && dotnet build src/Bookings/Bookings.csproj
```

Expected: build succeeds. (If the csproj name differs, `ls src/Bookings/*.csproj` first and use what's there.)

**Do NOT commit — user commits this repo.**

---

### Task 5: Bookings server — ReservationsController

**Files:**
- Create: `/Users/gandalf/Source/Repos/your-it-team-cloud/src/Bookings/Controllers/Management/ReservationsController.cs`

**Interfaces:**
- Consumes: `IOptionsMonitor<ReservationsSettings>` from Task 4.
- Produces: `GET …/reservations/board` → `ReservationsBoardModel { Guid? ParentId, Guid? ConfigId }`, operation id `GetReservationsBoard`, OpenAPI tag `Reservations`. Task 6 regenerates the client from it; Task 7 calls it as `Reservations.getReservationsBoard()`.

- [ ] **Step 1: Write the controller**

Follows `BookingDashboardController` (same base class, versioned route attribute, role authorization). The response model lives in the same file — it exists only for this endpoint:

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Bookings.Configuration;
using Bookings.Infrastructure.Api;

namespace Bookings.Controllers.Management;

[VersionedBookingsManagementApiRouteAttribute("reservations")]
[ApiExplorerSettings(GroupName = "Reservations")]
public class ReservationsController(IOptionsMonitor<ReservationsSettings> settings) : BookingsManagementControllerBase
{
    /// <summary>
    /// The parent document and Kanban configuration the Reservations board renders, from
    /// appsettings. Nulls mean unconfigured — the client shows guidance instead of a board.
    /// </summary>
    [HttpGet("board", Name = nameof(GetReservationsBoard))]
    [Authorize(Roles = "admin,bookingAdmin")]
    public ReservationsBoardModel GetReservationsBoard()
    {
        var current = settings.CurrentValue;
        return new ReservationsBoardModel(current.BookingsRootKey, current.KanbanConfigKey);
    }
}

/// <summary>Where the Reservations Kanban board points: nulls when not configured.</summary>
public record ReservationsBoardModel(Guid? ParentId, Guid? ConfigId);
```

- [ ] **Step 2: Verify**

```bash
cd /Users/gandalf/Source/Repos/your-it-team-cloud && dotnet build src/Bookings/Bookings.csproj
```

Expected: build succeeds.

**Do NOT commit — user commits this repo.**

---

### Task 6: Regenerate the Bookings API client

The generator reads `https://localhost:44353/umbraco/openapi/bookings-management.json` from the **running dev server**, which only serves the new endpoint after a restart. **Never restart it yourself** — ask the user to restart, then poll.

- [ ] **Step 1: Ask the user to restart the dev server** (it must pick up Tasks 4–5).

- [ ] **Step 2: Poll until the endpoint is in the spec**

```bash
until curl -ks https://localhost:44353/umbraco/openapi/bookings-management.json | grep -q GetReservationsBoard; do sleep 5; done; echo ready
```

Expected: prints `ready` once the restarted server serves the new operation.

- [ ] **Step 3: Regenerate**

```bash
cd /Users/gandalf/Source/Repos/your-it-team-cloud/src/Bookings/Client && npm run generate-client
```

Expected: `src/generated` gains a `Reservations` SDK class (operations are grouped `byTags`) with `getReservationsBoard()` and a `ReservationsBoardModel` type.

- [ ] **Step 4: Verify the client still type-checks**

```bash
cd /Users/gandalf/Source/Repos/your-it-team-cloud/src/Bookings/Client && npm run build
```

Expected: build succeeds.

**Do NOT commit — user commits this repo.**

---

### Task 7: Bookings client — Reservations section group + workspace

**Files:**
- Create: `/Users/gandalf/Source/Repos/your-it-team-cloud/src/Bookings/Client/src/workspaces/reservations/constants.ts`
- Create: `/Users/gandalf/Source/Repos/your-it-team-cloud/src/Bookings/Client/src/workspaces/reservations/manifests.ts`
- Create: `/Users/gandalf/Source/Repos/your-it-team-cloud/src/Bookings/Client/src/workspaces/reservations/reservations-workspace.element.ts`
- Create: `/Users/gandalf/Source/Repos/your-it-team-cloud/src/Bookings/Client/src/types/umbraco-community-kanban.d.ts`
- Modify: `/Users/gandalf/Source/Repos/your-it-team-cloud/src/Bookings/Client/src/section/manifests.ts`
- Modify: `/Users/gandalf/Source/Repos/your-it-team-cloud/src/Bookings/Client/src/bundle.manifests.ts`

**Interfaces:**
- Consumes: `Reservations.getReservationsBoard()` + `ReservationsBoardModel` from Task 6's generated client; `<umb-community-kanban-standalone-board>` from Task 3.
- Produces: sidebar group "Reservations", menu item "Bookings Board" (entity type `reservations-board`), workspace `YourBookings.Workspace.Reservations`.

- [ ] **Step 1: constants.ts**

```ts
export const RESERVATIONS_BOARD_ENTITY_TYPE = "reservations-board";
export const RESERVATIONS_WORKSPACE_ALIAS = "YourBookings.Workspace.Reservations";
export const RESERVATIONS_MENU_ALIAS = "YourBookings.Menu.Reservations";
```

- [ ] **Step 2: Ambient types for the bare import**

`src/types/umbraco-community-kanban.d.ts` — the Kanban package is not an npm dependency; it resolves at runtime through the backoffice importmap, so TypeScript needs a module declaration:

```ts
/**
 * The Kanban package is served by Umbraco and resolved through the backoffice importmap
 * (`@umbraco-community/kanban` in its umbraco-package.json), not npm — so its types are declared
 * here. Keep in sync with the package's bundle exports.
 */
declare module "@umbraco-community/kanban" {
  export const manifests: Array<UmbExtensionManifest>;
  export class UmbCommunityKanbanStandaloneBoardElement extends HTMLElement {
    parentId?: string;
    configId?: string;
    culture?: string | null;
  }
}
```

(Confirm `tsconfig.json` includes `src` — it does by default; the `.d.ts` under `src/types` is picked up automatically.)

- [ ] **Step 3: The workspace element**

`src/workspaces/reservations/reservations-workspace.element.ts`:

```ts
import { css, customElement, html, state } from "@umbraco-cms/backoffice/external/lit";
import { UmbLitElement } from "@umbraco-cms/backoffice/lit-element";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
// Side-effect import: defines <umb-community-kanban-standalone-board>. Resolved at runtime via
// the backoffice importmap; vite leaves it external (config externalises /^@umbraco/).
import "@umbraco-community/kanban";
import { Reservations } from "../../generated";

/**
 * Hosts the Kanban board for bookings ("reservations"). Where the board points comes from the
 * server (appsettings via GET reservations/board) because content GUIDs are environment data.
 * Unconfigured or unreachable → guidance naming the appsettings keys, never a broken board.
 */
@customElement("your-bookings-reservations-workspace")
export class YourBookingsReservationsWorkspaceElement extends UmbLitElement {
  @state()
  private _loading = true;

  @state()
  private _parentId?: string;

  @state()
  private _configId?: string;

  override connectedCallback() {
    super.connectedCallback();
    void this.#load();
  }

  async #load() {
    try {
      const { data } = await Reservations.getReservationsBoard();
      this._parentId = data?.parentId ?? undefined;
      this._configId = data?.configId ?? undefined;
    } catch {
      // Same rendering as unconfigured: the guidance panel covers both.
      this._parentId = undefined;
      this._configId = undefined;
    } finally {
      this._loading = false;
    }
  }

  #renderGuidance() {
    return html`
      <uui-box headline="Reservations board is not configured">
        <p>
          Set both keys in <code>appsettings.json</code> and restart the site:
        </p>
        <ul>
          <li><code>Bookings:Reservations:BookingsRootKey</code> — the bookings root document key</li>
          <li><code>Bookings:Reservations:KanbanConfigKey</code> — the Kanban board configuration key</li>
        </ul>
      </uui-box>
    `;
  }

  override render() {
    return html`
      <umb-body-layout headline="Reservations" main-no-padding>
        ${this._loading
          ? html`<uui-loader></uui-loader>`
          : this._parentId && this._configId
            ? html`
                <umb-community-kanban-standalone-board
                  parent-id=${this._parentId}
                  config-id=${this._configId}></umb-community-kanban-standalone-board>
              `
            : this.#renderGuidance()}
      </umb-body-layout>
    `;
  }

  static override styles = [
    UmbTextStyles,
    css`
      :host {
        display: block;
        height: 100%;
      }

      uui-box {
        margin: var(--uui-size-layout-1);
      }

      umb-community-kanban-standalone-board {
        height: 100%;
      }
    `,
  ];
}

export { YourBookingsReservationsWorkspaceElement as element };

declare global {
  interface HTMLElementTagNameMap {
    "your-bookings-reservations-workspace": YourBookingsReservationsWorkspaceElement;
  }
}
```

Note: if the generated method or model property names differ (check `src/generated` after Task 6), use the generated names — the shape above assumes `Reservations.getReservationsBoard()` returning `{ data: { parentId, configId } }`.

- [ ] **Step 4: Workspace manifest**

`src/workspaces/reservations/manifests.ts`:

```ts
import { RESERVATIONS_BOARD_ENTITY_TYPE, RESERVATIONS_WORKSPACE_ALIAS } from "./constants.js";

export const manifests: Array<UmbExtensionManifest> = [
  {
    type: "workspace",
    alias: RESERVATIONS_WORKSPACE_ALIAS,
    name: "Reservations Workspace",
    element: () => import("./reservations-workspace.element.js"),
    meta: {
      entityType: RESERVATIONS_BOARD_ENTITY_TYPE,
    },
  },
];
```

- [ ] **Step 5: Sidebar group + menu item**

In `src/section/manifests.ts`, import the new constants and append three manifests (the Settings sidebar app's comment already anticipates headings above it — sidebar apps sort by descending weight, so 200 sits above Settings' 100):

```ts
import {
  RESERVATIONS_BOARD_ENTITY_TYPE,
  RESERVATIONS_MENU_ALIAS,
} from "../workspaces/reservations/constants.js";
```

```ts
  {
    type: "menu",
    alias: RESERVATIONS_MENU_ALIAS,
    name: "Bookings Reservations Menu",
  },
  {
    type: "sectionSidebarApp",
    kind: "menu",
    alias: "YourBookings.SectionSidebarMenu.Reservations",
    name: "Bookings Reservations Sidebar Menu",
    weight: 200,
    meta: {
      label: "Reservations",
      menu: RESERVATIONS_MENU_ALIAS,
    },
    conditions: [{ alias: UMB_SECTION_ALIAS_CONDITION_ALIAS, match: BOOKINGS_SECTION_ALIAS }],
  },
  {
    type: "menuItem",
    alias: "YourBookings.MenuItem.ReservationsBoard",
    name: "Reservations Board Menu Item",
    weight: 100,
    meta: {
      label: "Bookings Board",
      icon: "icon-columns",
      entityType: RESERVATIONS_BOARD_ENTITY_TYPE,
      menus: [RESERVATIONS_MENU_ALIAS],
    },
  },
```

- [ ] **Step 6: Collate in the bundle**

In `src/bundle.manifests.ts`:

```ts
import { manifests as reservationsManifests } from "./workspaces/reservations/manifests.js";
```

and add `...reservationsManifests,` to the exported array.

- [ ] **Step 7: Verify**

```bash
cd /Users/gandalf/Source/Repos/your-it-team-cloud/src/Bookings/Client && npm run build
```

Expected: tsc + vite succeed.

**Do NOT commit — user commits this repo.**

---

### Task 8: Configuration values, changelog, hand-check

**Files:**
- Modify: `/Users/gandalf/Source/Repos/your-it-team-cloud/src/YourITTeam/appsettings.Development.json`
- Modify: `/Users/gandalf/Source/Repos/your-it-team-cloud/src/Bookings/Client/package.json` (version 0.0.2 → 0.0.3)
- Modify: `/Users/gandalf/Source/Repos/your-it-team-cloud/src/Bookings/Client/Changelog.md`

- [ ] **Step 1: Get the two GUIDs from the user** — the bookings root document key and the Kanban board configuration key for the development environment. **This is a blocker: ask, don't guess.** Then add to `appsettings.Development.json` (merging with any existing `Bookings` section):

```json
"Bookings": {
  "Reservations": {
    "BookingsRootKey": "<user-supplied>",
    "KanbanConfigKey": "<user-supplied>"
  }
}
```

- [ ] **Step 2: Version + changelog** (per repo CLAUDE.md): bump the Bookings client `package.json` version to `0.0.3` and add a Keep-a-Changelog entry dated today:

```markdown
## [0.0.3] - 2026-07-31

### Added
- Reservations sidebar group with a Bookings Board workspace hosting the Umbraco.Community.Kanban standalone board, pointed at appsettings-configured parent/configuration keys via the new `reservations/board` management endpoint.
```

- [ ] **Step 3: Hand-check (user restarts server if needed):**
  - Bookings section shows a **Reservations** group above Settings with **Bookings Board**.
  - Opening it renders the Kanban board; cards drag; Publish/Undo bar appears with pending changes; opening a card works via the modal.
  - Temporarily blanking one appsettings key shows the guidance panel (then restore).
  - Existing Kanban workspace tabs on documents still work (wrapper refactor regression check).

**Do NOT commit — user commits this repo.**
