import { describe, it, expect } from 'vitest';
import {
  applyCardState,
  formatLaneTotal,
  invertMove,
  isMoveUndoable,
  laneHasMore,
  laneOfCard,
  mergeLanePage,
  moveCard,
  nextSkip,
  nextStateAfterSave,
  pendingCards,
  setCardSaving,
  toBoardState,
} from './board.model.js';
import type { KanbanBoardLaneModel, KanbanBoardModel, KanbanCardModel } from '../data/kanban-board.types.js';

const card = (key: string, overrides: Partial<KanbanCardModel> = {}): KanbanCardModel => ({
  key,
  name: key,
  contentTypeAlias: 'task',
  contentTypeKey: '00000000-0000-0000-0000-000000000001',
  state: 'draft',
  canUpdate: false,
  canCreate: false,
  children: [],
  childTotal: 0,
  childTotalIsExact: true,
  properties: [],
  ...overrides,
});

const lane = (value: string, cards: string[], overrides: Partial<KanbanBoardLaneModel> = {}): KanbanBoardLaneModel => ({
  value,
  name: value,
  isUnassigned: value === '',
  acceptsDrops: value !== '',
  total: cards.length,
  totalIsExact: true,
  skip: 0,
  cards: cards.map((key) => card(key)),
  ...overrides,
});

const board = (lanes: KanbanBoardLaneModel[], overrides: Partial<KanbanBoardModel> = {}): KanbanBoardModel => ({
  lanes,
  truncated: false,
  childCount: lanes.reduce((sum, l) => sum + l.total, 0),
  showChildItems: false,
  allowDrag: false,
  ...overrides,
});

describe('toBoardState', () => {
  it('carries lanes, truncation and child count across', () => {
    const state = toBoardState(board([lane('todo', ['a'])], { truncated: true, childCount: 4000 }));

    expect(state.lanes.map((l) => l.value)).toEqual(['todo']);
    expect(state.truncated).toBe(true);
    expect(state.childCount).toBe(4000);
  });

  it('carries the child items flag across', () => {
    expect(toBoardState(board([], { showChildItems: true })).showChildItems).toBe(true);
  });

  it('carries the allow drag flag across', () => {
    expect(toBoardState(board([], { allowDrag: true })).allowDrag).toBe(true);
  });
});

