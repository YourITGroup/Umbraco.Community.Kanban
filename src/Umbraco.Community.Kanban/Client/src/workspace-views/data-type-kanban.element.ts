import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import {
  UMB_DATA_TYPE_ENTITY_TYPE,
  UMB_DATA_TYPE_WORKSPACE_CONTEXT,
  UMB_DATATYPE_WORKSPACE_MODAL,
} from '@umbraco-cms/backoffice/data-type';
import { UmbModalRouteRegistrationController } from '@umbraco-cms/backoffice/router';
import {
  KANBAN_BOARD_CONFIG_ID_KEY,
  KANBAN_BOARD_EDITOR_UI_ALIAS,
  KANBAN_COLLECTION_PROPERTY_EDITOR_UI_ALIAS,
} from '@/constants.js';
import { getBoardConfigurations, type KanbanConfigurationModel } from '@/data/kanban-configuration-data-source.js';
import { buildBoardDataTypeName } from './board-data-type-name.js';

/**
 * Lets an editor choose which Kanban Board configuration a Collection data type's board
 * layout uses, writing it to `kanban.boardConfigId`. That key is what GET /board resolves
 * through, because a collection view cannot be handed custom configuration directly.
 *
 * When no Kanban Board data type exists yet there is nothing to choose, so the empty state offers to
 * create one inline instead of sending the editor off to Settings → Data Types.
 *
 * The tab is gated by our own `Umb.Community.Kanban.Condition.DataTypeIsCollection` condition,
 * because Umbraco has no built-in condition for a data type's property editor UI alias. The
 * alias check below is defence-in-depth for the same reason.
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

  /**
   * Whether the create-modal route is registered yet. `open()` silently does nothing until the
   * router hands over a builder, so a button rendered before then would be dead on click.
   */
  @state()
  private _canCreate = false;

  /**
   * Opens Umbraco's own data type workspace as a sidebar modal, pre-seeded with our property editor
   * UI, so an editor can create the missing Kanban Board data type without leaving this workspace.
   *
   * This is a modal *route* registration rather than `UMB_MODAL_MANAGER_CONTEXT.open()` because the
   * data type workspace is route-driven: create mode is only reachable by navigating to its
   * `create/parent/...` path, so opening the modal directly would render a workspace with no route
   * to resolve. Umbraco's own inline data type creation
   * (`umb-input-content-type-collection-configuration`, the data type picker flow) works the same way.
   */
  #createModal: UmbModalRouteRegistrationController<
    typeof UMB_DATATYPE_WORKSPACE_MODAL.DATA,
    typeof UMB_DATATYPE_WORKSPACE_MODAL.VALUE
  >;

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

    this.#createModal = new UmbModalRouteRegistrationController(this, UMB_DATATYPE_WORKSPACE_MODAL)
      // The token's alias is the generic `Umb.Modal.Workspace`, so the generated route would be
      // `modal/Umb.Modal.Workspace` — shared with any other workspace modal registered in the same
      // routing scope. A distinct segment keeps ours unambiguous, as every core usage does.
      .addAdditionalPath('kanban-board')
      .onSetup(() => ({
        // `entityType` is deliberately not passed: the token already defaults it to `data-type`, and
        // modal data deep-merges over those defaults rather than replacing them.
        data: {
          // Only the editor UI alias is preset. The property editor *schema* alias and its default
          // configuration are derived from our UI manifest exactly as they are when an editor picks
          // the "Kanban Board" editor by hand, so the created data type is indistinguishable from a
          // hand-made one — which is what makes GET /configurations report it.
          preset: {
            editorUiAlias: KANBAN_BOARD_EDITOR_UI_ALIAS,
            name: buildBoardDataTypeName(this.#workspace?.getName()),
          },
        },
      }))
      .onSubmit((value) => {
        // Only fires on save; a dismissed modal leaves the empty state exactly as it was.
        if (value?.unique) this.#onCreated(value.unique);
      })
      .observeRouteBuilder(() => {
        this._canCreate = true;
      });
  }

  async #load() {
    this._configurations = await getBoardConfigurations(this);
    this._selected = this.#workspace?.getPropertyValue<string>(KANBAN_BOARD_CONFIG_ID_KEY) ?? '';
  }

  #onCreate() {
    // The second argument is the inner workspace's own create route, appended to the modal path.
    // Without it the modal opens on no route at all and renders nothing.
    this.#createModal.open({}, `create/parent/${UMB_DATA_TYPE_ENTITY_TYPE}/null`);
  }

  async #onCreated(unique: string) {
    await this.#load();

    // Select it only once the server actually reports it as a Board configuration. Otherwise leave
    // the picker untouched rather than writing a key the board would fail to resolve.
    if (!this._configurations.some((configuration) => configuration.key === unique)) return;

    this._selected = unique;
    await this.#workspace?.setPropertyValue(KANBAN_BOARD_CONFIG_ID_KEY, unique);
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
            : html`<div slot="editor" class="empty">
                <span>No Kanban Board data types exist yet.</span>
                ${this._canCreate
                  ? html`<uui-button
                      look="primary"
                      label="Create Kanban Board data type"
                      @click=${this.#onCreate}></uui-button>`
                  : // Never a dead end: if the modal route is not registered, fall back to telling
                    // the editor where to go by hand.
                    html`<span>Create one under Settings → Data Types.</span>`}
              </div>`}
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
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: var(--uui-size-space-3);
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
