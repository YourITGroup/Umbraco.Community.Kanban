import { describe, it, expect } from 'vitest';
import {
  formatLaneTotal,
  laneHasMore,
  mergeLanePage,
  nextSkip,
  toBoardState,
} from './board.model.js';
import type { KanbanBoardLaneModel, KanbanBoardModel, KanbanCardModel } from '../data/kanban-board.types.js';

const card = (key: string): KanbanCardModel => ({
  key,
  name: key,
  contentTypeAlias: 'task',
  state: 'draft',
  canUpdate: false,
  properties: [],
});

const lane = (value: string, cards: string[], overrides: Partial<KanbanBoardLaneModel> = {}): KanbanBoardLaneModel => ({
  value,
  name: value,
  isUnassigned: value === '',
  acceptsDrops: value !== '',
  total: cards.length,
  totalIsExact: true,
  skip: 0,
  cards: cards.map(card),
  ...overrides,
});

const board = (lanes: KanbanBoardLaneModel[], overrides: Partial<KanbanBoardModel> = {}): KanbanBoardModel => ({
  lanes,
  truncated: false,
  childCount: lanes.reduce((sum, l) => sum + l.total, 0),
  ...overrides,
});

describe('toBoardState', () => {
  it('carries lanes, truncation and child count across', () => {
    const state = toBoardState(board([lane('todo', ['a'])], { truncated: true, childCount: 4000 }));

    expect(state.lanes.map((l) => l.value)).toEqual(['todo']);
    expect(state.truncated).toBe(true);
    expect(state.childCount).toBe(4000);
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
