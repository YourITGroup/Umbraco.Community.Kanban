import { describe, it, expect } from 'vitest';
import { toBoardState } from './board.model.js';
import { applyCardResult } from './realtime.model.js';
import type { KanbanCardOutcome } from '../data/kanban-data-source.js';
import type { KanbanBoardModel, KanbanCardModel } from '../data/kanban-board.types.js';

function card(key: string, overrides: Partial<KanbanCardModel> = {}): KanbanCardModel {
  return {
    key,
    name: `Card ${key}`,
    contentTypeAlias: 'task',
    contentTypeKey: 'ct-1',
    state: 'published',
    canUpdate: true,
    canCreate: false,
    children: [],
    childTotal: 0,
    childTotalIsExact: true,
    properties: [],
    ...overrides,
  };
}

function lane(
  value: string,
  cardKeys: string[],
  overrides: Partial<KanbanBoardModel['lanes'][number]> = {},
) {
  return {
    value,
    name: value || 'Unassigned',
    isUnassigned: value === '',
    acceptsDrops: value !== '',
    total: cardKeys.length,
    totalIsExact: true,
    skip: 0,
    cards: cardKeys.map((key) => card(key)),
    ...overrides,
  };
}

function board(lanes: ReturnType<typeof lane>[]): KanbanBoardModel {
  return { lanes, truncated: false, childCount: 0, showChildItems: false, allowDrag: true };
}

const child = (laneValue: string, c: KanbanCardModel): KanbanCardOutcome => ({
  kind: 'child',
  laneValue,
  card: c,
});

describe('applyCardResult', () => {
  const initial = () => toBoardState(board([lane('todo', ['a', 'b']), lane('doing', ['x']), lane('', [])]));

  it('replaces a held card in place when its lane is unchanged', () => {
    const fresh = card('a', { name: 'Renamed', state: 'publishedPendingChanges' });

    const result = applyCardResult(initial(), 'a', child('todo', fresh));

    expect(result.changed).toBe(true);
    const todo = result.state.lanes.find((l) => l.value === 'todo')!;
    expect(todo.cards.map((c) => c.key)).toEqual(['a', 'b']);
    expect(todo.cards[0].name).toBe('Renamed');
    expect(todo.total).toBe(2);
  });

  it('moves a held card between lanes, carrying the totals with it', () => {
    const result = applyCardResult(initial(), 'a', child('doing', card('a')));

    const todo = result.state.lanes.find((l) => l.value === 'todo')!;
    const doing = result.state.lanes.find((l) => l.value === 'doing')!;
    expect(todo.cards.map((c) => c.key)).toEqual(['b']);
    expect(todo.total).toBe(1);
    expect(doing.cards.map((c) => c.key)).toEqual(['x', 'a']);
    expect(doing.total).toBe(2);
  });

  it('matches the lane case-insensitively, as the server does', () => {
    const result = applyCardResult(initial(), 'a', child('DOING', card('a')));

    expect(result.state.lanes.find((l) => l.value === 'doing')!.cards.map((c) => c.key)).toEqual(['x', 'a']);
  });

  it('appends an unknown card to the end of its lane', () => {
    const result = applyCardResult(initial(), 'new', child('todo', card('new')));

    const todo = result.state.lanes.find((l) => l.value === 'todo')!;
    expect(todo.cards.map((c) => c.key)).toEqual(['a', 'b', 'new']);
    expect(todo.total).toBe(3);
  });

  it('routes an unmatched lane value to the unassigned lane, as the board composer does', () => {
    const result = applyCardResult(initial(), 'new', child('archived', card('new')));

    const unassigned = result.state.lanes.find((l) => l.isUnassigned)!;
    expect(unassigned.cards.map((c) => c.key)).toEqual(['new']);
    expect(unassigned.total).toBe(1);
  });

  it('removes a held card on not-child', () => {
    const result = applyCardResult(initial(), 'a', { kind: 'not-child' });

    expect(result.changed).toBe(true);
    const todo = result.state.lanes.find((l) => l.value === 'todo')!;
    expect(todo.cards.map((c) => c.key)).toEqual(['b']);
    expect(todo.total).toBe(1);
  });

  it('removes a held card on gone', () => {
    const result = applyCardResult(initial(), 'x', { kind: 'gone' });

    expect(result.state.lanes.find((l) => l.value === 'doing')!.cards).toEqual([]);
  });

  it('does nothing for an unheld key on gone', () => {
    const state = initial();

    const result = applyCardResult(state, 'stranger', { kind: 'gone' });

    expect(result.changed).toBe(false);
    expect(result.state).toBe(state);
  });

  it('does nothing on error — a failed fetch never removes a card', () => {
    const state = initial();

    const result = applyCardResult(state, 'a', { kind: 'error' });

    expect(result.changed).toBe(false);
    expect(result.state).toBe(state);
  });

  it('leaves a card with a write in flight alone — that is our own echo', () => {
    const state = toBoardState(
      board([lane('todo', [], { cards: [card('a', { saving: true })], total: 1 })]),
    );

    const result = applyCardResult(state, 'a', child('todo', card('a', { name: 'Echo' })));

    expect(result.changed).toBe(false);
    expect(result.state.lanes[0].cards[0].name).toBe('Card a');
  });

  it('preserves totalIsExact through a move', () => {
    const state = toBoardState(
      board([lane('todo', ['a'], { total: 30, totalIsExact: false }), lane('doing', ['x'])]),
    );

    const result = applyCardResult(state, 'a', child('doing', card('a')));

    const todo = result.state.lanes.find((l) => l.value === 'todo')!;
    expect(todo.total).toBe(29);
    expect(todo.totalIsExact).toBe(false);
  });

  it('does nothing when the board has no lane for the value and no unassigned lane', () => {
    const state = toBoardState(board([lane('todo', ['a'])]));

    const result = applyCardResult(state, 'new', child('archived', card('new')));

    expect(result.changed).toBe(false);
  });
});
