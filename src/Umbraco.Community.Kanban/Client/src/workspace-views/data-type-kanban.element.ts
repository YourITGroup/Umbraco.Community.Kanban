import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import {
  UMB_CREATE_DATA_TYPE_WORKSPACE_PATH_PATTERN,
  UMB_DATA_TYPE_ENTITY_TYPE,
  UMB_DATA_TYPE_PICKER_MODAL,
  UMB_DATA_TYPE_WORKSPACE_CONTEXT,
  UMB_DATATYPE_WORKSPACE_MODAL,
  UMB_EDIT_DATA_TYPE_WORKSPACE_PATH_PATTERN,
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
 * A picker rather than a select, so the chosen configuration can be opened and edited in place, and
 * replaced or cleared without leaving the workspace. When none exists yet there is nothing to
 * choose, so the same panel offers to create one instead of sending the editor off to Settings.
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
   * Whether the data type modal's route is registered yet. `open()` silently does nothing until the
   * router hands over a builder, so buttons rendered before then would be dead on click.
   */
  @state()
  private _modalReady = false;

  /**
   * Opens Umbraco's own data type workspace as a sidebar modal — to create the missing Kanban Board
   * data type, or to edit the chosen one — so an editor never leaves this workspace to do either.
   *
   * This is a modal *route* registration rather than `UMB_MODAL_MANAGER_CONTEXT.open()` because the
   * data type workspace is route-driven: create and edit are only reachable by navigating to their
   * own paths, so opening the modal directly would render a workspace with no route to resolve.
   * Umbraco's own inline data type creation (`umb-input-content-type-collection-configuration`, the
   * data type picker flow) works the same way. One registration serves both: the path passed to
   * `open()` decides which.
   */
  #dataTypeModal: UmbModalRouteRegistrationController<
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

    this.#dataTypeModal = new UmbModalRouteRegistrationController(this, UMB_DATATYPE_WORKSPACE_MODAL)
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
          // hand-made one — which is what makes GET /configurations report it. Ignored when
          // editing: a preset only applies to a freshly scaffolded entity.
          preset: {
            editorUiAlias: KANBAN_BOARD_EDITOR_UI_ALIAS,
            name: buildBoardDataTypeName(this.#workspace?.getName()),
          },
        },
      }))
      .onSubmit((value) => {
        // Only fires on save; a dismissed modal leaves this panel exactly as it was.
        if (value?.unique) this.#onSaved(value.unique);
      })
      .observeRouteBuilder(() => {
        this._modalReady = true;
      });
  }

  async #load() {
    this._configurations = await getBoardConfigurations(this);
    this._selected = this.#workspace?.getPropertyValue<string>(KANBAN_BOARD_CONFIG_ID_KEY) ?? '';
  }

  #onCreate() {
    // The second argument is the inner workspace's own route, appended to the modal path. Without
    // it the modal opens on no route at all and renders nothing.
    this.#dataTypeModal.open(
      {},
      UMB_CREATE_DATA_TYPE_WORKSPACE_PATH_PATTERN.generateLocal({
        parentEntityType: UMB_DATA_TYPE_ENTITY_TYPE,
        parentUnique: null,
      }),
    );
  }

  #onEdit() {
    if (!this._selected || !this._modalReady) return;

    this.#dataTypeModal.open({}, UMB_EDIT_DATA_TYPE_WORKSPACE_PATH_PATTERN.generateLocal({ unique: this._selected }));
  }

  /**
   * Runs after the modal saves, whether it created or edited. Reloading covers a renamed
   * configuration as well as a new one.
   */
  async #onSaved(unique: string) {
    await this.#load();

    // Select it only once the server actually reports it as a Board configuration. Otherwise leave
    // the picker untouched rather than writing a key the board would fail to resolve.
    if (this._selected === unique) return;
    if (!this._configurations.some((configuration) => configuration.key === unique)) return;

    await this.#select(unique);
  }

  async #onChoose() {
    const keys = new Set(this._configurations.map((configuration) => configuration.key));

    const picked = await umbOpenModal(this, UMB_DATA_TYPE_PICKER_MODAL, {
      data: {
        hideTreeRoot: true,
        multiple: false,
        // The tree lists every data type, but only a Kanban Board one can drive a board layout.
        // Filtered by the keys GET /configurations returned rather than by a property editor alias,
        // because a tree item carries no editor alias to filter on.
        pickableFilter: (item) => keys.has(item.unique ?? ''),
      },
      value: { selection: this._selected ? [this._selected] : [] },
    }).catch(() => undefined);

    const unique = picked?.selection?.[0];
    if (!unique) return;

    await this.#select(unique);
  }

  async #select(unique: string) {
    this._selected = unique;
    await this.#workspace?.setPropertyValue(KANBAN_BOARD_CONFIG_ID_KEY, unique);
  }

  async #onRemove() {
    this._selected = '';

    // Clearing the setting returns the layout to "not configured" rather than leaving a dangling key.
    await this.#workspace?.setPropertyValue(KANBAN_BOARD_CONFIG_ID_KEY, undefined);
  }

  override render() {
    if (!this._applies) return nothing;

    return html`
      <uui-box headline="Kanban">
        <umb-property-layout
          label="Board configuration"
          description="Which Kanban Board configuration this collection's Kanban layout uses.">
          <div slot="editor" class="editor">${this.#renderEditor()}</div>
        </umb-property-layout>
      </uui-box>
    `;
  }

  #renderEditor() {
    if (this._selected) return this.#renderSelected();

    return html`
      ${this._configurations.length
        ? html`<uui-button look="placeholder" label="Choose" @click=${this.#onChoose}></uui-button>`
        : html`<span class="hint">No Kanban Board data types exist yet.</span>`}
      ${this.#renderCreate()}
    `;
  }

  #renderSelected() {
    const configuration = this._configurations.find((item) => item.key === this._selected);

    return html`
      <uui-ref-node
        standalone
        name=${configuration?.name ?? 'Unknown configuration'}
        detail=${configuration ? '' : 'This data type no longer exists'}
        @open=${this.#onEdit}>
        <uui-icon slot="icon" name="icon-grid"></uui-icon>
        <uui-action-bar slot="actions">
          ${this._modalReady
            ? html`<uui-button label="Edit" @click=${this.#onEdit}>Edit</uui-button>`
            : nothing}
          <uui-button label="Remove" @click=${this.#onRemove}>Remove</uui-button>
        </uui-action-bar>
      </uui-ref-node>
    `;
  }

  #renderCreate() {
    if (this._modalReady) {
      return html`<uui-button
        look="secondary"
        label="Create Kanban Board data type"
        @click=${this.#onCreate}></uui-button>`;
    }

    // Never a dead end: with no route registered there is no create button, so if there is also
    // nothing to choose, fall back to telling the editor where to go by hand.
    return this._configurations.length ? nothing : html`<span class="hint">Create one under Settings → Data Types.</span>`;
  }

  static override styles = [
    css`
      :host {
        display: block;
        margin: var(--uui-size-layout-1);
      }

      .editor {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: var(--uui-size-space-3);
      }

      .hint {
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
