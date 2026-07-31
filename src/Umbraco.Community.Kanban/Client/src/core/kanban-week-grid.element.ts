import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { KanbanCalendarItemModel } from '../data/kanban-calendar.types.js';
import { blockGeometry, layoutSpans, toDaySpan } from './overlap.model.js';
import type { KanbanCategoryAppearance } from './kanban-month-grid.element.js';
import './kanban-card-property-list.element.js';

const HOUR_HEIGHT_REM = 3;

/**
 * The time-gridded week: an all-day strip above 24 hour rows × 7 day columns, blocks positioned
 * and sized by span, overlapping blocks sharing a day's width per the overlap model — category
 * orders the columns. Presentational, like the month grid: block clicks dispatch
 * `kanban-open-document`, empty hour-cell clicks dispatch `kanban-create-at` with date + hour.
 */
@customElement('umb-community-kanban-week-grid')
export class UmbCommunityKanbanWeekGridElement extends UmbLitElement {
  /** The 7 dates of the visible week, in order. */
  @property({ attribute: false })
  days: string[] = [];

  @property({ attribute: false })
  itemsByDay: Map<string, KanbanCalendarItemModel[]> = new Map();

  @property({ attribute: false })
  appearanceFor: (category: string | null | undefined) => KanbanCategoryAppearance = () => ({});

  /** True disables empty-cell creation (system date properties cannot be preset). */
  @property({ type: Boolean, attribute: 'disable-create' })
  disableCreate = false;

