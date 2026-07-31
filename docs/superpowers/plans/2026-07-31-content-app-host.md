# Content-App Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A document type carries one board tab per Kanban configuration that names it in `appliesTo` — registered dynamically at startup, with the same Publish/Undo bar the collection host has.

**Architecture:** The existing `backofficeEntryPoint` additionally fetches `GET /configurations` and registers one `workspaceView` manifest per board configuration (pure derivation, tested). A custom condition gates each tab on the open document's content-type key. One host element serves every configuration by reading the config key from its own `manifest.meta`. The action bar moves out of the collection element into a shared presentational element both hosts render.

**Tech Stack:** Lit 3 + TypeScript + Vite, Umbraco 18.x backoffice extension registry, Vitest in Node (no DOM). **No server changes** — `GET /configurations` and `GET /board?configId=` already exist.

**Spec:** `docs/superpowers/specs/2026-07-31-content-app-host-design.md`

## Global Constraints

- Client imports never reach into `@umbraco-cms/backoffice/dist-cms/...` — public export paths only. `UMB_DOCUMENT_WORKSPACE_CONTEXT` and `UMB_DOCUMENT_WORKSPACE_ALIAS` are public via `@umbraco-cms/backoffice/document`.
- Lit privates are `#name`; `@state()` fields are `_name`. No backticks inside `css` template comments.
- Elements/conditions/controllers are verified by `tsc --noEmit` + `npm run build`; only pure models get Vitest tests (Node, no DOM).
- Configurations of kind `Calendar` and configurations with empty `appliesTo` register **no** tab.
- `appliesTo` matches content-type keys **exactly** (case-insensitively) — no composition/inheritance matching.
- A `GET /configurations` failure at startup warns once and registers nothing; the backoffice must never be degraded by a Kanban endpoint being unavailable.
- All client commands run in `src/Umbraco.Community.Kanban/Client`; repo commands at the repo root.

## File Structure

```
src/Umbraco.Community.Kanban/Client/src/
├── constants.ts                                        MODIFY  two new aliases
├── core/kanban-action-bar.element.ts                   CREATE  shared Publish/Undo bar (presentational)
├── hosts/kanban-document-collection.element.ts         MODIFY  render the shared bar instead of inline markup
├── hosts/conditions/document-type-applies.condition.ts CREATE  key-match condition
├── hosts/workspace-view.model.ts                       CREATE  pure manifest derivation
├── hosts/workspace-view.model.test.ts                  CREATE  derivation tests
├── hosts/kanban-workspace-view-board.element.ts        CREATE  the workspace-view host adapter
├── hosts/manifests.ts                                  MODIFY  register the condition manifest
├── hosts/manifests.test.ts                             MODIFY  assert the condition manifest
└── hosts/entry-point.ts                                MODIFY  fetch configurations, register/unregister tabs
docs/TODO.md                                            MODIFY  record milestone 5b
```

---

### Task 1: Shared action bar element

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/core/kanban-action-bar.element.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/hosts/kanban-document-collection.element.ts`

**Interfaces:**
- Consumes: `KanbanBoardActionsState` from `core/board-actions.context.ts` (`{ pending: number; canUndo: boolean; busy: boolean }`).
- Produces (Task 3 relies on): `<umb-community-kanban-action-bar .barState=${state}>` dispatching bubbling composed `kanban-publish` and `kanban-undo` CustomEvents. The element renders `nothing` without a `barState`; **hosts own visibility** (they render the bar only when `pending > 0`).

- [ ] **Step 1: Create the bar element**

`src/Umbraco.Community.Kanban/Client/src/core/kanban-action-bar.element.ts`:

```ts
import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { KanbanBoardActionsState } from './board-actions.context.js';

/**
 * The board's Publish/Undo bar, shared by every host so the two placements cannot drift: the
 * collection layout slots it into the umb-body-layout footer, the workspace view overlays it at the
 * foot of its tab. Purely presentational — it renders a state and dispatches intents; which context
 * or handler answers them is the host's business.
 */
@customElement('umb-community-kanban-action-bar')
export class UmbCommunityKanbanActionBarElement extends UmbLitElement {
  @property({ attribute: false })
  barState?: KanbanBoardActionsState;

