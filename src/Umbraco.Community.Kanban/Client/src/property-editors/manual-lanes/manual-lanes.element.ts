import { html, css, customElement, property, repeat } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';
import { KANBAN_LANE_PALETTE } from '../lane-overrides/lane-override.model.js';
import {
  addLane,
  moveLane,
  removeLaneAt,
  type KanbanManualLaneValue,
} from './manual-lane.model.js';

/**
 * Edits hand-defined lanes, used when the board's lane source is "manual".
 */
@customElement('umb-community-kanban-manual-lanes')
export class UmbCommunityKanbanManualLanesElement extends UmbLitElement {
  @property({ type: Array })
  value: KanbanManualLaneValue[] = [];

  #commit(next: KanbanManualLaneValue[]) {
    this.value = next;
    this.dispatchEvent(new UmbChangeEvent());
  }

  #onFieldChange(index: number, field: keyof KanbanManualLaneValue, fieldValue: string) {
    const next = this.value.map((lane, i) =>
      i === index ? { ...lane, [field]: fieldValue || undefined } : lane,
    );

    // `value` is required, so keep it a string rather than letting it go undefined.
    next[index] = { ...next[index], value: next[index].value ?? '' };

    this.#commit(next);
  }

  override render() {
    return html`
      ${repeat(
        this.value ?? [],
        (_, index) => index,
        (lane, index) => this.#renderRow(lane, index),
      )}
      <uui-button
        look="placeholder"
        label="Add lane"
        @click=${() => this.#commit(addLane(this.value ?? []))}></uui-button>
    `;
  }

  #renderRow(lane: KanbanManualLaneValue, index: number) {
    return html`
      <div class="row">
        <uui-input
          label="Value"
          placeholder="Stored value"
          .value=${lane.value ?? ''}
          @change=${(e: Event) =>
            this.#onFieldChange(index, 'value', (e.target as HTMLInputElement).value)}></uui-input>
        <uui-input
          label="Label"
          placeholder=${lane.value || 'Lane header'}
          .value=${lane.label ?? ''}
          @change=${(e: Event) =>
            this.#onFieldChange(index, 'label', (e.target as HTMLInputElement).value)}></uui-input>
        <uui-color-swatches
          .value=${lane.colour ?? ''}
          @change=${(e: Event) =>
            this.#onFieldChange(index, 'colour', (e.target as HTMLInputElement).value)}>
          ${KANBAN_LANE_PALETTE.map(
            (colour) => html`<uui-color-swatch label=${colour} value=${colour}></uui-color-swatch>`,
          )}
        </uui-color-swatches>
        <uui-button
          compact
          look="outline"
          label="Move up"
          ?disabled=${index === 0}
          @click=${() => this.#commit(moveLane(this.value, index, index - 1))}>↑</uui-button>
        <uui-button
          compact
          look="outline"
          label="Move down"
          ?disabled=${index === this.value.length - 1}
          @click=${() => this.#commit(moveLane(this.value, index, index + 1))}>↓</uui-button>
        <uui-button
          compact
          look="outline"
          color="danger"
          label="Remove"
          @click=${() => this.#commit(removeLaneAt(this.value, index))}>✕</uui-button>
      </div>
    `;
  }

  static override styles = [
    css`
      .row {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-3);
        padding: var(--uui-size-space-2) 0;
        border-bottom: 1px solid var(--uui-color-divider);
      }
    `,
  ];
}

export { UmbCommunityKanbanManualLanesElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-manual-lanes': UmbCommunityKanbanManualLanesElement;
  }
}
