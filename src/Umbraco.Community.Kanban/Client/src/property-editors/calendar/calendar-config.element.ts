import { html, customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * Rendered where a Kanban Calendar property sits on a document.
 * The calendar itself arrives in a later milestone.
 */
@customElement('umb-community-kanban-calendar-config')
export class UmbCommunityKanbanCalendarConfigElement extends UmbLitElement {
  override render() {
    return html`<uui-box headline="Kanban calendar">
      <p>This calendar renders here once the calendar view ships. Its settings are configured on the data type.</p>
    </uui-box>`;
  }
}

export { UmbCommunityKanbanCalendarConfigElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-calendar-config': UmbCommunityKanbanCalendarConfigElement;
  }
}