describe('mergeLanePage', () => {
  const initial = () =>
    toBoardState(board([lane('todo', ['a'], { total: 3 }), lane('doing', ['x'])]));

  it('appends the returned cards to the named lane', () => {
    const next = mergeLanePage(initial(), board([lane('todo', ['b', 'c'], { total: 3, skip: 1 })]));

    expect(next.lanes[0].cards.map((c) => c.key)).toEqual(['a', 'b', 'c']);
  });

  it('leaves other lanes untouched', () => {
    const next = mergeLanePage(initial(), board([lane('todo', ['b'], { total: 3, skip: 1 })]));

    expect(next.lanes[1].cards.map((c) => c.key)).toEqual(['x']);
  });

  it('keeps the child items flag when a lane page is merged in', () => {
    // Easy to lose: mergeLanePage rebuilds the board state object from the incoming page.
    const state = toBoardState(board([lane('todo', ['a'], { total: 3 })], { showChildItems: true }));

    const next = mergeLanePage(state, board([lane('todo', ['b'], { total: 3, skip: 1 })], { showChildItems: true }));

    expect(next.showChildItems).toBe(true);
  });

  it('keeps the allow drag flag when a lane page is merged in', () => {
    const state = toBoardState(board([lane('todo', ['a'], { total: 3 })], { allowDrag: true }));

    const next = mergeLanePage(state, board([lane('todo', ['b'], { total: 3, skip: 1 })], { allowDrag: true }));

    expect(next.allowDrag).toBe(true);
  });

  it('does not duplicate a card already held, so a double-clicked show-more is harmless', () => {
    const next = mergeLanePage(initial(), board([lane('todo', ['a', 'b'], { total: 3, skip: 0 })]));

    expect(next.lanes[0].cards.map((c) => c.key)).toEqual(['a', 'b']);
  });

  it('takes the new total and skip from the page', () => {
    const next = mergeLanePage(initial(), board([lane('todo', ['b'], { total: 7, skip: 1 })]));

    expect(next.lanes[0].total).toBe(7);
    expect(next.lanes[0].skip).toBe(1);
  });

  it('matches the lane case-insensitively', () => {
    const next = mergeLanePage(initial(), board([lane('ToDo', ['b'], { total: 3, skip: 1 })]));

    expect(next.lanes[0].cards.map((c) => c.key)).toEqual(['a', 'b']);
  });

  it('ignores a lane it does not already hold', () => {
    const next = mergeLanePage(initial(), board([lane('archived', ['z'])]));

    expect(next.lanes.map((l) => l.value)).toEqual(['todo', 'doing']);
  });

  it('treats an empty page as proof the lane is exhausted', () => {
    const state = toBoardState(board([lane('todo', ['a'], { total: 99, totalIsExact: false })]));

    const next = mergeLanePage(state, board([lane('todo', [], { total: 99, totalIsExact: false, skip: 1 })]));

    expect(next.lanes[0].total).toBe(1);
    expect(next.lanes[0].totalIsExact).toBe(true);
    expect(laneHasMore(next.lanes[0])).toBe(false);
  });

  it('updates the board-level truncation from the page', () => {
    const next = mergeLanePage(initial(), board([lane('todo', ['b'], { total: 3, skip: 1 })], {
      truncated: true,
      childCount: 4000,
    }));

    expect(next.truncated).toBe(true);
    expect(next.childCount).toBe(4000);
  });

  it('does not mutate the state it was given', () => {
    const state = initial();

    mergeLanePage(state, board([lane('todo', ['b'], { total: 3, skip: 1 })]));

    expect(state.lanes[0].cards.map((c) => c.key)).toEqual(['a']);
  });
});

describe('laneHasMore', () => {
  it('is true while fewer cards are loaded than the total', () => {
    expect(laneHasMore(lane('todo', ['a'], { total: 3 }))).toBe(true);
  });

  it('is false once every card is loaded', () => {
    expect(laneHasMore(lane('todo', ['a', 'b']))).toBe(false);
  });

  it('is true when the total is only a lower bound, even if it looks satisfied', () => {
    expect(laneHasMore(lane('todo', ['a'], { total: 1, totalIsExact: false }))).toBe(true);
  });
});

describe('formatLaneTotal', () => {
  it('shows an exact total plainly', () => {
    expect(formatLaneTotal(lane('todo', [], { total: 12 }))).toBe('12');
  });

  it('marks a lower bound with a plus', () => {
    expect(formatLaneTotal(lane('todo', [], { total: 120, totalIsExact: false }))).toBe('120+');
  });
});

describe('nextSkip', () => {
  it('is the number of cards already loaded, never a running counter', () => {
    expect(nextSkip(lane('todo', ['a', 'b', 'c'], { total: 9, skip: 25 }))).toBe(3);
  });
});

