import { css, customElement, html, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';
import { umbOpenModal, UMB_ITEM_PICKER_MODAL } from '@umbraco-cms/backoffice/modal';
import {
  UMB_DOCUMENT_TYPE_PICKER_MODAL,
  UmbDocumentTypeDetailRepository,
  UmbDocumentTypeItemRepository,
  type UmbDocumentTypeDetailModel,
} from '@umbraco-cms/backoffice/document-type';
import { UMB_DATA_TYPE_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/data-type';
import { KANBAN_LANE_CONTENT_TYPE_KEY } from '@/constants.js';
import { toPropertyPickerItems } from './lane-property.model.js';

/**
 * Picks the property whose value decides which lane a card sits in, by browsing to it: choose a
 * document type, then choose one of its properties. The same sequence Umbraco itself uses to add a
 * column to a Collection, so an editor cannot mistype an alias that resolves to no lanes at all.
 *
 * The stored value is only the property alias, because a board resolves lanes against the content
 * type of whatever document is being viewed, not the one browsed here. The content type browsed to
 * is written alongside it under `laneContentTypeKey` — the configuration editor needs it to say
 * where the property came from, and to preview lanes at all, having no document of its own.
 */
@customElement('umb-community-kanban-lane-property')
export class UmbCommunityKanbanLanePropertyElement extends UmbLitElement {
  @property({ type: String })
  value = '';

  /** The name of the content type the property was picked from, for display only. */
  @state()
  private _contentTypeName = '';

  #workspace?: typeof UMB_DATA_TYPE_WORKSPACE_CONTEXT.TYPE;
  #documentTypes = new UmbDocumentTypeDetailRepository(this);
  #documentTypeItems = new UmbDocumentTypeItemRepository(this);

  constructor() {
    super();

    this.consumeContext(UMB_DATA_TYPE_WORKSPACE_CONTEXT, async (context) => {
      this.#workspace = context;

      if (!context) return;

      // Observed rather than read once: the stored configuration arrives asynchronously, and the
      // content type can also change from under us when the editor re-picks.
      const value = await context.propertyValueByAlias<string>(KANBAN_LANE_CONTENT_TYPE_KEY);

      this.observe(value, (unique) => this.#loadContentTypeName(unique), '_kanbanLaneContentTypeKey');
    });
  }

  async #loadContentTypeName(unique?: string) {
    if (!unique) {
      this._contentTypeName = '';
      return;
    }

    // The item repository rather than the detail one: this only needs a name, and the name is all
    // an item carries. A deleted content type simply yields nothing, leaving the alias on its own.
    const { data } = await this.#documentTypeItems.requestItems([unique]);
    this._contentTypeName = data?.[0]?.name ?? '';
  }

  async #pick() {
    const contentType = await this.#pickContentType();
    if (!contentType) return;

    const picked = await umbOpenModal(this, UMB_ITEM_PICKER_MODAL, {
      data: {
        headline: `Select a property from ${contentType.name}`,
        items: toPropertyPickerItems(contentType.properties),
      },
    }).catch(() => undefined);

    if (!picked?.value) return;

    // Awaited before the change event: the sibling key and this element's own value are two writes
    // into the same configuration value list, and letting them overlap lets the second read the
    // list as it was before the first, dropping one of them.
    await this.#workspace?.setPropertyValue(KANBAN_LANE_CONTENT_TYPE_KEY, contentType.unique);

    this.value = picked.value;
    this.dispatchEvent(new UmbChangeEvent());
  }

  /**
   * Opens the document type tree, then reads the picked type in full — the tree hands back a
   * unique, and the property list only exists on the detail model.
   */
  async #pickContentType(): Promise<UmbDocumentTypeDetailModel | undefined> {
    const picked = await umbOpenModal(this, UMB_DOCUMENT_TYPE_PICKER_MODAL, {
      data: {
        hideTreeRoot: true,
        multiple: false,
        // An element type is never a document in its own right, so it can never be the content
        // type a board reads children of. Umbraco's own column picker filters it out identically.
        pickableFilter: (item) => (item as { isElement?: boolean }).isElement !== true,
      },
    }).catch(() => undefined);

    const unique = picked?.selection?.[0];
    if (!unique) return undefined;

    const { data } = await this.#documentTypes.requestByUnique(unique);

    return data ?? undefined;
  }

  async #clear() {
    await this.#workspace?.setPropertyValue(KANBAN_LANE_CONTENT_TYPE_KEY, undefined);

    this.value = '';
    this.dispatchEvent(new UmbChangeEvent());
  }

  override render() {
    if (!this.value) {
      return html`<uui-button look="placeholder" label="Choose" @click=${this.#pick}></uui-button>`;
    }

    return html`
      <uui-ref-node
        standalone
        name=${this.value}
        detail=${this._contentTypeName ? `from ${this._contentTypeName}` : ''}
        @open=${this.#pick}>
        <uui-icon slot="icon" name="icon-settings"></uui-icon>
        <uui-action-bar slot="actions">
          <uui-button label="Remove" @click=${this.#clear}>Remove</uui-button>
        </uui-action-bar>
      </uui-ref-node>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
      }
    `,
  ];
}

export { UmbCommunityKanbanLanePropertyElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-lane-property': UmbCommunityKanbanLanePropertyElement;
  }
}
