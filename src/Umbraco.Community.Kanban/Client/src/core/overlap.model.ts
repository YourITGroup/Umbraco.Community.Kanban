import type { KanbanCalendarItemModel } from '../data/kanban-calendar.types.js';

/**
 * Interval layout shared by the week grid and the agenda: turn one day's items into
 * minutes-from-midnight spans, cluster the ones that overlap, and hand each a column so
 * overlapping items sit side by side — ordered by category, the whole point of the columns.
 * Pure; minutes are plain numbers, so there is nothing timezone-shaped to get wrong.
 */

export interface SpanItem<T> {
  /** Minutes from midnight. */
  start: number;
  /** Minutes from midnight; always > start. */
  end: number;
  category: string | null;
  item: T;
}

export interface LaidOutItem<T> extends SpanItem<T> {
  /** Zero-based column within the cluster. */
  column: number;
  /** The cluster's width — size blocks as 1/columns. */
  columns: number;
}

/** A timed item with no usable end renders as a nominal one-hour block. */
const NOMINAL_MINUTES = 60;

const DAY_MINUTES = 1440;

function minutes(time: string): number {
  const [hours, mins] = time.split(':').map(Number);

  return hours * 60 + mins;
}

/**
 * The span an item occupies within `day`, or null for a date-only item — those belong in the
 * all-day strip, not on the hour axis. An end on a later day clamps to midnight; an end that
 * does not extend the start falls back to the nominal block.
 */
export function toDaySpan(
  item: KanbanCalendarItemModel,
  day: string,
): SpanItem<KanbanCalendarItemModel> | null {
  if (!item.time) return null;

  const start = minutes(item.time);
  let end = start + NOMINAL_MINUTES;

  if (item.endDate && item.endDate > day) {
    end = DAY_MINUTES;
  } else if (item.endDate === day && item.endTime) {
    const endMinutes = minutes(item.endTime);

    if (endMinutes > start) {
      end = endMinutes;
    }
  }

  return { start, end: Math.min(end, DAY_MINUTES), category: item.category ?? null, item };
}

/** Categories order the columns; uncategorised items sort after every category. */
function compareSpans<T>(a: SpanItem<T>, b: SpanItem<T>): number {
  if (a.category !== b.category) {
    if (a.category === null) return 1;
    if (b.category === null) return -1;

    return a.category.localeCompare(b.category);
  }

  return a.start - b.start || a.end - b.end;
}

/**
 * Cluster transitively-overlapping spans and assign columns greedily within each cluster:
 * every span takes the first column whose previous occupant has ended. All spans in a cluster
 * report the cluster's full column count, so blocks can size as an even 1/columns share.
 */
export function layoutSpans<T>(spans: SpanItem<T>[]): LaidOutItem<T>[] {
  // Clusters form in time order — a cluster ends when nothing open reaches the next start.
  const byTime = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const clusters: SpanItem<T>[][] = [];
  let clusterEnd = -1;

  for (const span of byTime) {
    if (clusters.length === 0 || span.start >= clusterEnd) {
      clusters.push([span]);
      clusterEnd = span.end;
    } else {
      clusters[clusters.length - 1].push(span);
      clusterEnd = Math.max(clusterEnd, span.end);
    }
  }

  const laid: LaidOutItem<T>[] = [];

  for (const cluster of clusters) {
    // Columns assign in category order, so overlapping categories land side by side sorted.
    const ordered = [...cluster].sort(compareSpans);
    const columnEnds: number[] = [];
    const placed: Array<{ span: SpanItem<T>; column: number }> = [];

    for (const span of ordered) {
      let column = columnEnds.findIndex((end) => end <= span.start);

      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(span.end);
      } else {
        columnEnds[column] = span.end;
      }

      placed.push({ span, column });
    }

    for (const { span, column } of placed) {
      laid.push({ ...span, column, columns: columnEnds.length });
    }
  }

  return laid;
}

/** Percent geometry for a block within a 00:00–24:00 column. */
export function blockGeometry(span: { start: number; end: number }): { topPct: number; heightPct: number } {
  return {
    topPct: (span.start / DAY_MINUTES) * 100,
    heightPct: ((span.end - span.start) / DAY_MINUTES) * 100,
  };
}
