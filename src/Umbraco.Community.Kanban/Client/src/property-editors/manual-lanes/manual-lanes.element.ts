import { html, css, customElement, property, repeat } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { UMB_ICON_PICKER_MODAL } from '@umbraco-cms/backoffice/icon';
import '@/core/lane-colour/lane-colour.element.js';
import type { UmbCommunityKanbanLaneColourElement } from '@/core/lane-colour/lane-colour.element.js';
import { kanbanSettingsRowStyles } from '../settings-row.styles.js';
import {
  addLane,
  moveLane,
  removeLaneAt,
  type KanbanManualLaneValue,
} from './manual-lane.model.js';

/**
 * Edits hand-defined lanes, used when the board's group source is "manual". Shares its row shell
 * with the lane appearance editor (see `settings-row.styles.ts`) so the two read as one control.
 *
 * Reordering is by button rather than by drag, unlike the appearance editor. A sorter needs a stable
 * unique per row, and these rows have none to offer: their identity is the value being typed, which
 * is blank on a new row and briefly duplicated while an editor edits one. Order matters here — it
 * decides which palette colour each uncoloured lane gets — so it takes the mechanism that cannot
 * mis-key rather than the prettier one.
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

  /**
   * Umbraco's own icon picker, opened exactly as the appearance editor opens it: the colour the modal
   * also returns is ignored, because the swatches beside this button own the lane's colour and
   * honouring both would give one lane two competing colours.
   */
  async #pickIcon(lane: KanbanManualLaneValue, index: number) {
    const result = await umbOpenModal(this, UMB_ICON_PICKER_MODAL, {
      value: { icon: lane.icon ?? '', color: '' },
      data: { showEmptyOption: true, hideColors: true },
    }).catch(() => undefined);

    if (result === undefined) return;

    this.#onFieldChange(index, 'icon', (result.icon as string) ?? '');
  }

  override render() {
    return html`
      ${repeat(
        this.value ?? [],
        (_, index) => index,
        (lane, index) => this.#renderRow(lane, index),
      )}
      <uui-button
        id="btn-add"
        look="placeholder"
        label="Add lane"
        @click=${() => this.#commit(addLane(this.value ?? []))}></uui-button>
    `;
  }

  #renderRow(lane: KanbanManualLaneValue, index: number) {
    return html`
      <div class="row">
        <uui-input
          class="identity"
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
        <uui-button compact look="outline" label="Choose icon" @click=${() => this.#pickIcon(lane, index)}>
          ${lane.icon
            ? html`<uui-icon name=${lane.icon}></uui-icon>`
            : html`<uui-icon name="icon-add" style="opacity:.35"></uui-icon>`}
        </uui-button>
        <umb-community-kanban-lane-colour
          .value=${lane.colour ?? ''}
          label=${`Colour for ${lane.label || lane.value || 'this lane'}`}
          @change=${(e: Event) =>
            this.#onFieldChange(
              index,
              'colour',
              (e.target as UmbCommunityKanbanLaneColourElement).value,
            )}></umb-community-kanban-lane-colour>
        <div class="actions">
          <uui-button
            compact
            look="outline"
            label="Move up"
            ?disabled=${index === 0}
            @click=${() => this.#commit(moveLane(this.value, index, index - 1))}>
            <uui-icon name="icon-arrow-up"></uui-icon>
          </uui-button>
          <uui-button
            compact
            look="outline"
            label="Move down"
            ?disabled=${index === this.value.length - 1}
            @click=${() => this.#commit(moveLane(this.value, index, index + 1))}>
            <uui-icon name="icon-arrow-down"></uui-icon>
          </uui-button>
          <uui-button
            compact
            look="outline"
            color="danger"
            label="Remove"
            @click=${() => this.#commit(removeLaneAt(this.value, index))}>
            <uui-icon name="icon-trash"></uui-icon>
          </uui-button>
        </div>
      </div>
    `;
  }

  static override styles = [
    kanbanSettingsRowStyles,
    css`
      /* Full width, matching how core's own pickers render their placeholder button. */
      #btn-add {
        display: block;
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
