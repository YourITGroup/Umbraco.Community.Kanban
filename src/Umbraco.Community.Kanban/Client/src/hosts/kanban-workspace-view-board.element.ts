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
