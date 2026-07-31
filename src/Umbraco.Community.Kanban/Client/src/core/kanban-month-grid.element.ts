import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { KanbanCalendarItemModel } from '../data/kanban-calendar.types.js';
import { partitionCell, type CalendarWeek } from './calendar.model.js';

/** How a category accents a chip. Empty object means no accent. */
export interface KanbanCategoryAppearance {
  colour?: string;
  icon?: string;
}

/** Chips per cell before "+N more" takes over. */
const CELL_CAPACITY = 3;

/**
 * The month grid alone: cells in weeks, compact chips, "+N more" expansion. Presentational —
 * the calendar element owns fetching and navigation; this element owns only how a month looks.
 * Chip clicks dispatch `kanban-open-document`; empty-cell clicks dispatch `kanban-create-at`
 * with the date (creation is date-only from a month cell — the week grid owns hours).
 */
@customElement('umb-community-kanban-month-grid')
export class UmbCommunityKanbanMonthGridElement extends UmbLitElement {
  @property({ attribute: false })
  weeks: CalendarWeek[] = [];

  @property({ attribute: false })
  itemsByDay: Map<string, KanbanCalendarItemModel[]> = new Map();

  @property({ attribute: false })
  appearanceFor: (category: string | null | undefined) => KanbanCategoryAppearance = () => ({});

  /** True disables empty-cell creation (system date properties cannot be preset). */
  @property({ type: Boolean, attribute: 'disable-create' })
  disableCreate = false;

  /** Days whose cells show every chip rather than the capped strip. */
  @state()
  private _expanded = new Set<string>();

  override willUpdate(changed: Map<string, unknown>) {
    // A new month means new cells; stale expansions would silently pre-expand unrelated days.
    if (changed.has('weeks')) {
      this._expanded = new Set();
    }
  }

