import { customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UMB_COLLECTION_CONTEXT, UmbCollectionDefaultElement } from '@umbraco-cms/backoffice/collection';
import { isChromelessCollectionView } from './collection-chrome.model.js';

/**
 * The document collection, with the list view's own chrome hidden while a Kanban view is showing.
 *
 * Why an element at all: a collection's pager and selection-action bar are rendered by the collection
 * *layout*, not by the view inside it, and the layout is chosen per entity type — the workspace context
 * hands `umb-collection` a fixed alias — so a collection view has no way to say "not for me". The only
 * seam is this class's own `protected render*` methods, which core's own `umb-document-collection` uses in
 * exactly this way to add its filter field.
 *
 * What is hidden, and why:
 * - **The pager.** It pages the collection's items, which a board does not use: a board loads its own
 *   lanes and pages them individually. Left visible it offers to page something that never moves.
 * - **The selection-action bar.** It acts on a checkbox selection no board view can make, and a selection
 *   carried over from the list view would arm bulk actions against rows the editor can no longer see.
 *
 * Every other view keeps both, because the suppression is gated on which view is actually showing.
 */
@customElement('umb-community-kanban-document-collection')
export class UmbCommunityKanbanDocumentCollectionElement extends UmbCollectionDefaultElement {
  /** True while the showing view is one that supplies its own chrome. */
  @state()
  private _chromeless = false;

  constructor() {
    super();

    this.consumeContext(UMB_COLLECTION_CONTEXT, (context) => {
      this.observe(
        context?.view.currentView,
        (view) => {
          this._chromeless = isChromelessCollectionView(view?.alias);
        },
        '_observeKanbanCurrentView',
      );
    });
  }

  /**
   * Core's document toolbar, reproduced rather than inherited: `UmbDocumentCollectionElement` is not a
   * public export, so this class extends the default collection instead and has to restate the one thing
   * the document collection adds — its filter field. `umb-collection-toolbar` and
   * `umb-collection-filter-field` are global elements the collection package registers, so neither is
   * imported here.
   */
  protected override renderToolbar() {
    return html`
      <umb-collection-toolbar slot="header">
        <umb-collection-filter-field></umb-collection-filter-field>
      </umb-collection-toolbar>
    `;
  }

  protected override renderPagination() {
    // An empty template rather than `nothing`: the base class declares a TemplateResult return, and
    // widening it here would be a lie to every other caller.
    return this._chromeless ? html`` : super.renderPagination();
  }

  protected override renderSelectionActions() {
    return this._chromeless ? html`` : super.renderSelectionActions();
  }
}

export { UmbCommunityKanbanDocumentCollectionElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-document-collection': UmbCommunityKanbanDocumentCollectionElement;
  }
}
