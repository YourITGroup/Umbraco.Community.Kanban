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
