import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_COLLECTION_CONTEXT } from '@umbraco-cms/backoffice/collection';
import { UMB_ENTITY_CONTEXT } from '@umbraco-cms/backoffice/entity';
import { UMB_VARIANT_CONTEXT } from '@umbraco-cms/backoffice/variant';
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
import '@/core/kanban-board.element.js';

/**
 * Adapts the board to the document Collection layout picker.
 *
 * It supplies three things and nothing else: the parent document, the display culture, and
 * a data source. It deliberately does not resolve which board configuration to use — the
 * server does that from the parent, because a collection view cannot be handed custom
 * configuration (UmbCollectionConfiguration forwards only a fixed set of aliases).
 */
@customElement('umb-community-kanban-collection-view-board')
export class UmbCommunityKanbanCollectionViewBoardElement extends UmbLitElement {
  #datasource: KanbanDataSource = new KanbanServerDataSource(this);

  @state()
  private _parentId?: string;

  @state()
  private _culture?: string | null;

  /**
   * Opens a card's document in Umbraco's own document workspace as a sidebar modal, so editing a card
   * never means leaving the board.
   *
   * A modal *route* registration rather than `UMB_MODAL_MANAGER_CONTEXT.open()` because the document
   * workspace is route-driven: edit, create and create-from-blueprint are three routes into it, and
   * opening the modal directly would render a workspace with no route to resolve. One registration
   * serves all three — the path passed to `open()` decides which. This is the same pattern, and the
   * same reasoning, as the data type workspace view's.
   */
  #documentModal: UmbModalRouteRegistrationController<
    typeof UMB_WORKSPACE_MODAL.DATA,
    typeof UMB_WORKSPACE_MODAL.VALUE
  >;

  /**
   * Whether the router has handed over a route builder yet. `open()` silently does nothing until it
   * has, so an event arriving first is dropped rather than looking like a broken button. Kept here
   * rather than gating the controls: the registration completes long before the board's first response
   * renders a card, so threading a flag down to every card would buy nothing.
   */
  #modalReady = false;

  constructor() {
    super();

    // The parent GUID comes from the entity context, not the collection context — the
    // collection context has no parent member and resolves its own parent the same way.
    this.consumeContext(UMB_ENTITY_CONTEXT, (context) => {
      this.observe(context?.unique, (unique) => {
        this._parentId = unique ?? undefined;
      }, '_kanbanParentUnique');
    });

    this.consumeContext(UMB_VARIANT_CONTEXT, (context) => {
      this.observe(context?.displayCulture, (culture) => {
        // displayCulture emits undefined synchronously on subscribe and only becomes real once
        // UmbAppLanguageContext has fetched the languages, so a falsy value is "not yet known",
        // never an answer. Umbraco's own UmbDocumentCollectionContext guards this identically
        // (`if (!displayCulture) return;`). Loading on the falsy emission would fetch the board
        // for the invariant culture and then fetch it again for the real one.
        if (!culture) return;

        this._culture = culture;
        this.#cultureResolved = true;
      }, '_kanbanDisplayCulture');
    });

    // items emits on every collection load, which is the reload signal for this milestone.
    this.consumeContext(UMB_COLLECTION_CONTEXT, (context) => {
      this.observe(context?.items, () => {
        // Before the first load, updated() owns fetching: an emission here is the collection's
        // initial state and would either fetch with no parent or race the initial fetch.
        if (!this.#loadedFor) return;

        // The collection finishing its own load emits items once right after we start the
        // initial fetch for a key; the board is already loading that same data. Worst case
        // this swallows one genuine emission (if the collection settled first), which costs a
        // read-only board one refresh — cheaper than a duplicate request per navigation.
        if (this.#awaitingCollectionSettle) {
          this.#awaitingCollectionSettle = false;
          return;
        }

        this.#board?.load();
      }, '_kanbanCollectionItems');
    });

    this.#documentModal = new UmbModalRouteRegistrationController(this, UMB_WORKSPACE_MODAL)
      // The token's alias is the generic `Umb.Modal.Workspace`, so a distinct segment is what keeps
      // our route unambiguous among any other workspace modal in the same routing scope.
      .addAdditionalPath('kanban-document')
      .onSetup(() => ({ data: { entityType: UMB_DOCUMENT_ENTITY_TYPE, preset: {} } }))
      .onSubmit(() => {
        // The collection context has no idea a document was saved inside our modal, so its `items`
        // observable will not fire; the board has to reload itself. The board's own load token makes a
        // redundant load harmless if that ever changes.
        this.#board?.load();
      })
      .observeRouteBuilder(() => {
        this.#modalReady = true;
      });
  }

  /** The parent/culture pair the board was last loaded for, so a re-render is not a re-fetch. */
  #loadedFor?: string;

  /**
   * Whether the variant context's observe callback has fired at least once. Entity and variant
   * contexts resolve independently and asynchronously; without this, a load can fire on the
   * entity context alone and then fire again moments later once culture arrives — two requests
   * for one navigation. Only a truthy culture counts as resolved: the variant context emits
   * undefined synchronously on subscribe, long before the app language request lands. Every
   * Umbraco install has a default language, so a real culture always arrives — even for
   * documents that do not vary, where the server ignores it for invariant properties.
   */
  #cultureResolved = false;

  /** Set while the collection's own load is expected to emit items for a fetch already in flight. */
  #awaitingCollectionSettle = false;

  get #board() {
    return this.shadowRoot?.querySelector('umb-community-kanban-board') ?? undefined;
  }

  override updated() {
    // The parent arrives asynchronously, so the first load happens here rather than in the
    // constructor — but updated() runs on every render, so it must fire only when the
    // parent or culture has actually changed. The collection's items observable owns
    // reloading for anything else.
    if (!this._parentId) {
      // A genuine context disconnect (parent gone) discards the board child entirely in
      // render(). Clear the guard so a reconnect with the SAME parent GUID still reloads —
      // otherwise the freshly-created board element never receives a load() call and sits on
      // its own internal 'idle' status forever.
      this.#loadedFor = undefined;
      this.#awaitingCollectionSettle = false;
      return;
    }

    if (!this.#cultureResolved) return;

    const key = `${this._parentId}|${this._culture ?? ''}`;

    if (key === this.#loadedFor) return;

    this.#loadedFor = key;
    this.#awaitingCollectionSettle = true;
    this.#board?.load();
  }

  #onOpenDocument(event: CustomEvent<{ key: string }>) {
    if (!this.#modalReady) return;

    // The second argument is the inner workspace's own route, appended to the modal path. Without it
    // the modal opens on no route at all and renders nothing.
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

    // The document type is part of the path, which is why the card resolves it before asking: a
    // create route cannot be generated without knowing what is being created.
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

  override render() {
    if (!this._parentId) return html`<uui-loader></uui-loader>`;

    return html`
      <umb-community-kanban-board
        parent-id=${this._parentId}
        .culture=${this._culture}
        .datasource=${this.#datasource}
        @kanban-open-document=${this.#onOpenDocument}
        @kanban-create-child=${this.#onCreateChild}></umb-community-kanban-board>
    `;
  }

  static override styles = [
    css`
      /*
       * Horizontal only: the collection already spaces the view vertically, and the board's own styles
       * record that a second full gutter doubled the list view's inset. Applied through the viewport
       * variable for the reason the content-app host documents — this element must not pad a board
       * whose height is measured to the window.
       */
      :host {
        --kanban-viewport-padding: 0 1rem;
      }
    `,
  ];
}

export { UmbCommunityKanbanCollectionViewBoardElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-collection-view-board': UmbCommunityKanbanCollectionViewBoardElement;
  }
}
