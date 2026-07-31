import { css, customElement, html, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';
import { UmbDocumentTypeItemRepository } from '@umbraco-cms/backoffice/document-type';
import { UMB_DATA_TYPE_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/data-type';
import type { UmbPropertyEditorConfigCollection } from '@umbraco-cms/backoffice/property-editor';
import { KANBAN_LANE_CONTENT_TYPE_KEY } from '@/constants.js';
import { pickContentTypeProperty } from '../content-type-property/content-type-property.picker.js';

/**
 * Picks a content type property by browsing to it: choose a document type, then choose one of its
 * properties. The same sequence Umbraco itself uses to add a column to a Collection, so an editor
 * cannot mistype an alias that resolves to nothing. The board's lane property, and the calendar's
 * date, end-date and category properties, all pick through this one editor.
 *
 * The stored value is only the property alias, because everything resolves against the content
 * type of whatever document is being viewed, not the one browsed here. The content type browsed to
 * is *optionally* written alongside it under a sibling key — the board's lane property and the
 * calendar's category property need it so their preview-driven editors can resolve real values,
 * having no document of their own. Which key comes from the setting's `contentTypeKeyAlias`
 * config; unset keeps the board's historic `laneContentTypeKey`, the empty string writes none.
 */
@customElement('umb-community-kanban-lane-property')
export class UmbCommunityKanbanLanePropertyElement extends UmbLitElement {
  @property({ type: String })
  value = '';

  /** Per-usage settings config; see the class comment. */
  @property({ attribute: false })
  set config(config: UmbPropertyEditorConfigCollection | undefined) {
    const configured = config?.getValueByAlias<string>('contentTypeKeyAlias');

    this.#contentTypeKeyAlias = configured === undefined ? KANBAN_LANE_CONTENT_TYPE_KEY : configured;
    this.#observeContentTypeKey();
  }

  /** The name of the content type the property was picked from, for display only. */
  @state()
  private _contentTypeName = '';

  /** That content type's own icon, so the ref row is badged like every other picker's row. */
  @state()
  private _contentTypeIcon = '';

  #contentTypeKeyAlias: string = KANBAN_LANE_CONTENT_TYPE_KEY;

  #workspace?: typeof UMB_DATA_TYPE_WORKSPACE_CONTEXT.TYPE;
  #documentTypeItems = new UmbDocumentTypeItemRepository(this);

  constructor() {
    super();

    this.consumeContext(UMB_DATA_TYPE_WORKSPACE_CONTEXT, (context) => {
      this.#workspace = context;
      this.#observeContentTypeKey();
    });
  }

  /**
   * (Re)observes the sibling key. Called from both the context callback and the config setter
   * because they arrive in no guaranteed order; the alias-scoped observer key makes re-runs
   * replace rather than stack.
   */
  async #observeContentTypeKey() {
    if (!this.#workspace || !this.#contentTypeKeyAlias) return;

    // Observed rather than read once: the stored configuration arrives asynchronously, and the
    // content type can also change from under us when the editor re-picks.
    const value = await this.#workspace.propertyValueByAlias<string>(this.#contentTypeKeyAlias);

    this.observe(value, (unique) => this.#loadContentTypeName(unique), '_kanbanPickerContentTypeKey');
  }

  async #loadContentTypeName(unique?: string) {
    if (!unique) {
      this._contentTypeName = '';
      this._contentTypeIcon = '';
      return;
    }

    // The item repository rather than the detail one: this needs only a name and an icon, which is
    // what an item carries. A deleted content type simply yields nothing, leaving the alias on its own.
    const { data } = await this.#documentTypeItems.requestItems([unique]);
    this._contentTypeName = data?.[0]?.name ?? '';
    this._contentTypeIcon = data?.[0]?.icon ?? '';
  }

  async #pick() {
    const picked = await pickContentTypeProperty(this);
    if (!picked) return;

    // Awaited before the change event: the sibling key and this element's own value are two writes
    // into the same configuration value list, and letting them overlap lets the second read the
    // list as it was before the first, dropping one of them.
    if (this.#contentTypeKeyAlias) {
      await this.#workspace?.setPropertyValue(this.#contentTypeKeyAlias, picked.contentTypeUnique);
    }

    this.value = picked.alias;
    this.dispatchEvent(new UmbChangeEvent());
  }

  async #clear() {
    if (this.#contentTypeKeyAlias) {
      await this.#workspace?.setPropertyValue(this.#contentTypeKeyAlias, undefined);
    }

    this.value = '';
    this.dispatchEvent(new UmbChangeEvent());
  }

  /**
   * Structured the way core's own pickers are (compare `umb-input-document`): the chosen item is a
   * ref node inside a `uui-ref-list`, its action a bare labelled button in a `uui-action-bar`, and
   * the empty state a full-width placeholder button. The differences that remain are deliberate —
   * there is only ever one value, so the ref node is always `standalone` and the placeholder button
   * disappears once something is picked, and the row opens the picker again rather than navigating
   * to the picked thing, because a property alias has nowhere to navigate to.
   */
  override render() {
    if (!this.value) {
      return html`<uui-button
        id="btn-add"
        look="placeholder"
        label="Choose"
        @click=${this.#pick}></uui-button>`;
    }

    return html`
      <uui-ref-list>
        <uui-ref-node
          standalone
          name=${this.value}
          detail=${this._contentTypeName ? `from ${this._contentTypeName}` : ''}
          @open=${this.#pick}>
          <uui-icon slot="icon" name=${this._contentTypeIcon || 'icon-document'}></uui-icon>
          <uui-action-bar slot="actions">
            <uui-button label="Remove" @click=${this.#clear}></uui-button>
          </uui-action-bar>
        </uui-ref-node>
      </uui-ref-list>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
      }

      #btn-add {
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
