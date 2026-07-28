import { html, customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * Rendered where a Kanban Board property sits on a document.
 *
 * The board itself arrives in a later milestone. Until then this is a placeholder,
 * deliberately rendering nothing that writes a value — the server-side value editor
 * is read-only and this element must not fight that.
 */
@customElement('umb-community-kanban-board-config')
export class UmbCommunityKanbanBoardConfigElement extends UmbLitElement {
  override render() {
    return html`<uui-box headline="Kanban board">
      <p>This board renders here once the board view ships. Its settings are configured on the data type.</p>
    </uui-box>`;
  }
}

export { UmbCommunityKanbanBoardConfigElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-board-config': UmbCommunityKanbanBoardConfigElement;
  }
}
