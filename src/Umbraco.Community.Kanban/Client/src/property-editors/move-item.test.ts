import { describe, it, expect } from 'vitest';
import { moveItem } from './move-item.js';

describe('moveItem', () => {
  it('moves an item forwards', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('moves an item backwards', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it.each([
    [0, 0],
    [-1, 1],
    [1, 3],
    [3, 1],
  ])('returns an unchanged copy for (%p, %p)', (from, to) => {
    const items = ['a', 'b', 'c'];
    const next = moveItem(items, from, to);

    expect(next).toEqual(items);
    expect(next).not.toBe(items);
  });

  it('never mutates the list it was given', () => {
    const items = ['a', 'b'];

    moveItem(items, 0, 1);

    expect(items).toEqual(['a', 'b']);
  });
});
