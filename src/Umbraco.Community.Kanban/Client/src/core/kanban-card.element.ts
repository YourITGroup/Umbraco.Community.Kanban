import { css, customElement, html, nothing, property, repeat } from '@umbraco-cms/backoffice/external/lit';
import type { PropertyValues } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbEntityContext } from '@umbraco-cms/backoffice/entity';
import { cardStateTag } from './card.model.js';
import type { KanbanCardModel, KanbanCardPropertyModel } from '../data/kanban-board.types.js';

/**
 * One card on a board. Read-only in this milestone: it reports a click and nothing else.
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

  #onClick() {
    if (!this.card) return;

    this.dispatchEvent(
      new CustomEvent('kanban-card-clicked', {
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
      <div class="card" role="button" tabindex="0" @click=${this.#onClick}>
        <div class="header">
          ${this.card.icon ? html`<umb-icon name=${this.card.icon}></umb-icon>` : nothing}
          <span class="name">${this.card.name}</span>
          <umb-entity-actions-bundle
            .label=${this.card.name}
            @click=${(event: Event) => event.stopPropagation()}>
          </umb-entity-actions-bundle>
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
        <div class="footer">
          <uui-tag color=${tag.color} look="secondary">${this.localize.term(tag.term)}</uui-tag>
        </div>
      </div>
    `;
  }

  #renderProperty(item: KanbanCardPropertyModel) {
    return html`
      <div class="property">
        <span class="label">${item.name}</span>
        <umb-value-summary-extension .valueType=${item.editorAlias} .value=${item.value}></umb-value-summary-extension>
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
        cursor: pointer;
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
