import type {
  KanbanBoardLaneModel,
  KanbanBoardModel,
  KanbanCardModel,
  KanbanCardState,
} from '../data/kanban-board.types.js';

/** What the board element holds between requests. */
export interface KanbanBoardState {
  lanes: KanbanBoardLaneModel[];
  truncated: boolean;
  childCount: number;
  showChildItems: boolean;
  allowDrag: boolean;
}

export function toBoardState(board: KanbanBoardModel): KanbanBoardState {
  return {
    lanes: [...board.lanes],
    truncated: board.truncated,
    childCount: board.childCount,
    showChildItems: board.showChildItems,
    allowDrag: board.allowDrag,
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
    allowDrag: page.allowDrag,
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

/**
 * Relocates a card from one lane to another, moving the lane totals with it. Pure; never mutates its
 * input.
 *
 * The revert on a failed write is this same function with the lanes swapped back — there is deliberately
 * no separate undo, because an undo that is not literally the inverse move is an undo that can drift.
 * A move whose card, source lane or target lane cannot be found is a no-op rather than an error: the
 * board hit-tests against what it is rendering, so a mismatch means the board reloaded mid-gesture and
 * the safe answer is to leave the fresh state alone.
 */
export function moveCard(
  state: KanbanBoardState,
  cardKey: string,
  fromLane: string,
  toLane: string,
): KanbanBoardState {
  if (sameLane(fromLane, toLane)) return state;

  const source = state.lanes.find((lane) => sameLane(lane.value, fromLane));
  const target = state.lanes.find((lane) => sameLane(lane.value, toLane));

  if (!source || !target) return state;

  const moving = source.cards.find((card) => card.key === cardKey);

  if (!moving) return state;

  return {
    ...state,
    lanes: state.lanes.map((lane) => {
      if (lane === source) {
        return { ...lane, cards: lane.cards.filter((card) => card.key !== cardKey), total: lane.total - 1 };
      }

      if (lane === target) {
        return { ...lane, cards: [...lane.cards, moving], total: lane.total + 1 };
      }

      return lane;
    }),
  };
}

/** One completed move, kept so it can be undone. */
export interface KanbanCardMove {
  key: string;
  /** The lane the card came from — where an undo puts it back. */
  from: string;
  /** The lane it went to, and where it must still be for an undo to be safe. */
  to: string;
}

/**
 * The same move, backwards. Undo writes this rather than computing a destination of its own: an undo that
 * is not literally the inverse is an undo that can drift, which is the reasoning `moveCard` already records.
 */
export function invertMove(move: KanbanCardMove): KanbanCardMove {
  return { key: move.key, from: move.to, to: move.from };
}

/** The value of the lane a card currently sits in, or undefined if the board is not showing it. */
export function laneOfCard(state: KanbanBoardState, cardKey: string): string | undefined {
  return state.lanes.find((lane) => lane.cards.some((card) => card.key === cardKey))?.value;
}

/**
 * Whether a recorded move can still be undone, given where its card sits now.
 *
 * The card must still be in the lane the move put it in. Anything else means the world moved on — a
 * reload, another editor, or a later move of the same card — and writing the old source lane back would
 * undo something that is no longer there. Compared case-insensitively, as every other lane comparison is.
 */
export function isMoveUndoable(move: KanbanCardMove, currentLane: string | undefined): boolean {
  return currentLane !== undefined && sameLane(currentLane, move.to);
}

/**
 * The state a card takes on immediately after a save. A published card gains unpublished changes; a draft
 * has no published version to diverge from, so nothing changes.
 *
 * This is the optimistic guess only — it is superseded by whatever the server reports the save actually
 * persisted, which is why nothing else in the client derives a state this way.
 */
export function nextStateAfterSave(state: KanbanCardState): KanbanCardState {
  return state === 'published' ? 'publishedPendingChanges' : state;
}

/** Replaces one card's publish state, wherever the card sits. Pure. */
export function applyCardState(
  state: KanbanBoardState,
  cardKey: string,
  cardState: KanbanCardState,
): KanbanBoardState {
  return mapCard(state, cardKey, (card) => ({ ...card, state: cardState }));
}

/**
 * Flags a card as having a write in flight. Drives the dimmed treatment and stops a second drag starting
 * before the first resolves.
 */
export function setCardSaving(state: KanbanBoardState, cardKey: string, saving: boolean): KanbanBoardState {
  return mapCard(state, cardKey, (card) => ({ ...card, saving }));
}

/**
 * Every loaded card with unpublished changes, in lane order.
 *
 * Deliberately scoped to what the board is holding in memory — the same scope core's own document bulk
 * publish action has, which acts on `this.selection` and never queries for items that were never
 * selected. A card in an unpaged lane page, or beyond the board's truncation cap, does not appear here
 * until it is paged in. That makes "Publish pending changes" convenience-scoped to what is on screen
 * rather than exhaustive, which is the backoffice's own convention.
 */
export function pendingCards(state: KanbanBoardState): KanbanCardModel[] {
  return state.lanes.flatMap((lane) => lane.cards.filter((card) => card.state === 'publishedPendingChanges'));
}

function mapCard(
  state: KanbanBoardState,
  cardKey: string,
  transform: (card: KanbanCardModel) => KanbanCardModel,
): KanbanBoardState {
  return {
    ...state,
    lanes: state.lanes.map((lane) =>
      lane.cards.some((card) => card.key === cardKey)
        ? { ...lane, cards: lane.cards.map((card) => (card.key === cardKey ? transform(card) : card)) }
        : lane,
    ),
  };
}

/** Lane values compare case-insensitively everywhere — the server matches them the same way. */
export function sameLane(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
