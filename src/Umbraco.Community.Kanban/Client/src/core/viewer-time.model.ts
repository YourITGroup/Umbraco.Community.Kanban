import type { KanbanCalendarItemModel } from '../data/kanban-calendar.types.js';

/**
 * Places calendar items in the viewer's time zone — the calendar's half of the rule a board card
 * already follows.
 *
 * A board card renders a date property through the backoffice's own value summary, which for
 * `Umbraco.DateTimeWithTimeZone` does `DateTime.fromISO(date, { zone }).toLocal()`: the viewer's
 * zone, resolved in the browser. Conversion happens here, in the browser, for exactly that reason —
 * the browser is the authority on the viewer's zone, and doing it anywhere else would mean a second
 * implementation that has to agree with Umbraco's.
 *
 * Only a value that stated its own zone carries an `instant`, and only those are converted. A bare
 * wall clock (the unspecified, date-only and legacy editors) is left exactly as stored, because
 * shifting it would invent an offset the editor never recorded.
 *
 * The `Date` object appears here and nowhere else in the calendar models: this is the one place a
 * real moment is being interpreted rather than date parts being counted. Parts come back out of
 * `Intl.DateTimeFormat` read by type, never from a formatted string, so no locale can reshape them.
 */
export interface KanbanViewerWindow {
  /** Inclusive first date the calendar asked for, 'yyyy-MM-dd'. */
  from: string;
  /** Inclusive last date the calendar asked for, 'yyyy-MM-dd'. */
  to: string;
}

/** The viewer's wall clock for one moment, or null when the instant is unparseable. */
function partsIn(instant: string, timeZone: string): { date: string; time: string } | null {
  const moment = new Date(instant);

  if (Number.isNaN(moment.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    // h23 rather than hour12: false, which yields a 24 for midnight in some engines.
    hourCycle: 'h23',
  }).formatToParts(moment);

  const found = new Map(parts.map((part) => [part.type, part.value]));
  const year = found.get('year');
  const month = found.get('month');
  const day = found.get('day');
  const hour = found.get('hour');
  const minute = found.get('minute');

  if (!year || !month || !day || !hour || !minute) return null;

  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

/**
 * One item in the viewer's zone. Untouched when neither end carries a moment, so a wall-clock
 * calendar goes through this unchanged.
 *
 * A converted start keeps its time even at midnight: it is a timed value whose zone happens to
 * land on 00:00, unlike a stored midnight, which the server already reports as date-only.
 */
export function inViewerTimeZone(item: KanbanCalendarItemModel, timeZone: string): KanbanCalendarItemModel {
  const start = item.instant ? partsIn(item.instant, timeZone) : null;
  const end = item.endInstant ? partsIn(item.endInstant, timeZone) : null;

  if (!start && !end) return item;

  return {
    ...item,
    ...(start ? { date: start.date, time: start.time } : {}),
    ...(end ? { endDate: end.date, endTime: end.time } : {}),
  };
}

/**
 * Every item in the viewer's zone, trimmed to the window the calendar asked for. The trim is the
 * other half of the server's day of slack: it delivers a day either side precisely because
 * conversion can move an item onto the adjacent day, and whatever lands outside is dropped here
 * rather than shown under the wrong month.
 */
export function placeInViewerTimeZone(
  items: KanbanCalendarItemModel[],
  timeZone: string,
  window: KanbanViewerWindow,
): KanbanCalendarItemModel[] {
  return items
    .map((item) => inViewerTimeZone(item, timeZone))
    .filter((item) => item.date >= window.from && item.date <= window.to);
}
