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
