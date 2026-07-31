import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
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
  KANBAN_CALENDAR_CONFIG_ID_KEY,
  KANBAN_CALENDAR_EDITOR_UI_ALIAS,
} from '@/constants.js';
import { getConfigurationsOfKind, type KanbanConfigurationModel } from '@/data/kanban-configuration-data-source.js';
import { buildBoardDataTypeName, buildCalendarDataTypeName } from './board-data-type-name.js';

/** Everything about a picker that differs between the two kinds, keyed once. */
const KIND_SHAPE = {
  Board: {
    configKey: KANBAN_BOARD_CONFIG_ID_KEY,
    editorUiAlias: KANBAN_BOARD_EDITOR_UI_ALIAS,
    icon: 'icon-columns',
    createLabel: 'Create Kanban Board data type',
    emptyHint: 'No Kanban Board data types exist yet.',
    modalPath: 'kanban-board',
    buildName: buildBoardDataTypeName,
  },
  Calendar: {
    configKey: KANBAN_CALENDAR_CONFIG_ID_KEY,
    editorUiAlias: KANBAN_CALENDAR_EDITOR_UI_ALIAS,
    icon: 'icon-calendar',
    createLabel: 'Create Kanban Calendar data type',
    emptyHint: 'No Kanban Calendar data types exist yet.',
    modalPath: 'kanban-calendar',
    buildName: buildCalendarDataTypeName,
  },
} as const;

/**
 * Picks — or creates, or edits in place — the Kanban configuration one Collection layout uses,
 * writing its key to the Collection data type. One element serves both kinds; the `kind`
 * attribute selects the config key, the create preset and the copy.
 *
 * Its own element rather than two hand-mirrored blocks in the Kanban tab, and not only for reuse:
 * `UmbModalRouteRegistrationController`'s controller alias defaults to the modal token's alias, so
 * two registrations of the data type workspace modal on ONE host silently replace each other —
 * which is exactly the regression that broke the create button when the calendar picker first
 * shared the tab's element. Separate picker elements are separate controller hosts, so each
 * registration stands on its own.
 */
@customElement('umb-community-kanban-config-picker')
export class UmbCommunityKanbanConfigPickerElement extends UmbLitElement {
  @property({ type: String })
  kind: 'Board' | 'Calendar' = 'Board';

  #workspace?: typeof UMB_DATA_TYPE_WORKSPACE_CONTEXT.TYPE;

  @state()
  private _configurations: KanbanConfigurationModel[] = [];

  @state()
  private _selected = '';

  /**
   * Whether the data type modal's route is registered yet. `open()` silently does nothing until
   * the router hands over a builder, so buttons rendered before then would be dead on click.
   */
  @state()
  private _modalReady = false;

  /**
   * Opens Umbraco's own data type workspace as a sidebar modal — to create a missing Kanban data
   * type, or to edit the chosen one — so an editor never leaves this workspace to do either. A
   * modal *route* registration because the data type workspace is route-driven: create and edit
   * are only reachable by navigating to their own paths. One registration serves both.
   */
  #dataTypeModal: UmbModalRouteRegistrationController<
    typeof UMB_DATATYPE_WORKSPACE_MODAL.DATA,
    typeof UMB_DATATYPE_WORKSPACE_MODAL.VALUE
  >;

  get #shape() {
    return KIND_SHAPE[this.kind];
  }

  constructor() {
    super();

    this.consumeContext(UMB_DATA_TYPE_WORKSPACE_CONTEXT, (context) => {
      this.#workspace = context;

      if (context) void this.#load();
    });

    this.#dataTypeModal = new UmbModalRouteRegistrationController(this, UMB_DATATYPE_WORKSPACE_MODAL)
      // The token's alias is the generic `Umb.Modal.Workspace`; a distinct segment per kind keeps
      // the two pickers' routes unambiguous in the shared routing scope. A unique path rather
      // than a literal because the kind is an attribute, unknown at construction time.
      .addUniquePaths(['kanbanKind'])
      .onSetup(() => ({
        data: {
          // Only the editor UI alias is preset: the schema alias and default configuration derive
          // from our UI manifest exactly as when an editor picks the editor by hand, so the created
          // data type is indistinguishable from a hand-made one — which is what makes
          // GET /configurations report it. Ignored when editing.
          preset: {
            editorUiAlias: this.#shape.editorUiAlias,
            name: this.#shape.buildName(this.#workspace?.getName()),
          },
        },
      }))
      .onSubmit((value) => {
        // Only fires on save; a dismissed modal leaves this panel exactly as it was.
        if (value?.unique) void this.#onSaved(value.unique);
      })
      .observeRouteBuilder(() => {
        this._modalReady = true;
      });
  }

  override connectedCallback() {
    super.connectedCallback();
    // The kind attribute is set by the time we connect; the path parameter keeps the two picker
    // instances' modal routes distinct.
    this.#dataTypeModal.setUniquePathValue('kanbanKind', this.kind === 'Board' ? 'kanban-board' : 'kanban-calendar');
  }

  async #load() {
    this._configurations = await getConfigurationsOfKind(this, this.kind);
    this._selected = this.#workspace?.getPropertyValue<string>(this.#shape.configKey) ?? '';
  }

  #onCreate() {
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

  /** Runs after the modal saves, whether it created or edited — reloading covers renames too. */
  async #onSaved(unique: string) {
    await this.#load();

    // Select it only once the server actually reports it as a configuration of this kind.
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
        // Filtered by the keys GET /configurations returned rather than by a property editor
        // alias, because a tree item carries no editor alias to filter on.
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
    await this.#workspace?.setPropertyValue(this.#shape.configKey, unique);
  }

  async #onRemove() {
    this._selected = '';

    // Clearing the setting returns the layout to "not configured" rather than leaving a dangling key.
    await this.#workspace?.setPropertyValue(this.#shape.configKey, undefined);
  }

  override render() {
    if (this._selected) return this.#renderSelected();

    // Choose and Create sit side by side whenever each is possible: an editor with existing
    // configurations may still want a fresh one.
    return html`
      ${this._configurations.length
        ? html`<uui-button look="placeholder" label="Choose" @click=${this.#onChoose}></uui-button>`
        : html`<span class="hint">${this.#shape.emptyHint}</span>`}
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
        <uui-icon slot="icon" name=${this.#shape.icon}></uui-icon>
        <uui-action-bar slot="actions">
          ${this._modalReady ? html`<uui-button label="Edit" @click=${this.#onEdit}>Edit</uui-button>` : nothing}
          <uui-button label="Remove" @click=${this.#onRemove}>Remove</uui-button>
        </uui-action-bar>
      </uui-ref-node>
    `;
  }

  #renderCreate() {
    if (this._modalReady) {
      return html`<uui-button look="secondary" label=${this.#shape.createLabel} @click=${this.#onCreate}></uui-button>`;
    }

    // Never a dead end: with no route registered there is no create button, so if there is also
    // nothing to choose, fall back to telling the editor where to go by hand.
    return this._configurations.length
      ? nothing
      : html`<span class="hint">Create one under Settings → Data Types.</span>`;
  }

  static override styles = [
    css`
      :host {
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

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-config-picker': UmbCommunityKanbanConfigPickerElement;
  }
}