  #onChipClick(event: Event, item: KanbanCalendarItemModel) {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('kanban-open-document', { detail: { key: item.card.key }, bubbles: true, composed: true }),
    );
  }

  #onCellClick(date: string) {
    if (this.disableCreate) return;

    this.dispatchEvent(new CustomEvent('kanban-create-at', { detail: { date }, bubbles: true, composed: true }));
  }

  #onMore(event: Event, date: string) {
    event.stopPropagation();
    this._expanded = new Set(this._expanded).add(date);
  }

  #renderChip(item: KanbanCalendarItemModel) {
    const appearance = this.appearanceFor(item.category);

    return html`
      <button class="chip" title=${item.card.name} @click=${(event: Event) => this.#onChipClick(event, item)}>
        <umb-icon .name=${item.card.icon ?? 'icon-document'}></umb-icon>
        <span class="chip-name">${item.card.name}</span>
        ${item.time ? html`<span class="chip-time">${item.time}</span>` : nothing}
        ${appearance.icon ? html`<umb-icon class="chip-category" .name=${appearance.icon}></umb-icon>` : nothing}
        ${appearance.colour
          ? html`<span class="chip-dot" style="background: ${appearance.colour}"></span>`
          : nothing}
      </button>
    `;
  }

  #renderCell(cell: { date: string; inMonth: boolean; isToday: boolean }) {
    const items = this.itemsByDay.get(cell.date) ?? [];
    const { visible, more } = this._expanded.has(cell.date)
      ? { visible: items, more: 0 }
      : partitionCell(items, CELL_CAPACITY);
    const dayNumber = Number(cell.date.slice(8));

    return html`
      <div
        class="cell ${cell.inMonth ? '' : 'outside'}"
        role="gridcell"
        @click=${() => this.#onCellClick(cell.date)}>
        <span class="day ${cell.isToday ? 'today' : ''}">${dayNumber}</span>
        ${visible.map((item) => this.#renderChip(item))}
        ${more > 0
          ? html`<button class="more" @click=${(event: Event) => this.#onMore(event, cell.date)}>
              +${more} more
            </button>`
          : nothing}
      </div>
    `;
  }

  /**
   * The weekday labels, taken from the first rendered week rather than from a first-day-of-week
   * setting: the grid is already built starting on whatever day the calendar chose, so reading the
   * row it was given cannot disagree with the cells underneath it.
   */
  #renderWeekdays() {
    const first = this.weeks[0];

    if (!first) return nothing;

    return html`
      <div class="weekdays" role="row">
        ${first.cells.map((cell) => html`<div class="weekday" role="columnheader">${weekdayName(cell.date)}</div>`)}
      </div>
    `;
  }

  override render() {
    return html`
      ${this.#renderWeekdays()}
      <div class="grid" role="grid">
        ${this.weeks.map((week) => week.cells.map((cell) => this.#renderCell(cell)))}
      </div>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
      }

      /*
       * Sticky so the labels stay with the cells they name while a long month scrolls, below the
       * calendar's own sticky toolbar — which publishes its measured height as the offset.
       */
      .weekdays {
        position: sticky;
        top: var(--kanban-calendar-sticky-top, 0px);
        z-index: 2;
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 1px;
        /* Page background, matching the calendar's sticky toolbar directly above: the weekday labels sit
           outside the grid's bordered box, so they belong to the page rather than to a panel. */
        background: var(--umb-body-layout-color-background, var(--uui-color-background));
        padding-bottom: var(--uui-size-space-1);
      }

      .weekday {
        font-size: var(--uui-type-small-size);
        font-weight: 600;
        color: var(--uui-color-text-alt);
        text-align: center;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 1px;
        background: var(--uui-color-border);
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius);
        overflow: hidden;
      }

      .cell {
        background: var(--uui-color-surface);
        min-height: 96px;
        padding: var(--uui-size-space-2);
        display: flex;
        flex-direction: column;
        gap: 2px;
        cursor: pointer;
      }

      .cell.outside {
        opacity: 0.45;
      }

      .day {
        font-size: var(--uui-type-small-size);
        font-weight: 600;
        align-self: flex-end;
        min-width: 1.6em;
        text-align: center;
        border-radius: 999px;
        padding: 1px 4px;
      }

      .day.today {
        background: var(--uui-color-current);
        color: var(--uui-color-current-contrast);
      }

      .chip {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-1);
        /* White on a white cell, so the border is what makes the card a card. */
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius);
        background: var(--uui-color-surface);
        padding: 1px var(--uui-size-space-2);
        font: inherit;
        font-size: var(--uui-type-small-size);
        text-align: start;
        cursor: pointer;
        max-width: 100%;
      }

      .chip:hover {
        background: var(--uui-color-surface-emphasis);
      }

      .chip umb-icon {
        flex: none;
        font-size: 0.85em;
      }

      .chip-name {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .chip-time {
        margin-inline-start: auto;
        flex: none;
        color: var(--uui-color-text-alt);
      }

      .chip-category {
        flex: none;
      }

      .chip-dot {
        flex: none;
        width: 8px;
        height: 8px;
        border-radius: 999px;
        margin-inline-start: auto;
      }

      /* When a time already claims the right edge, the dot follows it without a second auto-margin. */
      .chip-time ~ .chip-dot,
      .chip-category ~ .chip-dot {
        margin-inline-start: 0;
      }

      .more {
        border: none;
        background: none;
        font: inherit;
        font-size: var(--uui-type-small-size);
        color: var(--uui-color-interactive);
        cursor: pointer;
        text-align: start;
        padding: 0 var(--uui-size-space-2);
      }

      .more:hover {
        text-decoration: underline;
      }
    `,
  ];
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Date-part arithmetic only: UTC construction and UTC getters, per the calendar models' rule. */
function weekdayName(date: string): string {
  const [year, month, day] = date.split('-').map(Number);

  return WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-month-grid': UmbCommunityKanbanMonthGridElement;
  }
}
