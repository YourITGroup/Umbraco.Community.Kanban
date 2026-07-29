import { css, customElement, html, nothing, property, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbDocumentTypeStructureRepository } from '@umbraco-cms/backoffice/document-type';
import type { UmbAllowedDocumentTypeModel } from '@umbraco-cms/backoffice/document-type';
import { UmbDocumentBlueprintItemRepository } from '@umbraco-cms/backoffice/document-blueprint';
import type { UmbDocumentBlueprintItemBaseModel } from '@umbraco-cms/backoffice/document-blueprint';
import { formatChildOverflow } from './card-children.model.js';
import type { KanbanCardChildModel, KanbanCardModel } from '../data/kanban-board.types.js';

/**
 * A card's own children: icon, name, and a button opening each in the workspace modal — plus an add
 * button that replicates the create action's own type-then-blueprint choice.
 *
 * Its own element rather than more markup inside the card, because it owns fetching and menu state of
 * its own, and the card element is already the busiest file in core/.
 *
 * umb-icon, umb-popover-layout and uui-menu-item are global elements the backoffice shell registers,
 * so they are used without import — reaching into dist-cms to import them would be an unsupported
 * dependency.
 */
@customElement('umb-community-kanban-card-children')
export class UmbCommunityKanbanCardChildrenElement extends UmbLitElement {
  @property({ attribute: false })
  card?: KanbanCardModel;

  /**
   * Core's own repositories, so which types may be created under this card — including rules that
   * depend on the parent document — stays core's answer rather than a reimplementation.
   */
  #documentTypes = new UmbDocumentTypeStructureRepository(this);
  #blueprints = new UmbDocumentBlueprintItemRepository(this);

  /** Which menu, if any, the add button is currently offering. */
  @state()
  private _menu: 'none' | 'types' | 'blueprints' = 'none';

  @state()
  private _busy = false;

  /** True once a fetch has come back with nothing creatable, which is only knowable on click. */
  @state()
  private _noTypes = false;

  @state()
  private _types: Array<UmbAllowedDocumentTypeModel> = [];

  @state()
  private _blueprints: Array<UmbDocumentBlueprintItemBaseModel> = [];

  /** The type a blueprint is being chosen for. */
  #pendingType?: string;

