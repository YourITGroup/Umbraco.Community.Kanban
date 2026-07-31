import { css, customElement, html, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_VARIANT_CONTEXT } from '@umbraco-cms/backoffice/variant';
import { UMB_DOCUMENT_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/document';
import type { ManifestWorkspaceView } from '@umbraco-cms/backoffice/workspace';
import './kanban-standalone-calendar.element.js';

/**
 * Adapts the standalone calendar host to a document workspace tab — the board wrapper's calendar
 * twin. Its only job is resolving the standalone element's three inputs: the open document is the
 * calendar's parent, the display culture comes from the variant context, and which configuration
 * to use rides in this view's own manifest meta. Everything else lives in the standalone element.
 */
@customElement('umb-community-kanban-workspace-view-calendar')
export class UmbCommunityKanbanWorkspaceViewCalendarElement extends UmbLitElement {
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
          // is an answer — the same guard every host documents.
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
    // the calendar invariant and then reload it when the culture arrives.
    if (!this._parentId || !this._culture) return html`<uui-loader></uui-loader>`;

    return html`
      <umb-community-kanban-standalone-calendar
        parent-id=${this._parentId}
        config-id=${this.#configId ?? ''}
        .culture=${this._culture}></umb-community-kanban-standalone-calendar>
    `;
  }

  static override styles = [
    css`
      /*
       * Padded here rather than in the calendar, which stays layout-neutral for the collection and
       * standalone hosts. Unlike the board this is safe as ordinary padding: the calendar is a plain
       * block that grows to its content and measures no heights.
       */
      :host {
        display: block;
        padding: 1rem;
      }
    `,
  ];
}

export { UmbCommunityKanbanWorkspaceViewCalendarElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-workspace-view-calendar': UmbCommunityKanbanWorkspaceViewCalendarElement;
  }
}
