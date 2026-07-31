import { css, customElement, html, property, repeat } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import '@umbraco-cms/backoffice/ufm';
import type { KanbanCardPropertyModel } from '../data/kanban-board.types.js';

/**
 * The configured summary properties of one card, rendered exactly as the board card renders its
 * own — the same UFM-template-or-value-summary rule — so a property reads identically wherever a
 * card appears. Stacked rows by default; `wrap` lays the properties out inline with wrapping, for
 * hosts where vertical space is the scarce dimension (the week grid's timed blocks).
 *
 * umb-value-summary-extension is a global element the backoffice shell registers, so it is used
 * without import — reaching into dist-cms to import it would be an unsupported dependency.
 */
@customElement('umb-community-kanban-card-property-list')
export class UmbCommunityKanbanCardPropertyListElement extends UmbLitElement {
  @property({ attribute: false })
  properties: KanbanCardPropertyModel[] = [];

  @property({ type: Boolean, reflect: true })
  wrap = false;

  #renderProperty(item: KanbanCardPropertyModel) {
    return html`
      <div class="property">
        <span class="label">${item.name}</span>
        ${item.nameTemplate
          ? // The backoffice's own UFM renderer. The value is wrapped in an object rather than
            // passed raw because `umb-ufm-js-expression` *spreads* it to build its evaluation
            // scope — a raw value spreads its characters and leaves `value` undefined.
            html`<umb-ufm-render inline .markdown=${item.nameTemplate} .value=${{ value: item.value }}></umb-ufm-render>`
          : // No template: the summary extension is what makes a picker or a dropdown render
            // sensibly with no configuration at all.
            html`<umb-value-summary-extension
              .valueType=${item.editorAlias}
              .value=${item.value}></umb-value-summary-extension>`}
      </div>
    `;
  }

  override render() {
    return html`${repeat(
      this.properties,
      (item) => item.alias,
      (item) => this.#renderProperty(item),
    )}`;
  }

  static override styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-1);
        font-size: var(--uui-type-small-size);
      }

      :host([wrap]) {
        flex-direction: row;
        flex-wrap: wrap;
        column-gap: var(--uui-size-space-3);
      }

      .property {
        display: flex;
        gap: var(--uui-size-space-2);
        min-width: 0;
      }

      .label {
        color: var(--uui-color-text-alt);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-card-property-list': UmbCommunityKanbanCardPropertyListElement;
  }
}
