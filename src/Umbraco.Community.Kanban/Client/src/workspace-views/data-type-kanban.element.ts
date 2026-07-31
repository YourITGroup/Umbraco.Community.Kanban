import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_DATA_TYPE_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/data-type';
import { KANBAN_COLLECTION_PROPERTY_EDITOR_UI_ALIAS } from '@/constants.js';
import './kanban-config-picker.element.js';

/**
 * The Kanban tab on a Collection data type: which Board and which Calendar configuration this
 * collection's Kanban layouts use, written to `kanban.boardConfigId` / `kanban.calendarConfigId` —
 * the keys GET /board and GET /calendar resolve through, because a collection view cannot be
 * handed custom configuration directly.
 *
 * The two rows are the same picker element with a different `kind`. Deliberately separate
 * elements, not shared markup: each picker registers its own data-type-workspace modal, and two
 * such registrations on one host replace each other (the controller alias defaults to the modal
 * token's alias) — the regression that once killed the create button.
 *
 * The tab is gated by our own `Umb.Community.Kanban.Condition.DataTypeIsCollection` condition,
 * because Umbraco has no built-in condition for a data type's property editor UI alias. The
 * alias check below is defence-in-depth for the same reason.
 */
@customElement('umb-community-kanban-data-type-view')
export class UmbCommunityKanbanDataTypeViewElement extends UmbLitElement {
  @state()
  private _applies = false;

  constructor() {
    super();

    this.consumeContext(UMB_DATA_TYPE_WORKSPACE_CONTEXT, (context) => {
      if (!context) return;

      this.observe(
        context.propertyEditorUiAlias,
        (alias) => {
          this._applies = alias === KANBAN_COLLECTION_PROPERTY_EDITOR_UI_ALIAS;
        },
        '_kanbanPropertyEditorUiAlias',
      );
    });
  }

  override render() {
    if (!this._applies) return nothing;

    return html`
      <uui-box headline="Kanban">
        <umb-property-layout
          label="Board configuration"
          description="Which Kanban Board configuration this collection's Kanban layout uses.">
          <umb-community-kanban-config-picker slot="editor" kind="Board"></umb-community-kanban-config-picker>
        </umb-property-layout>
        <umb-property-layout
          label="Calendar configuration"
          description="Which Kanban Calendar configuration this collection's Calendar layout uses.">
          <umb-community-kanban-config-picker slot="editor" kind="Calendar"></umb-community-kanban-config-picker>
        </umb-property-layout>
      </uui-box>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
        margin: var(--uui-size-layout-1);
      }
    `,
  ];
}

export { UmbCommunityKanbanDataTypeViewElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-data-type-view': UmbCommunityKanbanDataTypeViewElement;
  }
}
