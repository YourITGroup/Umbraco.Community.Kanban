import type { KanbanCalendarItemModel } from '../data/kanban-calendar.types.js';

/**
 * Month/agenda layout arithmetic, pure and tested. Dates are 'yyyy-MM-dd' strings and
 * {year, month} parts throughout; `Date` is used ONLY as `new Date(Date.UTC(...))` with UTC
 * getters, for weekday arithmetic — never via string parsing or local-time constructors, which
 * would let the browser's timezone move a card to a neighbouring day.
 */

export interface CalendarCell {
  date: string;
  inMonth: boolean;
  isToday: boolean;
}

export interface CalendarWeek {
  /** Always 7 cells. */
  cells: CalendarCell[];
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function toParts(date: string): DateParts {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

function toIso({ year, month, day }: DateParts): string {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is this month's last day; UTC keeps it timezone-proof.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 = Sunday … 6 = Saturday, matching Date's own convention. */
function weekday(date: string): number {
  const { year, month, day } = toParts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const { year, month, day } = toParts(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));

  return toIso({ year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() });
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + delta;

  return { year: Math.floor(zeroBased / 12), month: (((zeroBased % 12) + 12) % 12) + 1 };
}

/** Inclusive 7-day range containing `date`, starting on `firstDayOfWeek`. */
export function weekRange(date: string, firstDayOfWeek: number): { from: string; to: string } {
  const back = (weekday(date) - firstDayOfWeek + 7) % 7;
  const from = addDays(date, -back);

  return { from, to: addDays(from, 6) };
}

/** Inclusive fetch range covering the visible month grid, leading/trailing days included. */
export function monthRange(year: number, month: number, firstDayOfWeek: number): { from: string; to: string } {
  const first = toIso({ year, month, day: 1 });
  const { from } = weekRange(first, firstDayOfWeek);
  const last = toIso({ year, month, day: daysInMonth(year, month) });

  return { from, to: weekRange(last, firstDayOfWeek).to };
}

/** Weeks covering the month; cells outside it are flagged rather than dropped. */
export function monthGrid(year: number, month: number, firstDayOfWeek: number, today: string): CalendarWeek[] {
  const { from, to } = monthRange(year, month, firstDayOfWeek);
  const weeks: CalendarWeek[] = [];

  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 7)) {
    const cells: CalendarCell[] = [];

    for (let offset = 0; offset < 7; offset++) {
      const date = addDays(cursor, offset);
      const parts = toParts(date);

      cells.push({ date, inMonth: parts.year === year && parts.month === month, isToday: date === today });
    }

    weeks.push({ cells });
  }

  return weeks;
}

/** date → items ordered by time (date-only first), then card name. */
export function placeByDay(items: KanbanCalendarItemModel[]): Map<string, KanbanCalendarItemModel[]> {
  const byDay = new Map<string, KanbanCalendarItemModel[]>();

  for (const entry of items) {
    const day = byDay.get(entry.date);

    if (day) {
      day.push(entry);
    } else {
      byDay.set(entry.date, [entry]);
    }
  }

  for (const day of byDay.values()) {
    day.sort(compareItems);
  }

  return byDay;
}

function compareItems(a: KanbanCalendarItemModel, b: KanbanCalendarItemModel): number {
  // '' sorts before any 'HH:mm', putting date-only items first.
  const byTime = (a.time ?? '').localeCompare(b.time ?? '');

  return byTime !== 0 ? byTime : a.card.name.localeCompare(b.card.name, undefined, { sensitivity: 'base' });
}

/**
 * First `capacity` items + overflow count for a month cell. At exactly capacity everything shows:
 * replacing the last item with "+1 more" would cost a click to reveal a single known item.
 */
export function partitionCell<T>(items: T[], capacity: number): { visible: T[]; more: number } {
  if (items.length <= capacity) {
    return { visible: items, more: 0 };
  }

  return { visible: items.slice(0, capacity), more: items.length - capacity };
}

/** Days in ascending order, each with its ordered items; empty days simply do not appear. */
export function agendaDays(
  items: KanbanCalendarItemModel[],
): Array<{ date: string; items: KanbanCalendarItemModel[] }> {
  return [...placeByDay(items).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayItems]) => ({ date, items: dayItems }));
}