  #onUndo() {
    this.dispatchEvent(new CustomEvent('kanban-undo', { bubbles: true, composed: true }));
  }

  #onPublish() {
    this.dispatchEvent(new CustomEvent('kanban-publish', { bubbles: true, composed: true }));
  }

  override render() {
    const state = this.barState;

    if (!state) return nothing;

    return html`
      <div class="summary">
        ${state.pending} ${state.pending === 1 ? 'card has' : 'cards have'} pending changes
      </div>
      <div class="buttons">
        <uui-button
          look="secondary"
          icon="icon-undo"
          label="Undo the last move"
          title="Undo the last move made on this board"
          ?disabled=${!state.canUndo || state.busy}
          @click=${this.#onUndo}>
          Undo
        </uui-button>
        <uui-button
          look="primary"
          color="positive"
          icon="icon-globe"
          label="Publish pending changes"
          ?disabled=${state.busy}
          @click=${this.#onPublish}>
          Publish pending changes
        </uui-button>
      </div>
    `;
  }

  static override styles = [
    css`
      /* Mirrors core's own selection-action bar: same surface, contrast colour, padding and
         space-between layout. The host decides where the bar sits; the bar decides how it reads. */
      :host {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--uui-size-3);
        box-sizing: border-box;
        width: 100%;
        padding: var(--uui-size-space-4) var(--uui-size-space-6);
        background-color: var(--uui-color-selected);
        color: var(--uui-color-selected-contrast);
      }

      .summary,
      .buttons {
        display: flex;
        align-items: center;
        gap: var(--uui-size-3);
      }
    `,
  ];
}

export { UmbCommunityKanbanActionBarElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-action-bar': UmbCommunityKanbanActionBarElement;
  }
}
```

- [ ] **Step 2: Use it from the collection element**

In `src/Umbraco.Community.Kanban/Client/src/hosts/kanban-document-collection.element.ts`:

Add the import (side-effect import registers the custom element):

```ts
import '@/core/kanban-action-bar.element.js';
```

Replace the whole `renderSelectionActions()` body from `const actions = this._actions;` down to the closing backtick of its returned template with:

```ts
    const actions = this._actions;

    if (!actions || actions.pending === 0) return html``;

    return html`
      <umb-community-kanban-action-bar
        slot="footer"
        .barState=${actions}
        @kanban-undo=${this.#onUndo}
        @kanban-publish=${this.#onPublish}></umb-community-kanban-action-bar>
    `;
```

(`#onUndo`/`#onPublish` already exist and stay — they call the context; they now fire from the bar's events instead of direct button clicks.)

Then delete the now-dead pieces: the `#board-actions` and `.summary, .buttons` CSS rules from this element's `styles` (the bar owns them), and the `id="board-actions"` markup that was replaced. The `updated()` override, `_chromeless`, `_actions`, `#boardActions` context and `renderToolbar`/`renderPagination` all stay untouched.

- [ ] **Step 3: Build and run the full client suite**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build 2>&1 | tail -3 && npm run test 2>&1 | tail -3`
Expected: build clean, all tests pass (nothing tested renders this element, but the type-check covers both files).

- [ ] **Step 4: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core/kanban-action-bar.element.ts src/Umbraco.Community.Kanban/Client/src/hosts/kanban-document-collection.element.ts
git commit -m "refactor: extract the Publish/Undo bar into a shared element"
```

---

### Task 2: Constants and the document-type-applies condition

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/constants.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/hosts/conditions/document-type-applies.condition.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/hosts/manifests.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/hosts/manifests.test.ts`

**Interfaces:**
- Produces (Tasks 3 and 5 rely on):
  - `KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS = 'Umb.Community.Kanban.Condition.DocumentTypeApplies'`
  - `KANBAN_WORKSPACE_VIEW_BOARD_ALIAS_PREFIX = 'Umb.Community.Kanban.WorkspaceView.Board.'`
  - Condition config type `KanbanDocumentTypeAppliesConditionConfig` with `oneOf: string[]` (content-type keys), declared into the global `UmbExtensionConditionConfigMap` so manifest literals may carry `oneOf` without casts.

- [ ] **Step 1: Add the constants**

In `src/Umbraco.Community.Kanban/Client/src/constants.ts`, next to `KANBAN_DATA_TYPE_WORKSPACE_VIEW_ALIAS`:

```ts
/** Per-configuration workspace views append the configuration key to this. */
export const KANBAN_WORKSPACE_VIEW_BOARD_ALIAS_PREFIX = 'Umb.Community.Kanban.WorkspaceView.Board.';

