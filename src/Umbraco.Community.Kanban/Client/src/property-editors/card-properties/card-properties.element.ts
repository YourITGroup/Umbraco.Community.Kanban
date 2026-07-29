import { css, customElement, html, property, repeat } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import { UmbSorterController } from '@umbraco-cms/backoffice/sorter';
import { pickContentTypeProperty } from '../content-type-property/content-type-property.picker.js';
import {
  addCardProperty,
  readCardProperties,
  removeCardPropertyAt,
  setCardPropertyField,
  type KanbanCardPropertyValue,
} from './card-property.model.js';

/**
 * Chooses the properties shown as summary items on each card, and how each is labelled and formatted.
 *
 * Deliberately the same control as Umbraco's List View column configuration — a drag handle, an
 * editable header, the alias, a label template, and a Remove — because a card row and a list column
 * are the same decision. Reordering uses `UmbSorterController`, the helper core's own column
 * configuration uses.
 *
 * The content type is asked for on every add rather than remembered: a board's cards can be of more
 * than one type, so the previous answer is not necessarily the next one. Umbraco's own column
 * configuration asks every time for the same reason.
 */
@customElement('umb-community-kanban-card-properties')
export class UmbCommunityKanbanCardPropertiesElement extends UmbLitElement {
  /**
   * Read through `readCardProperties` because a board configured before this control stored a bare
   * array of aliases. The old shape is read, never written back.
   */
  @property({ type: Array })
  set value(value: KanbanCardPropertyValue[]) {
    this.#value = readCardProperties(value);
    this.#sorter.setModel(this.#value);
  }
  get value(): KanbanCardPropertyValue[] {
    return this.#value;
  }
  #value: KanbanCardPropertyValue[] = [];

  #sorter = new UmbSorterController<KanbanCardPropertyValue, HTMLElement>(this, {
    // A data attribute rather than `id`, which is what core's column editor uses: an alias is usually
    // id-safe, but a system field or a hand-edited configuration need not be.
    getUniqueOfElement: (element) => element.dataset.propertyAlias,
    getUniqueOfModel: (property) => property.alias,
    identifier: 'Umb.Community.Kanban.CardProperties',
    itemSelector: '.row',
    containerSelector: '#property-wrapper',
    handleSelector: '.drag-handle',
    onChange: ({ model }) => this.#commit(model),
  });

  #commit(next: KanbanCardPropertyValue[]) {
    this.value = next;
    this.dispatchEvent(new UmbChangeEvent());
  }

  async #add() {
    // Card properties can be document fields — created date, last edited — which lane properties
    // cannot, having no data type behind them to resolve lanes from.
    const picked = await pickContentTypeProperty(this, { includeSystemProperties: true });
    if (!picked) return;

    this.#commit(
      addCardProperty(this.value ?? [], {
        alias: picked.alias,
        header: picked.label,
        isSystem: picked.isSystem ? 1 : 0,
      }),
    );
  }

  async #remove(index: number) {
    const property = this.value[index];

    // Confirmed as core's column configuration does, because a removed row takes its header and
    // label template with it.
    await umbConfirmModal(this, {
      color: 'danger',
      headline: 'Remove?',
      content: `Remove ${property?.header || property?.alias} from every card?`,
      confirmLabel: 'Remove',
    }).catch(() => undefined);

    if (this.value[index] !== property) return;

    this.#commit(removeCardPropertyAt(this.value, index));
  }

  #setField(alias: string, field: 'header' | 'nameTemplate', value: string) {
    this.#commit(setCardPropertyField(this.value, alias, field, value));
  }

  override render() {
    return html`
      <div id="property-wrapper">
        ${repeat(
          this.value ?? [],
          (property) => property.alias,
          (property, index) => this.#renderRow(property, index),
        )}
      </div>
      <uui-button look="placeholder" label="Choose" @click=${this.#add}>Choose</uui-button>
    `;
  }

  #renderRow(property: KanbanCardPropertyValue, index: number) {
    return html`
      <div class="row" data-property-alias=${property.alias}>
        <uui-icon class="drag-handle" name="icon-grip" title="Drag to reorder"></uui-icon>
        <uui-input
          label="Label"
          placeholder="Enter a label..."
          .value=${property.header ?? ''}
          @change=${(e: Event) =>
            this.#setField(property.alias, 'header', (e.target as HTMLInputElement).value)}></uui-input>
        <div class="alias"><code>${property.alias}</code></div>
        <uui-input
          label="Label template"
          placeholder="Enter a label template..."
          .value=${property.nameTemplate ?? ''}
          @change=${(e: Event) =>
            this.#setField(property.alias, 'nameTemplate', (e.target as HTMLInputElement).value)}></uui-input>
        <uui-button compact look="secondary" label="Remove" @click=${() => this.#remove(index)}>
          Remove
        </uui-button>
      </div>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
      }

      #property-wrapper {
        display: flex;
        flex-direction: column;
        gap: 1px;
        margin-bottom: var(--uui-size-1);
      }

      .row {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-4);
        padding: var(--uui-size-space-2) var(--uui-size-space-3);
        background: var(--uui-color-surface-alt);
      }

      .drag-handle {
        cursor: grab;
        color: var(--uui-color-text-alt);
      }

      uui-input {
        flex: 1;
      }

      .alias {
        flex: 1;
        word-break: break-all;
      }

      /* Full width, as core's own placeholder buttons are. */
      uui-button[look='placeholder'] {
        display: block;
        width: 100%;
      }
    `,
  ];
}

export { UmbCommunityKanbanCardPropertiesElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-card-properties': UmbCommunityKanbanCardPropertiesElement;
  }
}