describe('moveCard', () => {
  const initial = () => toBoardState(board([lane('todo', ['a', 'b']), lane('doing', ['x']), lane('', [])]));

  it('removes the card from its source lane and appends it to the target', () => {
    const next = moveCard(initial(), 'a', 'todo', 'doing');

    expect(next.lanes[0].cards.map((c) => c.key)).toEqual(['b']);
    expect(next.lanes[1].cards.map((c) => c.key)).toEqual(['x', 'a']);
  });

  it('moves the totals with the card', () => {
    const next = moveCard(initial(), 'a', 'todo', 'doing');

    expect(next.lanes[0].total).toBe(1);
    expect(next.lanes[1].total).toBe(2);
  });

  it('is its own inverse, which is what the snap-back on a failed write relies on', () => {
    const state = initial();

    const reverted = moveCard(moveCard(state, 'a', 'todo', 'doing'), 'a', 'doing', 'todo');

    expect(reverted.lanes[0].cards.map((c) => c.key)).toEqual(['b', 'a']);
    expect(reverted.lanes[0].total).toBe(2);
    expect(reverted.lanes[1].cards.map((c) => c.key)).toEqual(['x']);
    expect(reverted.lanes[1].total).toBe(1);
  });

  it('moves into the unassigned lane, addressed by the empty string', () => {
    const next = moveCard(initial(), 'a', 'todo', '');

    expect(next.lanes[2].cards.map((c) => c.key)).toEqual(['a']);
  });

  it('matches lanes case-insensitively, as every other lane lookup does', () => {
    const next = moveCard(initial(), 'a', 'ToDo', 'DOING');

    expect(next.lanes[1].cards.map((c) => c.key)).toEqual(['x', 'a']);
  });

  it('changes nothing when the source and target are the same lane', () => {
    const next = moveCard(initial(), 'a', 'todo', 'todo');

    expect(next.lanes[0].cards.map((c) => c.key)).toEqual(['a', 'b']);
    expect(next.lanes[0].total).toBe(2);
  });

  it('changes nothing when the card is not in the source lane', () => {
    const next = moveCard(initial(), 'x', 'todo', 'doing');

    expect(next.lanes[0].cards.map((c) => c.key)).toEqual(['a', 'b']);
    expect(next.lanes[1].cards.map((c) => c.key)).toEqual(['x']);
  });

  it('changes nothing when the target lane does not exist', () => {
    const next = moveCard(initial(), 'a', 'todo', 'archived');

    expect(next.lanes[0].cards.map((c) => c.key)).toEqual(['a', 'b']);
  });

  it('does not mutate the state it was given', () => {
    const state = initial();

    moveCard(state, 'a', 'todo', 'doing');

    expect(state.lanes[0].cards.map((c) => c.key)).toEqual(['a', 'b']);
    expect(state.lanes[1].cards.map((c) => c.key)).toEqual(['x']);
  });
});

describe('nextStateAfterSave', () => {
  it('turns a published card pending, because a save leaves the live version behind', () => {
    expect(nextStateAfterSave('published')).toBe('publishedPendingChanges');
  });

  it('leaves an already-pending card pending', () => {
    expect(nextStateAfterSave('publishedPendingChanges')).toBe('publishedPendingChanges');
  });

  it('leaves a draft a draft, since there is no published version to diverge from', () => {
    expect(nextStateAfterSave('draft')).toBe('draft');
  });
});

describe('applyCardState', () => {
  const initial = () =>
    toBoardState(board([lane('todo', ['a', 'b']), lane('doing', ['x'])]));

  it('replaces one card’s state wherever it sits', () => {
    const next = applyCardState(initial(), 'x', 'published');

    expect(next.lanes[1].cards[0].state).toBe('published');
  });

  it('leaves every other card alone', () => {
    const next = applyCardState(initial(), 'a', 'published');

    expect(next.lanes[0].cards[1].state).toBe('draft');
  });

  it('changes nothing for a card it does not hold', () => {
    const next = applyCardState(initial(), 'nope', 'published');

    expect(next.lanes.flatMap((l) => l.cards).map((c) => c.state)).toEqual(['draft', 'draft', 'draft']);
  });

  it('does not mutate the state it was given', () => {
    const state = initial();

    applyCardState(state, 'a', 'published');

    expect(state.lanes[0].cards[0].state).toBe('draft');
  });
});

