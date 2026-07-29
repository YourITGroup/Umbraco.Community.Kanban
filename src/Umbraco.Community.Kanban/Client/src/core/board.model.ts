import type { KanbanBoardLaneModel, KanbanBoardModel } from '../data/kanban-board.types.js';

/** What the board element holds between requests. */
export interface KanbanBoardState {
  lanes: KanbanBoardLaneModel[];
  truncated: boolean;
  childCount: number;
  showChildItems: boolean;
}

export function toBoardState(board: KanbanBoardModel): KanbanBoardState {
  return {
    lanes: [...board.lanes],
    truncated: board.truncated,
    childCount: board.childCount,
    showChildItems: board.showChildItems,
  };
}

/**
 * Folds a single-lane response into the board. Pure; never mutates its input.
 *
 * A returned page with no cards is the only reliable proof that a lane is exhausted — once
 * the child cap makes totals lower bounds, the total cannot be trusted to end the paging —
 * so an empty page pins the total to what is loaded and marks it exact, retiring the
 * "Show more" button.
 */
export function mergeLanePage(state: KanbanBoardState, page: KanbanBoardModel): KanbanBoardState {
  const lanes = state.lanes.map((lane) => {
    const incoming = page.lanes.find((candidate) => sameLane(candidate.value, lane.value));

    if (!incoming) return lane;

    if (incoming.cards.length === 0) {
      return { ...lane, skip: incoming.skip, total: lane.cards.length, totalIsExact: true };
    }

    const held = new Set(lane.cards.map((card) => card.key));

    return {
      ...lane,
      skip: incoming.skip,
      total: incoming.total,
      totalIsExact: incoming.totalIsExact,
      cards: [...lane.cards, ...incoming.cards.filter((card) => !held.has(card.key))],
    };
  });

  return {
    lanes,
    truncated: page.truncated,
    childCount: page.childCount,
    showChildItems: page.showChildItems,
  };
}

/** True while the lane may hold cards that are not loaded. */
export function laneHasMore(lane: KanbanBoardLaneModel): boolean {
  return !lane.totalIsExact || lane.cards.length < lane.total;
}

/** The skip for this lane's next page — derived from what is held, never a counter. */
export function nextSkip(lane: KanbanBoardLaneModel): number {
  return lane.cards.length;
}

/** The lane header count: "12", or "120+" where the total is only a lower bound. */
export function formatLaneTotal(lane: KanbanBoardLaneModel): string {
  return lane.totalIsExact ? `${lane.total}` : `${lane.total}+`;
}

function sameLane(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
