import { customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_COLLECTION_CONTEXT } from '@umbraco-cms/backoffice/collection';
import { UMB_ENTITY_CONTEXT } from '@umbraco-cms/backoffice/entity';
import { UMB_VARIANT_CONTEXT } from '@umbraco-cms/backoffice/variant';
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
        this._culture = culture;
      }, '_kanbanDisplayCulture');
    });

    // items emits on every collection load, which is the reload signal for this milestone.
    this.consumeContext(UMB_COLLECTION_CONTEXT, (context) => {
      this.observe(context?.items, () => {
        this.#board?.load();
      }, '_kanbanCollectionItems');
    });
  }

  /** The parent/culture pair the board was last loaded for, so a re-render is not a re-fetch. */
  #loadedFor?: string;

  get #board() {
    return this.shadowRoot?.querySelector('umb-community-kanban-board') ?? undefined;
  }

  override updated() {
    // The parent arrives asynchronously, so the first load happens here rather than in the
    // constructor — but updated() runs on every render, so it must fire only when the
    // parent or culture has actually changed. The collection's items observable owns
    // reloading for anything else.
    if (!this._parentId) return;

    const key = `${this._parentId}|${this._culture ?? ''}`;

    if (key === this.#loadedFor) return;

    this.#loadedFor = key;
    this.#board?.load();
  }

  override render() {
    if (!this._parentId) return html`<uui-loader></uui-loader>`;

    return html`
      <umb-community-kanban-board
        parent-id=${this._parentId}
        .culture=${this._culture}
        .datasource=${this.#datasource}
        ?readonly=${true}></umb-community-kanban-board>
    `;
  }
}

export { UmbCommunityKanbanCollectionViewBoardElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-collection-view-board': UmbCommunityKanbanCollectionViewBoardElement;
  }
}
