import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_DATA_TYPE_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/data-type';
import {
  KANBAN_BOARD_CONFIG_ID_KEY,
  KANBAN_COLLECTION_PROPERTY_EDITOR_UI_ALIAS,
} from '@/constants.js';
import { getBoardConfigurations, type KanbanConfigurationModel } from '@/data/kanban-configuration-data-source.js';

/**
 * Lets an editor choose which Kanban Board configuration a Collection data type's board
 * layout uses, writing it to `kanban.boardConfigId`. That key is what GET /board resolves
 * through, because a collection view cannot be handed custom configuration directly.
 *
 * There is no extension condition for a data type's property editor UI alias, so this
 * registers on every data type workspace and hides itself when the alias does not match.
 */
@customElement('umb-community-kanban-data-type-view')
export class UmbCommunityKanbanDataTypeViewElement extends UmbLitElement {
  #workspace?: typeof UMB_DATA_TYPE_WORKSPACE_CONTEXT.TYPE;

  @state()
  private _applies = false;

  @state()
  private _configurations: KanbanConfigurationModel[] = [];

  @state()
  private _selected = '';

  constructor() {
    super();

    this.consumeContext(UMB_DATA_TYPE_WORKSPACE_CONTEXT, (context) => {
      this.#workspace = context;

      if (!context) return;

      this.observe(context.propertyEditorUiAlias, (alias) => {
        this._applies = alias === KANBAN_COLLECTION_PROPERTY_EDITOR_UI_ALIAS;

        if (this._applies) this.#load();
      }, '_kanbanPropertyEditorUiAlias');
    });
  }

  async #load() {
    this._configurations = await getBoardConfigurations(this);
    this._selected = this.#workspace?.getPropertyValue<string>(KANBAN_BOARD_CONFIG_ID_KEY) ?? '';
  }

  async #onChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this._selected = value;

    // The empty option clears the setting, which returns the layout to "not configured"
    // rather than leaving a dangling key.
    await this.#workspace?.setPropertyValue(KANBAN_BOARD_CONFIG_ID_KEY, value || undefined);
  }

  override render() {
    if (!this._applies) return nothing;

    return html`
      <uui-box headline="Kanban">
        <umb-property-layout
          label="Board configuration"
          description="Which Kanban Board configuration this collection's Kanban layout uses.">
          ${this._configurations.length
            ? html`<uui-select
                slot="editor"
                label="Board configuration"
                .value=${this._selected}
                .options=${this.#options()}
                @change=${this.#onChange}></uui-select>`
            : html`<span slot="editor" class="empty"
                >No Kanban Board data types exist yet. Create one under Settings → Data Types.</span
              >`}
        </umb-property-layout>
      </uui-box>
    `;
  }

  #options() {
    return [
      { name: 'Not set', value: '', selected: this._selected === '' },
      ...this._configurations.map((configuration) => ({
        name: configuration.name,
        value: configuration.key,
        selected: configuration.key === this._selected,
      })),
    ];
  }

  static override styles = [
    css`
      :host {
        display: block;
        margin: var(--uui-size-layout-1);
      }

      .empty {
        color: var(--uui-color-text-alt);
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
