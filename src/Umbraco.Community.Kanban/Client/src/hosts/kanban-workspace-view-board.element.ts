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

  /**
   * The bar's measured height, handed to the board as its bottom inset so the viewport — and its
   * horizontal scrollbar — end above the bar rather than underneath it. Measured, not assumed: the
   * bar's height follows theme sizing variables.
   */
  @state()
  private _barInset = 0;

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
    // Idempotent and change-guarded, so the update it schedules settles in one pass.
    this.#measureBar();

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
    if (!this._parentId) return html`<uui-loader></uui-loader>`;

    // The bar sits in flow below the board rather than overlaying it: the board is told to end
    // `bottom-inset` pixels early, so the bar lands exactly in the freed strip and neither the
    // vertical scroll's end nor the horizontal scrollbar hides underneath it.
    return html`
      <umb-community-kanban-board
        parent-id=${this._parentId}
        config-id=${this.#configId ?? ''}
        bottom-inset=${this._barInset}
        .culture=${this._culture}
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

export { UmbCommunityKanbanWorkspaceViewBoardElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-workspace-view-board': UmbCommunityKanbanWorkspaceViewBoardElement;
  }
}
