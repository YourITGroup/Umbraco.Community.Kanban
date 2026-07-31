import { customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_ENTITY_CONTEXT } from '@umbraco-cms/backoffice/entity';
import { UMB_VARIANT_CONTEXT } from '@umbraco-cms/backoffice/variant';
import './kanban-standalone-calendar.element.js';

/**
 * Adapts the calendar to the document Collection layout picker. It resolves the parent document
 * and display culture and renders the standalone host — deliberately with no config-id: a
 * collection view cannot be handed custom configuration, so the server resolves the calendar
 * configuration from the parent's collection data type (`kanban.calendarConfigId`), exactly as
 * the board layout resolves its own.
 */
@customElement('umb-community-kanban-collection-view-calendar')
export class UmbCommunityKanbanCollectionViewCalendarElement extends UmbLitElement {
  @state()
  private _parentId?: string;

  @state()
  private _culture?: string;

  constructor() {
    super();

    // The parent GUID comes from the entity context, not the collection context — the
    // collection context has no parent member and resolves its own parent the same way.
    this.consumeContext(UMB_ENTITY_CONTEXT, (context) => {
      this.observe(
        context?.unique,
        (unique) => {
          this._parentId = unique ?? undefined;
        },
        '_kanbanParentUnique',
      );
    });

    this.consumeContext(UMB_VARIANT_CONTEXT, (context) => {
      this.observe(
        context?.displayCulture,
        (culture) => {
          // Undefined emits synchronously on subscribe; only a truthy culture is an answer.
          if (!culture) return;

          this._culture = culture;
        },
        '_kanbanDisplayCulture',
      );
    });
  }

  override render() {
    if (!this._parentId || !this._culture) return html`<uui-loader></uui-loader>`;

    return html`
      <umb-community-kanban-standalone-calendar
        parent-id=${this._parentId}
        .culture=${this._culture}></umb-community-kanban-standalone-calendar>
    `;
  }
}

export { UmbCommunityKanbanCollectionViewCalendarElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-collection-view-calendar': UmbCommunityKanbanCollectionViewCalendarElement;
  }
}
