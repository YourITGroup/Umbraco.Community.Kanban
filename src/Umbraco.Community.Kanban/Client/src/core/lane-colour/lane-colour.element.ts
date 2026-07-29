import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';
import '@umbraco-cms/backoffice/components';
import type { UmbInputEyeDropperElement } from '@umbraco-cms/backoffice/components';
import { KANBAN_LANE_SWATCHES } from './lane-colour.model.js';

/**
 * Picks a lane colour: one of the board palette's colours, any other colour, or — on Chromium — one
 * taken off the screen with the eye dropper.
 *
 * Built on the backoffice's own `umb-input-eye-dropper` rather than UUI's picker directly. It is the
 * control Umbraco's own eye dropper property editor uses, and it already carries the workaround for
 * `uui-color-picker` having no way to hide its swatches. UUI renders the dropper button itself behind
 * an `'EyeDropper' in window` check, so Firefox and Safari get the rest of the picker without it and
 * nothing here needs to know the difference.
 *
 * Shared by the lane appearance and manual lanes editors, which both choose the same kind of value.
 * It knows nothing about lanes, overrides or configuration — it takes a colour and reports a colour —
 * which is what makes it shareable rather than merely duplicated.
 */
@customElement('umb-community-kanban-lane-colour')
export class UmbCommunityKanbanLaneColourElement extends UmbLitElement {
  /**
   * A hex colour for anything picked here. May also be an Umbraco colour alias for a value stored
   * before this control existed: the picker cannot show one, but it must not destroy one either, so
   * an alias reaches the picker as an empty value and survives until the editor picks something.
   */
  @property({ type: String })
  value = '';

  @property({ type: String })
  label = 'Colour';

  get #pickerValue(): string {
    return this.value.startsWith('#') ? this.value : '';
  }

  #onChange(event: Event) {
    event.stopPropagation();

    const picked = (event.target as UmbInputEyeDropperElement).value ?? '';

    if (picked === this.value) return;

    this.value = picked;
    this.dispatchEvent(new UmbChangeEvent());
  }

  /**
   * Clearing is an explicit action because a picker has no "deselect" the way a swatch row did.
   * Without it a lane could be coloured but never returned to the board's palette cycle.
   */
  #onClear() {
    if (!this.value) return;

    this.value = '';
    this.dispatchEvent(new UmbChangeEvent());
  }

  override render() {
    return html`
      <umb-input-eye-dropper
        .showPalette=${true}
        .swatches=${[...KANBAN_LANE_SWATCHES]}
        .value=${this.#pickerValue}
        label=${this.label}
        @change=${this.#onChange}></umb-input-eye-dropper>
      ${this.value
        ? html`<uui-button
            compact
            look="secondary"
            label="Clear colour"
            title="Clear colour"
            @click=${this.#onClear}>
            <uui-icon name="icon-trash"></uui-icon>
          </uui-button>`
        : nothing}
    `;
  }

  static override styles = [
    css`
      :host {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
      }
    `,
  ];
}

export { UmbCommunityKanbanLaneColourElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-lane-colour': UmbCommunityKanbanLaneColourElement;
  }
}