export const KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS =
  'Umb.Community.Kanban.Condition.DocumentTypeApplies';
```

- [ ] **Step 2: Write the failing manifest test**

Append to `src/Umbraco.Community.Kanban/Client/src/hosts/manifests.test.ts` (extend the constants import with `KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS`):

```ts
describe('document type applies condition manifest', () => {
  const condition = manifests.find(
    (manifest) => manifest.alias === KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS,
  );

  it('registers the condition', () => {
    expect(condition).toBeDefined();
    expect(condition?.type).toBe('condition');
  });

  it('loads its api lazily', () => {
    expect(typeof (condition as { api?: unknown }).api).toBe('function');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/hosts/manifests.test.ts 2>&1 | tail -4`
Expected: FAIL — no manifest with that alias.

- [ ] **Step 4: Create the condition**

`src/Umbraco.Community.Kanban/Client/src/hosts/conditions/document-type-applies.condition.ts` (mirrors the repo's `data-type-is-collection.condition.ts` shape):

```ts
import { UmbConditionBase } from '@umbraco-cms/backoffice/extension-registry';
import { UMB_DOCUMENT_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/document';
import type {
  UmbConditionConfigBase,
  UmbConditionControllerArguments,
  UmbExtensionCondition,
} from '@umbraco-cms/backoffice/extension-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS } from '@/constants.js';

export type KanbanDocumentTypeAppliesConditionConfig = UmbConditionConfigBase<
  typeof KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS
> & {
  /** Content type KEYS (GUIDs) the extension applies to. Exact match — appliesTo names types, not families. */
  oneOf: string[];
};

const ObserveSymbol = Symbol();

/**
 * Permits an extension only while the open document workspace edits a document whose content type
 * key is in the configured list. Core's own Umb.Condition.WorkspaceContentTypeAlias matches
 * aliases; a Kanban configuration's appliesTo stores keys, so this condition exists to compare
 * like with like. Keys compare case-insensitively — GUID casing is not guaranteed to agree between
 * the server's serialisation and the client's.
 */
export class KanbanDocumentTypeAppliesCondition
  extends UmbConditionBase<KanbanDocumentTypeAppliesConditionConfig>
  implements UmbExtensionCondition
{
  constructor(
    host: UmbControllerHost,
    args: UmbConditionControllerArguments<KanbanDocumentTypeAppliesConditionConfig>,
  ) {
    super(host, args);

    const keys = (this.config.oneOf ?? []).map((key) => key.toLowerCase());

    this.consumeContext(UMB_DOCUMENT_WORKSPACE_CONTEXT, (context) => {
      this.observe(
        context?.contentTypeUnique,
        (unique) => {
          this.permitted = unique !== undefined && keys.includes(unique.toLowerCase());
        },
        ObserveSymbol,
      );
    });
  }
}

export { KanbanDocumentTypeAppliesCondition as api };

declare global {
  interface UmbExtensionConditionConfigMap {
    kanbanDocumentTypeApplies: KanbanDocumentTypeAppliesConditionConfig;
  }
}
```

- [ ] **Step 5: Register it in the hosts manifests**

In `src/Umbraco.Community.Kanban/Client/src/hosts/manifests.ts`, extend the constants import with `KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS` and append to the array:

```ts
  {
    type: 'condition',
    alias: KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS,
    name: 'Kanban Document Type Applies Condition',
    api: () => import('./conditions/document-type-applies.condition.js'),
  },
```

- [ ] **Step 6: Run tests and type-check**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/hosts/manifests.test.ts 2>&1 | tail -3 && npx tsc --noEmit && echo TSC-CLEAN`
Expected: tests PASS, `TSC-CLEAN`.

- [ ] **Step 7: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/constants.ts src/Umbraco.Community.Kanban/Client/src/hosts/conditions/document-type-applies.condition.ts src/Umbraco.Community.Kanban/Client/src/hosts/manifests.ts src/Umbraco.Community.Kanban/Client/src/hosts/manifests.test.ts
git commit -m "feat: condition gating extensions on the document's content type key"
```

---

### Task 3: Workspace-view host element

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/hosts/kanban-workspace-view-board.element.ts`

**Interfaces:**
- Consumes: `UMB_DOCUMENT_WORKSPACE_CONTEXT` (`unique` observable — the open document), `UMB_VARIANT_CONTEXT` (`displayCulture`), `meta.kanbanConfigId` from its own `manifest`, `UmbKanbanBoardActionsContext` (Task 1's bar), the board element and `KanbanServerDataSource`.
- Produces: the element Task 4's `boardWorkspaceViewManifests` lazily imports. Nothing else consumes it.

- [ ] **Step 1: Create the element**

`src/Umbraco.Community.Kanban/Client/src/hosts/kanban-workspace-view-board.element.ts`:

```ts
import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_VARIANT_CONTEXT } from '@umbraco-cms/backoffice/variant';
import { UmbModalRouteRegistrationController } from '@umbraco-cms/backoffice/router';
import { UMB_WORKSPACE_MODAL, type ManifestWorkspaceView } from '@umbraco-cms/backoffice/workspace';
import {
  UMB_CREATE_DOCUMENT_WORKSPACE_PATH_PATTERN,
  UMB_CREATE_FROM_BLUEPRINT_DOCUMENT_WORKSPACE_PATH_PATTERN,
  UMB_DOCUMENT_ENTITY_TYPE,
  UMB_DOCUMENT_WORKSPACE_CONTEXT,
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
 * Adapts the board to a document workspace tab — the content-app host. The open document is the
 * board's parent; which configuration to use rides in this view's own manifest meta, because this
 * host has no Collection data type for the server to resolve one from.
 *
 * The action bar has no footer slot here (that is umb-body-layout furniture the collection host
 * borrows), so this element provides the actions context itself — it is an ancestor of the board it
 * renders — and overlays the shared bar at the foot of the tab, the same place the native bulk bar
 * sits over a collection.
 */
@customElement('umb-community-kanban-workspace-view-board')
export class UmbCommunityKanbanWorkspaceViewBoardElement extends UmbLitElement {
  /** Set by the extension slot. meta.kanbanConfigId names the configuration this tab serves. */
  @property({ attribute: false })
  manifest?: ManifestWorkspaceView;

  #datasource: KanbanDataSource = new KanbanServerDataSource(this);

  /** Bridges the board's pending/undo state to the bar this element renders. */
  #boardActions = new UmbKanbanBoardActionsContext(this);

  @state()
  private _parentId?: string;

  @state()
  private _culture?: string | null;

  @state()
  private _actions?: KanbanBoardActionsState;

  /** The parent/culture pair the board was last loaded for, so a re-render is not a re-fetch. */
  #loadedFor?: string;

  /**
   * Whether a real culture has arrived. The variant context emits undefined synchronously on
   * subscribe; only a truthy culture is an answer — the same guard the collection host documents.
   */
  #cultureResolved = false;

  /** See the collection host: open() silently no-ops until the router hands over a builder. */
  #modalReady = false;

  #documentModal: UmbModalRouteRegistrationController<
    typeof UMB_WORKSPACE_MODAL.DATA,
    typeof UMB_WORKSPACE_MODAL.VALUE
  >;

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
          if (!culture) return;

          this._culture = culture;
          this.#cultureResolved = true;
        },
        '_kanbanDisplayCulture',
      );
    });

    this.observe(
      this.#boardActions.state,
      (actionsState) => {
        this._actions = actionsState;
      },
      '_kanbanBoardActions',
    );

    // The same registration the collection host uses, under its own path segment so the two hosts'
    // modal routes never collide in a shared routing scope.
    this.#documentModal = new UmbModalRouteRegistrationController(this, UMB_WORKSPACE_MODAL)
      .addAdditionalPath('kanban-workspace-document')
      .onSetup(() => ({ data: { entityType: UMB_DOCUMENT_ENTITY_TYPE, preset: {} } }))
      .onSubmit(() => {
        // Nothing tells the board a document was saved in our modal; realtime sync covers other
        // editors, not this same-session modal, so reload explicitly — same reasoning as the
        // collection host.
        this.#board?.load();
      })
      .observeRouteBuilder(() => {
        this.#modalReady = true;
      });
  }

  get #board() {
    return this.shadowRoot?.querySelector('umb-community-kanban-board') ?? undefined;
  }

  get #configId(): string | undefined {
    return (this.manifest?.meta as { kanbanConfigId?: string } | undefined)?.kanbanConfigId;
  }

  override updated() {
    // The parent and culture arrive asynchronously and independently; load once both are real, and
    // again only when either actually changes.
    if (!this._parentId) {
      this.#loadedFor = undefined;
      return;
    }

    if (!this.#cultureResolved) return;

    const key = `${this._parentId}|${this._culture ?? ''}`;

    if (key === this.#loadedFor) return;

    this.#loadedFor = key;
    this.#board?.load();
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
        class="bar"
        .barState=${this._actions}
        @kanban-undo=${this.#onUndo}
        @kanban-publish=${this.#onPublish}></umb-community-kanban-action-bar>
    `;
  }

  override render() {
    if (!this._parentId) return html`<uui-loader></uui-loader>`;

    return html`
      <umb-community-kanban-board
        parent-id=${this._parentId}
        config-id=${this.#configId ?? ''}
        .culture=${this._culture}
        .datasource=${this.#datasource}
        @kanban-open-document=${this.#onOpenDocument}
        @kanban-create-child=${this.#onCreateChild}></umb-community-kanban-board>
      ${this.#renderBar()}
    `;
  }

  static override styles = [
    css`
      /* The bar overlays the foot of the tab rather than sitting below the board, because the board
         sizes its viewport to the container bottom — a sibling below it would land past the fold and
         grow a second scrollbar. Overlaying is also what the native bulk bar does over a collection. */
      :host {
        display: block;
        position: relative;
      }

      .bar {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
      }
    `,
  ];
}

export { UmbCommunityKanbanWorkspaceViewBoardElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-workspace-view-board': UmbCommunityKanbanWorkspaceViewBoardElement;
  }
}
```

Two watch-points, with fallbacks:
- If `ManifestWorkspaceView` is not exported from `@umbraco-cms/backoffice/workspace`, import it from `@umbraco-cms/backoffice/extension-registry` instead — never from a `dist-cms` path.
- `config-id=${this.#configId ?? ''}` — the board treats an empty `configId` attribute as absent only if it is not sent; if `''` reaches `buildBoardQuery` it is falsy and omitted, so this is safe as written (`buildBoardQuery` guards with `if (query.configId)`).

- [ ] **Step 2: Type-check and build**

Run: `cd src/Umbraco.Community.Kanban/Client && npx tsc --noEmit && npm run build 2>&1 | tail -3`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/hosts/kanban-workspace-view-board.element.ts
git commit -m "feat: workspace-view host renders a board tab for the open document"
```

---

### Task 4: Manifest derivation model

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/hosts/workspace-view.model.ts`
- Test: `src/Umbraco.Community.Kanban/Client/src/hosts/workspace-view.model.test.ts`

**Interfaces:**
- Consumes: `KanbanConfigurationModel` from `data/kanban-configuration-data-source.ts` (`{ key, name, kind: 'Board' | 'Calendar', appliesTo: string[], tabName?, tabIcon? }`); Task 2's constants and condition config type; `UMB_DOCUMENT_WORKSPACE_ALIAS` from `@umbraco-cms/backoffice/document`.
- Produces (Task 5 relies on): `boardWorkspaceViewManifests(configurations: KanbanConfigurationModel[]): Array<UmbExtensionManifest>`. Task 4 relies on `meta.kanbanConfigId` being present on each produced manifest.

- [ ] **Step 1: Write the failing tests**

`src/Umbraco.Community.Kanban/Client/src/hosts/workspace-view.model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { boardWorkspaceViewManifests } from './workspace-view.model.js';
import type { KanbanConfigurationModel } from '../data/kanban-configuration-data-source.js';
import {
  KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS,
  KANBAN_WORKSPACE_VIEW_BOARD_ALIAS_PREFIX,
} from '@/constants.js';

function configuration(overrides: Partial<KanbanConfigurationModel> = {}): KanbanConfigurationModel {
  return {
    key: 'cfg-1',
    name: 'By status',
    kind: 'Board',
    appliesTo: ['ct-a'],
    ...overrides,
  };
}

describe('boardWorkspaceViewManifests', () => {
  it('derives one workspaceView per applicable configuration, in input order', () => {
    const manifests = boardWorkspaceViewManifests([
      configuration({ key: 'cfg-1' }),
      configuration({ key: 'cfg-2', name: 'By priority' }),
    ]);

    expect(manifests.map((m) => m.alias)).toEqual([
      `${KANBAN_WORKSPACE_VIEW_BOARD_ALIAS_PREFIX}cfg-1`,
      `${KANBAN_WORKSPACE_VIEW_BOARD_ALIAS_PREFIX}cfg-2`,
    ]);
    expect(manifests.every((m) => m.type === 'workspaceView')).toBe(true);
  });

  it('skips calendar configurations — that host does not exist yet', () => {
    expect(boardWorkspaceViewManifests([configuration({ kind: 'Calendar' })])).toEqual([]);
  });

  it('skips a configuration that names no content types', () => {
    expect(boardWorkspaceViewManifests([configuration({ appliesTo: [] })])).toEqual([]);
  });

  it('labels the tab from tabName, falling back to the configuration name', () => {
    const [named, fallback] = boardWorkspaceViewManifests([
      configuration({ key: 'a', tabName: 'Pipeline' }),
      configuration({ key: 'b', tabName: null }),
    ]);

    expect((named.meta as { label?: string }).label).toBe('Pipeline');
    expect((fallback.meta as { label?: string }).label).toBe('By status');
  });

  it('icons the tab from tabIcon, falling back to the package icon', () => {
    const [custom, fallback] = boardWorkspaceViewManifests([
      configuration({ key: 'a', tabIcon: 'icon-calendar' }),
      configuration({ key: 'b' }),
    ]);

    expect((custom.meta as { icon?: string }).icon).toBe('icon-calendar');
    expect((fallback.meta as { icon?: string }).icon).toBe('icon-columns');
  });

  it('routes each tab by its configuration key and carries the key for the element', () => {
    const [manifest] = boardWorkspaceViewManifests([configuration({ key: 'cfg-9' })]);
    const meta = manifest.meta as { pathname?: string; kanbanConfigId?: string };

    expect(meta.pathname).toBe('kanban-cfg-9');
    expect(meta.kanbanConfigId).toBe('cfg-9');
  });

  it('conditions each tab on the document workspace, a saved document, and the appliesTo keys', () => {
    const [manifest] = boardWorkspaceViewManifests([
      configuration({ appliesTo: ['ct-a', 'ct-b'] }),
    ]);

    expect((manifest as { conditions?: unknown }).conditions).toEqual([
      { alias: 'Umb.Condition.WorkspaceAlias', match: 'Umb.Workspace.Document' },
      { alias: 'Umb.Condition.WorkspaceEntityIsNew', match: false },
      { alias: KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS, oneOf: ['ct-a', 'ct-b'] },
    ]);
  });

  it('loads the element lazily', () => {
    const [manifest] = boardWorkspaceViewManifests([configuration()]);

    expect(typeof (manifest as { element?: unknown }).element).toBe('function');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/hosts/workspace-view.model.test.ts 2>&1 | tail -3`
Expected: FAIL — cannot resolve `./workspace-view.model.js`.

- [ ] **Step 3: Implement the derivation**

`src/Umbraco.Community.Kanban/Client/src/hosts/workspace-view.model.ts`:

```ts
import { UMB_DOCUMENT_WORKSPACE_ALIAS } from '@umbraco-cms/backoffice/document';
import type { KanbanConfigurationModel } from '../data/kanban-configuration-data-source.js';
import {
  KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS,
  KANBAN_WORKSPACE_VIEW_BOARD_ALIAS_PREFIX,
} from '@/constants.js';

/**
 * One workspaceView per board configuration that names at least one content type, in configuration
 * order. Pure, so the skip rules and fallbacks are tested directly:
 *
 * - Calendar configurations are skipped — that host does not exist yet (design milestone 4).
 * - An empty appliesTo provides no tab anywhere: it names the types it applies to, and it named none.
 * - The configuration key rides in three places, deliberately: the alias (so unregistering finds it),
 *   the pathname (so two boards on one document type route distinctly), and meta.kanbanConfigId (so
 *   the one shared element knows which configuration it serves — this host has no Collection data
 *   type to resolve one from).
 *
 * Weight 90 sits after core's Content and Info tabs, identically for every board tab; ties keep
 * configuration order because the registry preserves registration order within a weight.
 */
export function boardWorkspaceViewManifests(
  configurations: KanbanConfigurationModel[],
): Array<UmbExtensionManifest> {
  return configurations
    .filter((configuration) => configuration.kind === 'Board' && configuration.appliesTo.length > 0)
    .map((configuration) => ({
      type: 'workspaceView',
      alias: `${KANBAN_WORKSPACE_VIEW_BOARD_ALIAS_PREFIX}${configuration.key}`,
      name: `Kanban Board Workspace View (${configuration.name})`,
      element: () => import('./kanban-workspace-view-board.element.js'),
      weight: 90,
      meta: {
        label: configuration.tabName || configuration.name,
        pathname: `kanban-${configuration.key}`,
        icon: configuration.tabIcon || 'icon-columns',
        kanbanConfigId: configuration.key,
      },
      conditions: [
        { alias: 'Umb.Condition.WorkspaceAlias', match: UMB_DOCUMENT_WORKSPACE_ALIAS },
        { alias: 'Umb.Condition.WorkspaceEntityIsNew', match: false },
        { alias: KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS, oneOf: [...configuration.appliesTo] },
      ],
    }));
}
```

If `tsc` rejects the literal against `UmbExtensionManifest` (excess-property checks on fresh literals — the milestone-4 lesson), assign each manifest to a typed `const manifest: UmbExtensionManifest = { ... }` inside the `.map` callback and return it; do not cast with `as`.

Note: the lazily imported `./kanban-workspace-view-board.element.js` is Task 3's file, which exists by this point — tasks run in order.

- [ ] **Step 4: Run to verify pass**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/hosts/workspace-view.model.test.ts 2>&1 | tail -3`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/hosts/workspace-view.model.ts src/Umbraco.Community.Kanban/Client/src/hosts/workspace-view.model.test.ts
git commit -m "feat: derive one workspaceView manifest per applicable board configuration"
```

---

### Task 5: Entry-point registration

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/hosts/entry-point.ts`

**Interfaces:**
- Consumes: `getBoardConfigurations(host)` (`data/kanban-configuration-data-source.ts`), `boardWorkspaceViewManifests` (Task 3).
- Produces: board tabs registered at backoffice startup; unregistered on package unload.

- [ ] **Step 1: Extend the entry point**

In `src/Umbraco.Community.Kanban/Client/src/hosts/entry-point.ts`:

Add imports:

```ts
import { getBoardConfigurations } from '@/data/kanban-configuration-data-source.js';
import { boardWorkspaceViewManifests } from './workspace-view.model.js';
```

Add beside the existing `replaced` module state:

```ts
/** The per-configuration board tabs this entry point registered, kept so onUnload can remove them. */
let registeredWorkspaceViews: Array<UmbExtensionManifest> = [];
```

In `onInit`, after the existing collection-manifest swap (leave all of it untouched), add:

```ts
  // Board tabs are derived from server-side configurations, so registration is asynchronous. onInit
  // itself must not await it: a slow or failing Kanban endpoint must never hold up or degrade the
  // backoffice.
  void registerBoardWorkspaceViews(_host, extensionRegistry);
```

Rename the ignored `_host` parameter to `host` (it is used now) and adjust the call accordingly. Add at module scope:

```ts
async function registerBoardWorkspaceViews(
  host: Parameters<UmbEntryPointOnInit>[0],
  extensionRegistry: Parameters<UmbEntryPointOnInit>[1],
): Promise<void> {
  // getBoardConfigurations returns [] on any request failure, so this cannot throw for the common
  // failure; the try/catch covers the uncommon ones for the same reason — no Kanban problem may
  // degrade the backoffice.
  try {
    const configurations = await getBoardConfigurations(host);

    registeredWorkspaceViews = boardWorkspaceViewManifests(configurations);

    if (registeredWorkspaceViews.length > 0) {
      extensionRegistry.registerMany(registeredWorkspaceViews);
    }
  } catch (error) {
    console.warn('[Kanban] Could not register board tabs from configurations.', error);
    registeredWorkspaceViews = [];
  }
}
```

In `onUnload`, before the existing swap-restore (which early-returns when nothing was replaced — the new code must run regardless, so place it first):

```ts
  for (const manifest of registeredWorkspaceViews) {
    extensionRegistry.unregister(manifest.alias);
  }
  registeredWorkspaceViews = [];
```

(The existing `if (!replaced) return;` then follows, unchanged.)

- [ ] **Step 2: Type-check, build, full suites**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build 2>&1 | tail -3 && npm run test 2>&1 | tail -3`
Expected: build clean, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/hosts/entry-point.ts
git commit -m "feat: register one board tab per configuration at backoffice startup"
```

---

### Task 6: Docs and final verification

**Files:**
- Modify: `docs/TODO.md`

- [ ] **Step 1: Record milestone 5b in `docs/TODO.md`**

Retitle the milestone-5 heading to
`## Milestone 5 — Content app host and real-time sync ✅ Done (5a real-time 2026-07-31, 5b content app 2026-07-31)`
and replace the `**Content-app host (5b) — awaiting its own spec.**` bullet with:

```markdown
- [x] **Content-app host (5b).** Built 2026-07-31 from
  [its design](superpowers/specs/2026-07-31-content-app-host-design.md). The entry point fetches
  `GET /configurations` at startup and registers one `workspaceView` per board configuration
  (`boardWorkspaceViewManifests`, pure and tested), gated on `Umb.Workspace.Document`, a saved
  document, and a new `DocumentTypeApplies` condition matching the document's content-type **key**
  against `appliesTo`. One shared element serves every tab via `meta.kanbanConfigId`; the
  Publish/Undo bar was extracted to `core/kanban-action-bar.element.ts` and overlays the tab's foot.
  Calendar-kind and empty-`appliesTo` configurations register nothing. Needs hand-verification:
  tab appears/labels/routes per configuration, two configurations on one type give two tabs, no tab
  on unlisted types or unsaved documents, publish/undo from the tab, collection view bar unchanged.
```

- [ ] **Step 2: Full verification — both stacks and the bundle**

Run: `dotnet test 2>&1 | tail -3 && cd src/Umbraco.Community.Kanban/Client && npm run build 2>&1 | tail -3 && npm run test 2>&1 | tail -3 && grep -l "kanbanConfigId" ../wwwroot/App_Plugins/UmbracoCommunityKanban/*.js | head -2`
Expected: all green; at least one bundle file contains `kanbanConfigId` (the stale-bundle check).

- [ ] **Step 3: Commit**

```bash
git add docs/TODO.md
git commit -m "docs: record the content-app host (milestone 5b) in the TODO"
```

---

## Hand-verification (after implementation, needs the running site)

1. Add a document type's key to a board configuration's `appliesTo`; reload the backoffice; open a
   document of that type → a board tab with the configuration's label and icon; children render as
   cards; drag works; the bar appears with pending changes; Publish and Undo work from the tab.
2. A second configuration naming the same type → a second tab, distinct label, distinct route
   (`kanban-<key>` in the URL).
3. A document of an unlisted type → no Kanban tab. A brand-new unsaved document → no tab.
4. The collection view still shows its footer bar and behaves exactly as before the bar extraction.
5. Realtime: a colleague's change pulses on the tab's board too (5a came along for free).
