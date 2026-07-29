import { css, customElement, html, nothing, property, repeat } from '@umbraco-cms/backoffice/external/lit';
import type { PropertyValues } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbEntityContext } from '@umbraco-cms/backoffice/entity';
import '@umbraco-cms/backoffice/ufm';
import { cardStateTag } from './card.model.js';
import './kanban-card-children.element.js';
import type { KanbanCardModel, KanbanCardPropertyModel } from '../data/kanban-board.types.js';

/**
 * One card on a board. Read-only in this milestone: it reports its title being clicked and nothing
 * else — the host decides what "open this document" means.
 *
 * umb-icon, umb-value-summary-extension and umb-entity-actions-bundle are global elements
 * the backoffice shell registers, so they are used without import — reaching into
 * dist-cms to import them would be an unsupported dependency.
 */
@customElement('umb-community-kanban-card')
export class UmbCommunityKanbanCardElement extends UmbLitElement {
  @property({ attribute: false })
  card?: KanbanCardModel;

  /**
   * Whether this board lists a card's children. Board-wide state forwarded down, the way `readonly`
   * is — it is a property of the board's configuration, not of this card.
   */
  @property({ type: Boolean, attribute: 'show-child-items' })
  showChildItems = false;

  /**
   * The card owns the entity identity for its own subtree. `<umb-entity-actions-bundle>` reads
   * its entity from the ambient UMB_ENTITY_CONTEXT; its `entityType`/`unique` properties are
   * deprecated and removed in Umbraco 19, and relying on the fallback context they create means
   * relying on when the bundle happens to read them. Without this context the bundle would find
   * the host's ambient context — the PARENT document — and aim every action at the wrong entity.
   */
  #entityContext = new UmbEntityContext(this);

  constructor() {
    super();

    this.#entityContext.setEntityType('document');
  }

  override willUpdate(changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties);

    if (changedProperties.has('card')) {
      this.#entityContext.setUnique(this.card?.key ?? null);
    }
  }

  #onOpen() {
    if (!this.card) return;

    this.dispatchEvent(
      new CustomEvent('kanban-open-document', {
        detail: { key: this.card.key },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    if (!this.card) return nothing;

    const tag = cardStateTag(this.card.state);

    return html`
      <div class="card">
        <div class="header">
          ${this.card.icon ? html`<umb-icon name=${this.card.icon}></umb-icon>` : nothing}
          <button type="button" class="name" @click=${this.#onOpen}>${this.card.name}</button>
          <umb-entity-actions-bundle .label=${this.card.name}></umb-entity-actions-bundle>
        </div>
        ${this.card.properties.length
          ? html`<div class="properties">
              ${repeat(
                this.card.properties,
                (item) => item.alias,
                (item) => this.#renderProperty(item),
              )}
            </div>`
          : nothing}
        ${this.#renderChildren()}
        <div class="footer">
          <uui-tag color=${tag.color} look="secondary">${this.localize.term(tag.term)}</uui-tag>
        </div>
      </div>
    `;
  }

  #renderChildren() {
    if (!this.showChildItems || !this.card) return nothing;

    // Nothing to list and nothing to add: no section at all, rather than an empty rule across the card.
    if (this.card.children.length === 0 && this.card.canCreate === false) return nothing;

    return html`<umb-community-kanban-card-children .card=${this.card}></umb-community-kanban-card-children>`;
  }

  #renderProperty(item: KanbanCardPropertyModel) {
    return html`
      <div class="property">
        <span class="label">${item.name}</span>
        ${item.nameTemplate
          ? // The backoffice's own UFM renderer, and the same syntax a List View column template uses,
            // so a template copied from one behaves identically here.
            //
            // The value is wrapped in an object rather than passed raw, which is what core's own
            // document collection card and table column do. `umb-ufm-js-expression` builds its
            // evaluation scope by *spreading* this value — `{...model, ...filters}` — so a template
            // referring to `value` only resolves if the model has a `value` property. Passing the raw
            // value spread its characters instead, leaving `value` undefined and every template empty.
            html`<umb-ufm-render inline .markdown=${item.nameTemplate} .value=${{ value: item.value }}></umb-ufm-render>`
          : // No template: the summary extension is what makes a picker or a dropdown render sensibly
            // with no configuration at all, which is why both paths are kept.
            html`<umb-value-summary-extension
              .valueType=${item.editorAlias}
              .value=${item.value}></umb-value-summary-extension>`}
      </div>
    `;
  }

  static override styles = [
    css`
      .card {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-2);
        padding: var(--uui-size-space-3);
        background: var(--uui-color-surface);
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius);
      }

      .card:hover {
        border-color: var(--uui-color-border-emphasis);
      }

      .header {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
      }

      .name {
        flex: 1;
        font-weight: bold;
        overflow-wrap: anywhere;
        /* A real button, so it is keyboard-reachable without hand-rolled key handling — styled back
           down to the text it replaced. */
        appearance: none;
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        font: inherit;
        font-weight: bold;
        color: inherit;
        text-align: left;
        cursor: pointer;
      }

      .name:hover {
        text-decoration: underline;
      }

      .properties {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-1);
        font-size: var(--uui-type-small-size);
      }

      .property {
        display: flex;
        gap: var(--uui-size-space-2);
      }

      .label {
        color: var(--uui-color-text-alt);
      }
    `,
  ];
}

export { UmbCommunityKanbanCardElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-card': UmbCommunityKanbanCardElement;
  }
}