describe('setCardSaving', () => {
  const initial = () => toBoardState(board([lane('todo', ['a', 'b'])]));

  it('marks one card as saving', () => {
    const next = setCardSaving(initial(), 'a', true);

    expect(next.lanes[0].cards[0].saving).toBe(true);
    expect(next.lanes[0].cards[1].saving).toBeUndefined();
  });

  it('clears the flag again once the write resolves', () => {
    const next = setCardSaving(setCardSaving(initial(), 'a', true), 'a', false);

    expect(next.lanes[0].cards[0].saving).toBe(false);
  });

  it('does not mutate the state it was given', () => {
    const state = initial();

    setCardSaving(state, 'a', true);

    expect(state.lanes[0].cards[0].saving).toBeUndefined();
  });
});

describe('pendingCards', () => {
  it('collects every card with unpublished changes, across lanes', () => {
    const state = toBoardState(
      board([
        lane('todo', [], { cards: [card('a', { state: 'publishedPendingChanges' }), card('b')] }),
        lane('doing', [], { cards: [card('c', { state: 'publishedPendingChanges' })] }),
      ]),
    );

    expect(pendingCards(state).map((c) => c.key)).toEqual(['a', 'c']);
  });

  it('excludes published and draft cards', () => {
    const state = toBoardState(
      board([lane('todo', [], { cards: [card('a', { state: 'published' }), card('b', { state: 'draft' })] })]),
    );

    expect(pendingCards(state)).toEqual([]);
  });

  it('is empty for a board with no lanes at all', () => {
    expect(pendingCards(toBoardState(board([])))).toEqual([]);
  });

  it('is scoped to the cards the board is holding, never to cards it has not paged in', () => {
    // A deliberate scope line, matching core's own bulk action being scoped to its selection: a lane with
    // 40 pending cards but only 25 loaded contributes 25.
    const state = toBoardState(
      board([
        lane('todo', [], {
          cards: [card('a', { state: 'publishedPendingChanges' })],
          total: 40,
          totalIsExact: true,
        }),
      ]),
    );

    expect(pendingCards(state)).toHaveLength(1);
  });
});

describe('invertMove', () => {
  it('swaps the lanes, so an undo is literally the move backwards', () => {
    expect(invertMove({ key: 'a', from: 'todo', to: 'doing' })).toEqual({ key: 'a', from: 'doing', to: 'todo' });
  });

  it('round-trips to the original move', () => {
    const move = { key: 'a', from: '', to: 'doing' };

    expect(invertMove(invertMove(move))).toEqual(move);
  });
});

describe('laneOfCard', () => {
  const state = toBoardState(board([lane('todo', ['a']), lane('doing', ['b'])]));

  it('finds the lane a card sits in', () => {
    expect(laneOfCard(state, 'b')).toBe('doing');
  });

  it('is nothing for a card the board is not showing', () => {
    expect(laneOfCard(state, 'nope')).toBeUndefined();
  });

  it('reports the unassigned lane by its empty value, not as absent', () => {
    const withUnassigned = toBoardState(board([lane('', ['c']), lane('todo', [])]));

    expect(laneOfCard(withUnassigned, 'c')).toBe('');
  });
});

describe('isMoveUndoable', () => {
  const move = { key: 'a', from: 'todo', to: 'doing' };

  it('allows an undo while the card is still where the move put it', () => {
    expect(isMoveUndoable(move, 'doing')).toBe(true);
  });

  it('refuses when the card has since moved elsewhere', () => {
    // Another editor, or a later move of the same card: writing the old source lane back would undo
    // something that is no longer there.
    expect(isMoveUndoable(move, 'done')).toBe(false);
  });

  it('refuses when the board is no longer showing the card', () => {
    expect(isMoveUndoable(move, undefined)).toBe(false);
  });

  it('compares lanes case-insensitively, as every other lane comparison does', () => {
    expect(isMoveUndoable(move, 'Doing')).toBe(true);
  });

  it('allows an undo of a move out of the unassigned lane', () => {
    expect(isMoveUndoable({ key: 'a', from: '', to: 'todo' }, 'todo')).toBe(true);
  });
});