  #onOpen(child: KanbanCardChildModel) {
    // The same event the card's title raises: the host does not care which control asked.
    this.dispatchEvent(
      new CustomEvent('kanban-open-document', {
        detail: { key: child.key },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Both fetches below happen on explicit user action and are deliberately not cached: a cache keyed
   * by content type would go stale the moment someone edits a document type's allowed children, and
   * core's own create action re-fetches on every open for the same reason.
   */
  async #onAdd() {
    if (!this.card || this._busy) return;

    this._busy = true;
    this._menu = 'none';
    this._noTypes = false;

    const { data } = await this.#documentTypes.requestAllowedChildrenOf(this.card.contentTypeKey, this.card.key);

    this._types = data?.items ?? [];
    this._busy = false;

    if (this._types.length === 0) {
      this._noTypes = true;
      return;
    }

    if (this._types.length === 1) {
      await this.#chooseType(this._types[0].unique);
      return;
    }

    await this.#openMenu('types');
  }

  async #chooseType(documentTypeUnique?: string | null) {
    if (!documentTypeUnique) return;

    this.#pendingType = documentTypeUnique;
    this._menu = 'none';
    this._busy = true;

    const { data } = await this.#blueprints.requestItemsByDocumentType(documentTypeUnique);

    this._blueprints = data ?? [];
    this._busy = false;

    if (this._blueprints.length === 0) {
      this.#create(documentTypeUnique);
      return;
    }

    await this.#openMenu('blueprints');
  }

  #create(documentTypeUnique: string, blueprintUnique?: string) {
    if (!this.card) return;

    this._menu = 'none';

    this.dispatchEvent(
      new CustomEvent('kanban-create-child', {
        detail: { parentKey: this.card.key, documentTypeUnique, blueprintUnique },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Shows a menu after its content is known.
   *
   * The popover is opened programmatically rather than by the button's own `popovertarget`, because
   * the choice of *whether* there is a menu is only known after a fetch — a declarative target would
   * flash an empty menu on every click. `uui-popover-container` positions itself against whichever
   * element carries `popovertarget` for its id, so the render must land before the popover opens;
   * awaiting `updateComplete` is what guarantees it.
   */
  async #openMenu(menu: 'types' | 'blueprints') {
    this._menu = menu;

    await this.updateComplete;

    this.shadowRoot?.querySelector<HTMLElement>(`#kanban-child-${menu}`)?.showPopover();
  }

  override render() {
    if (!this.card) return nothing;

    const overflow = formatChildOverflow(
      this.card.childTotal,
      this.card.children.length,
      this.card.childTotalIsExact,
    );

    return html`
      <div class="children">
        ${repeat(this.card.children, (child) => child.key, (child) => this.#renderChild(child))}
        ${overflow ? html`<span class="overflow">${overflow}</span>` : nothing}
        ${this.#renderAdd()}
      </div>
    `;
  }

  #renderAdd() {
    if (!this.card?.canCreate) return nothing;

    if (this._noTypes) {
      return html`<span class="overflow">${this.localize.term('content_noAllowedChildren') || 'Nothing can be created here'}</span>`;
    }

    return html`
      <uui-button
        compact
        look="placeholder"
        label=${this.localize.term('general_add')}
        .state=${this._busy ? 'waiting' : undefined}
        popovertarget=${this._menu !== 'none' ? `kanban-child-${this._menu}` : nothing}
        @click=${this.#onAdd}></uui-button>
      ${this._menu === 'types' ? this.#renderTypeMenu() : nothing}
      ${this._menu === 'blueprints' ? this.#renderBlueprintMenu() : nothing}
    `;
  }

  #renderTypeMenu() {
    return html`
      <uui-popover-container id="kanban-child-types" placement="bottom-start">
        <umb-popover-layout>
          ${repeat(
            this._types,
            (type) => type.unique,
            (type) => html`
              <uui-menu-item label=${this.localize.string(type.name)} @click=${() => this.#chooseType(type.unique)}>
                <umb-icon slot="icon" name=${type.icon ?? 'icon-document'}></umb-icon>
              </uui-menu-item>
            `,
          )}
        </umb-popover-layout>
      </uui-popover-container>
    `;
  }

  #renderBlueprintMenu() {
    const documentTypeUnique = this.#pendingType;

    return html`
      <uui-popover-container id="kanban-child-blueprints" placement="bottom-start">
        <umb-popover-layout>
          <uui-menu-item
            label=${this.localize.term('blueprints_blankBlueprint') || 'Blank'}
            @click=${() => documentTypeUnique && this.#create(documentTypeUnique)}>
            <umb-icon slot="icon" name="icon-document"></umb-icon>
          </uui-menu-item>
          ${repeat(
            this._blueprints,
            (blueprint) => blueprint.unique,
            (blueprint) => html`
              <uui-menu-item
                label=${blueprint.name}
                @click=${() => documentTypeUnique && this.#create(documentTypeUnique, blueprint.unique)}>
                <umb-icon slot="icon" name="icon-blueprint"></umb-icon>
              </uui-menu-item>
            `,
          )}
        </umb-popover-layout>
      </uui-popover-container>
    `;
  }

  #renderChild(child: KanbanCardChildModel) {
    return html`
      <div class="child">
        ${child.icon ? html`<umb-icon name=${child.icon}></umb-icon>` : nothing}
        <span class="child-name">${child.name}</span>
        <uui-button
          compact
          look="default"
          label=${this.localize.term('general_edit')}
          @click=${() => this.#onOpen(child)}>
          <uui-icon name="icon-edit"></uui-icon>
        </uui-button>
      </div>
    `;
  }

  static override styles = [
    css`
      .children {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-1);
        border-top: 1px solid var(--uui-color-divider);
        padding-top: var(--uui-size-space-2);
        font-size: var(--uui-type-small-size);
      }

      .child {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
      }

      .child-name {
        flex: 1;
        overflow-wrap: anywhere;
      }

      .overflow {
        color: var(--uui-color-text-alt);
      }
    `,
  ];
}

export { UmbCommunityKanbanCardChildrenElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-card-children': UmbCommunityKanbanCardChildrenElement;
  }
}
