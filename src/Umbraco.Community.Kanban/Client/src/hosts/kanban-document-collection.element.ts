import { customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import type { PropertyValues } from '@umbraco-cms/backoffice/external/lit';
import { UMB_COLLECTION_CONTEXT, UmbCollectionDefaultElement } from '@umbraco-cms/backoffice/collection';
import { UmbKanbanBoardActionsContext, type KanbanBoardActionsState } from '@/core/board-actions.context.js';
import { isChromelessCollectionView } from './collection-chrome.model.js';
import '@/core/kanban-action-bar.element.js';

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

  /** What the board wants its action bar to show, or undefined while no board is reporting. */
  @state()
  private _actions?: KanbanBoardActionsState;

  /**
   * Provided here rather than in the board because only this element can render into the layout's footer
   * slot — the same slot the native bulk-action bar uses, and why that bar spans the full width.
   */
  #boardActions = new UmbKanbanBoardActionsContext(this);

  constructor() {
    super();

    this.observe(
      this.#boardActions.state,
      (state) => {
        this._actions = state;
      },
      '_observeKanbanBoardActions',
    );

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
   * Drops the layout's own padding around the content while a board is showing, so the canvas reaches the
   * edges of the region instead of sitting in a gutter it does not want.
   *
   * Set as an attribute rather than styled: `main-no-padding` is `umb-body-layout`'s own documented switch
   * for this, and the padded box is inside *its* shadow root where no stylesheet of ours reaches. Set
   * imperatively rather than in a template because the layout element comes from the inherited `render()`,
   * which cannot be overridden usefully — it calls private members of the base class.
   *
   * A list view still gets the padding, since its rows depend on it.
   */
  protected override updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties);

    this.shadowRoot?.querySelector('umb-body-layout')?.toggleAttribute('main-no-padding', this._chromeless);
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

  /**
   * The board's action bar in place of the list view's, in the same footer slot — which is what lets it
   * span the full width, since that slot sits outside the padded `#main` box.
   *
   * Styled to match `umb-collection-selection-actions` deliberately: a board action should read as the same
   * kind of control as a bulk action, in the same place, so the two never look like different mechanisms.
   */
  protected override renderSelectionActions() {
    if (!this._chromeless) return super.renderSelectionActions();

    const actions = this._actions;

    if (!actions || actions.pending === 0) return html``;

    return html`
      <umb-community-kanban-action-bar
        slot="footer"
        .barState=${actions}
        @kanban-undo=${this.#onUndo}
        @kanban-publish=${this.#onPublish}></umb-community-kanban-action-bar>
    `;
  }

  #onUndo() {
    void this.#boardActions.undo();
  }

  #onPublish() {
    void this.#boardActions.publish();
  }

  static override styles = [
    ...(Array.isArray(UmbCollectionDefaultElement.styles)
      ? UmbCollectionDefaultElement.styles
      : [UmbCollectionDefaultElement.styles]),
  ];
}

export { UmbCommunityKanbanDocumentCollectionElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-document-collection': UmbCommunityKanbanDocumentCollectionElement;
  }
}
