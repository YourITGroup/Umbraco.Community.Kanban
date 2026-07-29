import type { KanbanLaneOverrideRow } from './lane-override.model.js';

/**
 * Sorts rows into the configured display order.
 *
 * Deliberately mirrors `KanbanLaneOrderApplier` on the server, so the editor shows the order the board
 * will render: a listed value takes its listed position, an unlisted lane keeps its source order after
 * every listed one, a listed value matching no lane is ignored, and matching ignores case. Both sides
 * are tested against the same cases — see the note in the design about this rule living in two places.
 */
export function orderLaneRows(
  rows: KanbanLaneOverrideRow[],
  laneOrder: readonly string[] | undefined,
): KanbanLaneOverrideRow[] {
  const positions = new Map<string, number>();

  for (const value of laneOrder ?? []) {
    const key = value?.trim().toLowerCase();

    if (!key || positions.has(key)) continue;

    positions.set(key, positions.size);
  }

  if (positions.size === 0) return [...rows];

  // A row claims a listed position only once, so the second of two rows sharing a value sorts as
  // unlisted rather than colliding with the first.
  const claimed = new Set<number>();

  const positioned = rows.map((row) => {
    const position = positions.get(row.value.toLowerCase());

    if (position === undefined || claimed.has(position)) {
      // Unlisted rows sort after every listed one. positions.size is the first index past them all.
      return { row, position: positions.size };
    }

    claimed.add(position);
    return { row, position };
  });

  // Array.prototype.sort is stable, which is what keeps unlisted rows in their source order.
  return positioned.sort((a, b) => a.position - b.position).map((entry) => entry.row);
}

/** The value to store for a set of rows in their current order. */
export function toLaneOrder(rows: readonly KanbanLaneOverrideRow[]): string[] {
  return rows.map((row) => row.value);
}
