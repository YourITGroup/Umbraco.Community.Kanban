import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { KanbanCalendarItemModel } from '../data/kanban-calendar.types.js';
import { layoutSpans, toDaySpan, type LaidOutItem } from './overlap.model.js';
import type { KanbanCategoryAppearance } from './kanban-month-grid.element.js';

/**
 * The agenda list: day-by-day, chronological. Date-only items lead each day full-width; timed
 * items lay out through the same overlap model the week grid uses, so items whose times overlap
 * sit side by side — one row per cluster, columns ordered by category.
 */
@customElement('umb-community-kanban-agenda')
export class UmbCommunityKanbanAgendaElement extends UmbLitElement {
  @property({ attribute: false })
  days: Array<{ date: string; items: KanbanCalendarItemModel[] }> = [];

  @property({ attribute: false })
  appearanceFor: (category: string | null | undefined) => KanbanCategoryAppearance = () => ({});

  /** Today's ISO date, for the date-rail badge. Supplied by the calendar so this stays pure. */
  @property()
  today?: string;

  #onItemClick(item: KanbanCalendarItemModel) {
    this.dispatchEvent(
      new CustomEvent('kanban-open-document', { detail: { key: item.card.key }, bubbles: true, composed: true }),
    );
  }

  #renderEntry(item: KanbanCalendarItemModel, timed: boolean) {
    const appearance = this.appearanceFor(item.category);

    return html`
      <button
        class="entry"
        style=${appearance.colour ? `border-inline-start-color: ${appearance.colour}` : ''}
        title=${item.card.name}
        @click=${() => this.#onItemClick(item)}>
        ${timed
          ? html`<span class="time">${item.time}${item.endTime ? html`–${item.endTime}` : nothing}</span>`
          : html`<span class="time">all-day</span>`}
        <umb-icon .name=${item.card.icon ?? 'icon-document'}></umb-icon>
        <span class="name">${item.card.name}</span>
        ${appearance.icon ? html`<umb-icon .name=${appearance.icon}></umb-icon>` : nothing}
      </button>
    `;
  }

  #renderDay(day: { date: string; items: KanbanCalendarItemModel[] }) {
    const allDay = day.items.filter((item) => !item.time);
    const spans = day.items
      .map((item) => toDaySpan(item, day.date))
      .filter((span): span is NonNullable<typeof span> => span !== null);
    const laid = layoutSpans(spans);

    // One flex row per cluster: overlapping items share the row, ordered by their columns.
    const rows = new Map<number, LaidOutItem<KanbanCalendarItemModel>[]>();

    for (const entry of laid) {
      // Cluster identity: laidOut order groups clusters contiguously, so key rows by the
      // cluster's first start time — stable and unique per cluster within a day.
      const clusterKey = clusterStart(laid, entry);
      const row = rows.get(clusterKey);

      if (row) {
        row.push(entry);
      } else {
        rows.set(clusterKey, [entry]);
      }
    }

    const { dayNumber, weekday } = dayParts(day.date);

    return html`
      <section class="day">
        <div class="date-rail">
          <span class="day-number ${day.date === this.today ? 'today' : ''}">${dayNumber}</span>
          <span class="weekday">${weekday}</span>
        </div>
        <div class="entries">
          ${allDay.map((item) => this.#renderEntry(item, false))}
          ${[...rows.values()].map(
            (row) => html`
              <div class="row">
                ${row
                  .sort((a, b) => a.column - b.column)
                  .map((entry) => this.#renderEntry(entry.item, true))}
              </div>
            `,
          )}
        </div>
      </section>
    `;
  }

  override render() {
    if (this.days.length === 0) {
      return html`<div class="empty">Nothing scheduled in this period.</div>`;
    }

    return html`<div class="list">${this.days.map((day) => this.#renderDay(day))}</div>`;
  }

  static override styles = [
    css`
      :host {
        display: block;
      }

      .list {
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius);
        background: var(--uui-color-surface);
        overflow: hidden;
      }

      .day {
        display: flex;
        gap: var(--uui-size-space-4);
        padding: var(--uui-size-space-4);
      }

      .day + .day {
        border-top: 1px solid var(--uui-color-border);
      }

      .date-rail {
        flex: none;
        width: 3.5em;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      .day-number {
        font-size: var(--uui-type-h4-size);
        font-weight: 600;
        line-height: 1;
        min-width: 1.7em;
        padding: 0.35em 0;
        text-align: center;
        border-radius: 999px;
      }

      .day-number.today {
        background: var(--uui-color-current);
        color: var(--uui-color-current-contrast);
      }

      .weekday {
        font-size: var(--uui-type-small-size);
        color: var(--uui-color-text-alt);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .entries {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-1);
      }

      .row {
        display: flex;
        gap: var(--uui-size-space-2);
      }

      .row .entry {
        flex: 1 1 0;
        min-width: 0;
      }

      .entry {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
        width: 100%;
        border: none;
        border-inline-start: 3px solid transparent;
        border-radius: var(--uui-border-radius);
        background: var(--uui-color-surface-alt);
        padding: var(--uui-size-space-2) var(--uui-size-space-3);
        font: inherit;
        font-size: var(--uui-type-small-size);
        text-align: start;
        cursor: pointer;
        box-sizing: border-box;
      }

      .entry:hover {
        background: var(--uui-color-surface-emphasis);
      }

      .entry umb-icon {
        flex: none;
      }

      .time {
        flex: none;
        color: var(--uui-color-text-alt);
        min-width: 6.5em;
        font-variant-numeric: tabular-nums;
      }

      .name {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .empty {
        border: 1px dashed var(--uui-color-border);
        border-radius: var(--uui-border-radius);
        padding: var(--uui-size-space-6);
        text-align: center;
        color: var(--uui-color-text-alt);
        font-size: var(--uui-type-small-size);
      }
    `,
  ];
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Date-part arithmetic only: UTC construction and UTC getters, per the as-stored display rule. */
function dayParts(date: string): { dayNumber: number; weekday: string } {
  const [year, month, day] = date.split('-').map(Number);

  return { dayNumber: day, weekday: WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] };
}

/**
 * The earliest start among the laid-out spans that transitively overlap `entry` — the cluster's
 * identity. Recomputed rather than carried because the overlap model deliberately returns a flat
 * list; a scan per entry is fine at agenda sizes.
 */
function clusterStart<T>(laid: LaidOutItem<T>[], entry: LaidOutItem<T>): number {
  let clusterItems = [entry];
  let changed = true;

  while (changed) {
    changed = false;

    for (const candidate of laid) {
      if (clusterItems.includes(candidate)) continue;

      if (clusterItems.some((member) => candidate.start < member.end && member.start < candidate.end)) {
        clusterItems.push(candidate);
        changed = true;
      }
    }
  }

  return Math.min(...clusterItems.map((member) => member.start));
}

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-agenda': UmbCommunityKanbanAgendaElement;
  }
}
