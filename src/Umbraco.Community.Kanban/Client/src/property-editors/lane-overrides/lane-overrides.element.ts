import { html, css, customElement, property, state, repeat } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { UMB_ICON_PICKER_MODAL } from '@umbraco-cms/backoffice/icon';
import {
  KANBAN_LANE_PALETTE,
  mergeOverridesWithLanes,
  type KanbanLaneOverrideRow,
  type KanbanLaneOverrideValue,
  type KanbanResolvedLane,
} from './lane-override.model.js';

/**
 * Edits per-lane appearance overrides.
 *
 * Lanes come from the server rather than being typed by hand, so the editor
 * cannot mistype a lane value and silently lose the styling.
 */
@customElement('umb-community-kanban-lane-overrides')
export class UmbCommunityKanbanLaneOverridesElement extends UmbLitElement {
  @property({ type: Array })
  value: KanbanLaneOverrideValue[] = [];

  @state()
  private _rows: KanbanLaneOverrideRow[] = [];

  /**
   * Resolved lanes, set by the host once it has called POST /lanes/preview.
   * Kept as an input rather than fetched here so this element stays testable
   * and has no opinion about how the configuration is assembled.
   */
  @property({ type: Array, attribute: false })
  set lanes(lanes: KanbanResolvedLane[]) {
    this._lanes = lanes;
    this._rows = mergeOverridesWithLanes(lanes, this.value ?? []);
  }
  get lanes(): KanbanResolvedLane[] {
    return this._lanes;
  }
  private _lanes: KanbanResolvedLane[] = [];

  /**
   * Writes one field of one lane's override, dropping the override entirely once
   * every field is empty so an untouched lane leaves no residue in the stored value.
   */
  #onFieldChange(row: KanbanLaneOverrideRow, field: 'colour' | 'icon' | 'label', fieldValue: string) {
    const rest = (this.value ?? []).filter((o) => o.value.toLowerCase() !== row.value.toLowerCase());
    const updated: KanbanLaneOverrideValue = {
      ...row.override,
      value: row.value,
      [field]: fieldValue || undefined,
    };

    const isEmpty = !updated.colour && !updated.icon && !updated.label;
    const next = isEmpty ? rest : [...rest, updated];

    this.value = next;
    this._rows = mergeOverridesWithLanes(this._lanes, next);
    this.dispatchEvent(new UmbChangeEvent());
  }

  /**
   * Opens Umbraco's own icon picker. The modal returns a colour too, which is ignored —
   * lane colour is chosen by the swatches beside this button, so honouring both would
   * give one lane two competing colours.
   */
  async #pickIcon(row: KanbanLaneOverrideRow) {
    const result = await umbOpenModal(this, UMB_ICON_PICKER_MODAL, {
      value: { icon: row.override?.icon ?? '', color: '' },
      data: { showEmptyOption: true, hideColors: true },
    }).catch(() => undefined);

    if (result === undefined) return;

    this.#onFieldChange(row, 'icon', (result.icon as string) ?? '');
  }

  override render() {
    if (this._rows.length === 0) {
      return html`<uui-box>
        <p>Choose a lane property first, then lanes will appear here.</p>
      </uui-box>`;
    }

    return html`${repeat(
      this._rows,
      (row) => row.value,
      (row) => this.#renderRow(row),
    )}`;
  }

  #renderRow(row: KanbanLaneOverrideRow) {
    return html`
      <div class="row" ?data-orphaned=${row.orphaned}>
        <span class="name">
          ${row.name}
          ${row.orphaned
            ? html`<uui-tag color="warning" look="secondary">no longer resolves</uui-tag>`
            : ''}
        </span>
        <uui-input
          label="Label"
          placeholder=${row.name}
          .value=${row.override?.label ?? ''}
          @change=${(e: Event) =>
            this.#onFieldChange(row, 'label', (e.target as HTMLInputElement).value)}></uui-input>
        <uui-button
          compact
          look="outline"
          label="Choose icon"
          @click=${() => this.#pickIcon(row)}>
          ${row.override?.icon
            ? html`<uui-icon name=${row.override.icon}></uui-icon>`
            : html`<uui-icon name="icon-add" style="opacity:.35"></uui-icon>`}
        </uui-button>
        <uui-color-swatches
          .value=${row.override?.colour ?? ''}
          @change=${(e: Event) =>
            this.#onFieldChange(row, 'colour', (e.target as HTMLInputElement).value)}>
          ${KANBAN_LANE_PALETTE.map(
            (colour) => html`<uui-color-swatch label=${colour} value=${colour}></uui-color-swatch>`,
          )}
        </uui-color-swatches>
      </div>
    `;
  }

  static override styles = [
    css`
      .row {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-4);
        padding: var(--uui-size-space-2) 0;
        border-bottom: 1px solid var(--uui-color-divider);
      }
      .row[data-orphaned] .name {
        color: var(--uui-color-warning-emphasis);
      }
      .name {
        flex: 1;
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
      }
    `,
  ];
}

export { UmbCommunityKanbanLaneOverridesElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-lane-overrides': UmbCommunityKanbanLaneOverridesElement;
  }
}
