import { describe, it, expect } from 'vitest';
import { addLane, moveLane, removeLaneAt, type KanbanManualLaneValue } from './manual-lane.model.js';

const lanes = (): KanbanManualLaneValue[] => [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'Doing' },
  { value: 'done', label: 'Done' },
];

describe('manual lane list operations', () => {
  it('appends a blank lane', () => {
    const next = addLane(lanes());

    expect(next).toHaveLength(4);
    expect(next[3]).toEqual({ value: '' });
  });

  it('does not mutate the input', () => {
    const original = lanes();
    addLane(original);

    expect(original).toHaveLength(3);
  });

  it('removes by index', () => {
    const next = removeLaneAt(lanes(), 1);

    expect(next.map((l) => l.value)).toEqual(['todo', 'done']);
  });

  it('ignores a remove at an out-of-range index', () => {
    const next = removeLaneAt(lanes(), 9);

    expect(next.map((l) => l.value)).toEqual(['todo', 'doing', 'done']);
  });

  it('moves a lane later', () => {
    const next = moveLane(lanes(), 0, 2);

    expect(next.map((l) => l.value)).toEqual(['doing', 'done', 'todo']);
  });

  it('moves a lane earlier', () => {
    const next = moveLane(lanes(), 2, 0);

    expect(next.map((l) => l.value)).toEqual(['done', 'todo', 'doing']);
  });

  it('ignores a move to the same index', () => {
    const next = moveLane(lanes(), 1, 1);

    expect(next.map((l) => l.value)).toEqual(['todo', 'doing', 'done']);
  });

  it('ignores a move with an out-of-range index', () => {
    const next = moveLane(lanes(), 0, 9);

    expect(next.map((l) => l.value)).toEqual(['todo', 'doing', 'done']);
  });
});