  #onBlockClick(event: Event, item: KanbanCalendarItemModel) {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('kanban-open-document', { detail: { key: item.card.key }, bubbles: true, composed: true }),
    );
  }

  #onHourClick(date: string, hour: number) {
    if (this.disableCreate) return;

    this.dispatchEvent(
      new CustomEvent('kanban-create-at', {
        detail: { date, time: `${hour.toString().padStart(2, '0')}:00` },
        bubbles: true,
        composed: true,
      }),
    );
  }

  #renderAllDay(date: string) {
    const allDay = (this.itemsByDay.get(date) ?? []).filter((item) => !item.time);

    return html`
      <div class="allday-cell">
        ${allDay.map((item) => {
          const appearance = this.appearanceFor(item.category);

          return html`
            <button
              class="chip"
              style=${appearance.colour ? `border-inline-start-color: ${appearance.colour}` : ''}
              title=${item.card.name}
              @click=${(event: Event) => this.#onBlockClick(event, item)}>
              <div class="chip-header">
                <umb-icon .name=${item.card.icon ?? 'icon-document'}></umb-icon>
                <span class="chip-name">${item.card.name}</span>
              </div>
              ${item.card.properties.length
                ? html`<umb-community-kanban-card-property-list
                    wrap
                    .properties=${item.card.properties}></umb-community-kanban-card-property-list>`
                : nothing}
            </button>
          `;
        })}
      </div>
    `;
  }

  #renderDayColumn(date: string) {
    const spans = (this.itemsByDay.get(date) ?? [])
      .map((item) => toDaySpan(item, date))
      .filter((span): span is NonNullable<typeof span> => span !== null);
    const laid = layoutSpans(spans);

    return html`
      <div class="day-column">
        ${Array.from({ length: 24 }, (_, hour) => {
          return html`<div class="hour-cell" @click=${() => this.#onHourClick(date, hour)}></div>`;
        })}
        ${laid.map((entry) => {
          const geometry = blockGeometry(entry);
          const width = 100 / entry.columns;
          const appearance = this.appearanceFor(entry.category);

          return html`
            <button
              class="block"
              style="top: ${geometry.topPct}%; height: ${geometry.heightPct}%; left: ${entry.column * width}%; width: ${width}%; ${appearance.colour
                ? `border-inline-start-color: ${appearance.colour};`
                : ''}"
              title=${entry.item.card.name}
              @click=${(event: Event) => this.#onBlockClick(event, entry.item)}>
              <div class="block-header">
                <span class="block-time">${entry.item.time}</span>
                <umb-icon .name=${entry.item.card.icon ?? 'icon-document'}></umb-icon>
                <span class="chip-name">${entry.item.card.name}</span>
                ${appearance.icon ? html`<umb-icon .name=${appearance.icon}></umb-icon>` : nothing}
              </div>
              ${entry.item.card.properties.length
                ? html`<umb-community-kanban-card-property-list
                    wrap
                    .properties=${entry.item.card.properties}></umb-community-kanban-card-property-list>`
                : nothing}
            </button>
          `;
        })}
      </div>
    `;
  }

  override render() {
    return html`
      <div class="head">
        <div class="header-row">
          <div class="gutter"></div>
          ${this.days.map((date) => html`<div class="day-heading">${dayHeading(date)}</div>`)}
        </div>
        <div class="allday-row">
          <div class="gutter allday-label">all-day</div>
          ${this.days.map((date) => this.#renderAllDay(date))}
        </div>
      </div>
      <div class="body">
        <div class="gutter hours">
          ${Array.from({ length: 24 }, (_, hour) => html`<div class="hour-label">${hour}:00</div>`)}
        </div>
        ${this.days.map((date) => this.#renderDayColumn(date))}
      </div>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius);
        /*
         * clip, not hidden: both clip the rounded corners identically, but hidden makes this a scroll
         * container, and a scroll container is what a sticky element sticks to — the day headings
         * would then be stuck to a box that never scrolls, which looks exactly like doing nothing.
         * clip creates no scroll container, so the headings stick to the page instead.
         */
        overflow: clip;
      }

      /*
       * Both heading rows travel together, so the hour grid scrolls under the whole thing. Wrapping
       * them in one sticky box rather than sticking each row is what avoids hard-coding the header
       * row's height as the all-day row's offset.
       */
      .head {
        position: sticky;
        /* Below the calendar's sticky toolbar, whose measured height arrives in this property. */
        top: var(--kanban-calendar-sticky-top, 0px);
        z-index: 2;
        background: var(--uui-color-surface);
      }

      .header-row,
      .allday-row,
      .body {
        display: grid;
        grid-template-columns: 4rem repeat(7, 1fr);
      }

      .day-heading {
        padding: var(--uui-size-space-2);
        font-weight: 600;
        font-size: var(--uui-type-small-size);
        text-align: center;
        border-bottom: 1px solid var(--uui-color-border);
        border-left: 1px solid var(--uui-color-border);
      }

      .allday-row {
        border-bottom: 1px solid var(--uui-color-border);
      }

      .allday-label {
        font-size: var(--uui-type-small-size);
        color: var(--uui-color-text-alt);
        padding: var(--uui-size-space-2);
        text-align: end;
      }

      .allday-cell {
        border-left: 1px solid var(--uui-color-border);
        padding: 2px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-height: 1.5rem;
      }

      .body {
        position: relative;
      }

      .hours .hour-label {
        height: ${HOUR_HEIGHT_REM}rem;
        font-size: var(--uui-type-small-size);
        color: var(--uui-color-text-alt);
        text-align: end;
        padding-inline-end: var(--uui-size-space-2);
        transform: translateY(-0.6em);
      }

      .day-column {
        position: relative;
        border-left: 1px solid var(--uui-color-border);
      }

      .hour-cell {
        height: ${HOUR_HEIGHT_REM}rem;
        border-bottom: 1px solid var(--uui-color-border-standalone, var(--uui-color-divider));
        cursor: pointer;
      }

      .hour-cell:hover {
        background: var(--uui-color-surface-alt);
      }

      .block {
        position: absolute;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 2px;
        overflow: hidden;
        border: 1px solid var(--uui-color-border);
        border-inline-start: 3px solid var(--uui-color-interactive);
        border-radius: var(--uui-border-radius);
        background: var(--uui-color-surface);
        font: inherit;
        font-size: var(--uui-type-small-size);
        padding: 1px var(--uui-size-space-1);
        cursor: pointer;
        text-align: start;
        box-sizing: border-box;
      }

      .block:hover {
        background: var(--uui-color-surface-emphasis);
        z-index: 1;
      }

      .block-header,
      .chip-header {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-1);
        min-width: 0;
      }

      .block-header umb-icon,
      .chip-header umb-icon {
        flex: none;
      }

      .block-time {
        flex: none;
        color: var(--uui-color-text-alt);
      }

      .chip {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 2px;
        /* border first, then the inline-start accent: the category colour overrides that edge. */
        border: 1px solid var(--uui-color-border);
        border-inline-start: 3px solid transparent;
        border-radius: var(--uui-border-radius);
        background: var(--uui-color-surface);
        padding: 1px var(--uui-size-space-2);
        font: inherit;
        font-size: var(--uui-type-small-size);
        text-align: start;
        cursor: pointer;
      }

      .chip:hover {
        background: var(--uui-color-surface-emphasis);
      }

      .chip-name {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    `,
  ];
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayHeading(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return `${WEEKDAY_NAMES[weekday]} ${day}`;
}

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-week-grid': UmbCommunityKanbanWeekGridElement;
  }
}
