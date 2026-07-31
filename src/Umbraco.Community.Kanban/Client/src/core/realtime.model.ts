import { sameLane, type KanbanBoardState } from './board.model.js';
import type { KanbanCardOutcome } from '../data/kanban-data-source.js';
import type { KanbanBoardLaneModel } from '../data/kanban-board.types.js';

/** The reconciled board, and whether anything actually changed — `changed` drives the highlight. */
export interface KanbanRealtimeResult {
  state: KanbanBoardState;
  changed: boolean;
}

/**
 * Folds one fetched card into the board. Pure; never mutates its input.
 *
 * The rules, in the order they are checked:
 * - an `error` outcome changes nothing — a transient fetch failure must never remove a card;
 * - a held card with a write in flight is left alone — that is our own optimistic write's echo
 *   arriving before the PUT resolves, and the write's completion path owns that card's state;
 * - `not-child` and `gone` both remove the card if held (deleted, trashed, moved to another parent,
 *   or permission lost — the server deliberately conflates them), and are a no-op if not;
 * - a `child` in the lane the card already occupies replaces it in place;
 * - a `child` in a different lane moves it, totals adjusted the way moveCard adjusts them;
 * - an unheld `child` appends to its lane — the end, not a guessed sort position; the next full load
 *   restores true order. A lane value matching no lane belongs to the unassigned lane, the same rule
 *   the server's board composer applies.
 *
 * Every applied `child` result reports `changed: true` rather than diffing the card's fields —
 * a re-pulsed highlight is cheaper than a wrong "nothing changed".
 */
export function applyCardResult(
  state: KanbanBoardState,
  key: string,
  outcome: KanbanCardOutcome,
): KanbanRealtimeResult {
  if (outcome.kind === 'error') return unchanged(state);

  const holding = state.lanes.find((lane) => lane.cards.some((card) => card.key === key));
  const held = holding?.cards.find((card) => card.key === key);

  if (held?.saving) return unchanged(state);

  if (outcome.kind === 'not-child' || outcome.kind === 'gone') {
    if (!holding) return unchanged(state);

    return { state: removeFrom(state, holding, key), changed: true };
  }

  const target =
    state.lanes.find((lane) => sameLane(lane.value, outcome.laneValue)) ??
    state.lanes.find((lane) => lane.isUnassigned);

  if (!target) return unchanged(state);

  if (holding && sameLane(holding.value, target.value)) {
    return {
      state: {
        ...state,
        lanes: state.lanes.map((lane) =>
          lane === holding
            ? { ...lane, cards: lane.cards.map((card) => (card.key === key ? outcome.card : card)) }
            : lane,
        ),
      },
      changed: true,
    };
  }

  const removed = holding ? removeFrom(state, holding, key) : state;

  return {
    state: {
      ...removed,
      lanes: removed.lanes.map((lane) =>
        sameLane(lane.value, target.value)
          ? { ...lane, cards: [...lane.cards, outcome.card], total: lane.total + 1 }
          : lane,
      ),
    },
    changed: true,
  };
}

function unchanged(state: KanbanBoardState): KanbanRealtimeResult {
  return { state, changed: false };
}

function removeFrom(state: KanbanBoardState, holding: KanbanBoardLaneModel, key: string): KanbanBoardState {
  return {
    ...state,
    lanes: state.lanes.map((lane) =>
      lane === holding
        ? { ...lane, cards: lane.cards.filter((card) => card.key !== key), total: lane.total - 1 }
        : lane,
    ),
  };
}
