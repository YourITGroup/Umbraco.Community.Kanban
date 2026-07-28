import { describe, it, expect } from 'vitest';
import { addCardProperty, moveCardProperty, removeCardPropertyAt } from './card-property.model.js';

describe('addCardProperty', () => {
  it('appends, so the newest property shows last on the card', () => {
    expect(addCardProperty(['company'], 'status')).toEqual(['company', 'status']);
  });

  it('drops a repeat rather than showing one property twice', () => {
    expect(addCardProperty(['status'], 'status')).toEqual(['status']);
  });

  it('treats a differently-cased repeat as the same property', () => {
    expect(addCardProperty(['status'], 'Status')).toEqual(['status']);
  });

  it('trims, so a stray space cannot smuggle in a near-duplicate', () => {
    expect(addCardProperty([], '  status  ')).toEqual(['status']);
    expect(addCardProperty(['status'], ' status ')).toEqual(['status']);
  });

  it.each(['', '   '])('ignores %p', (alias) => {
    expect(addCardProperty(['status'], alias)).toEqual(['status']);
  });

  it('never mutates the list it was given', () => {
    const aliases = ['status'];

    addCardProperty(aliases, 'company');

    expect(aliases).toEqual(['status']);
  });
});

describe('removeCardPropertyAt', () => {
  it('removes the property at the index', () => {
    expect(removeCardPropertyAt(['company', 'status'], 0)).toEqual(['status']);
  });

  it.each([-1, 2])('leaves the list alone for out-of-range index %p', (index) => {
    expect(removeCardPropertyAt(['company', 'status'], index)).toEqual(['company', 'status']);
  });
});

describe('moveCardProperty', () => {
  it('reorders, because order is the order shown on a card', () => {
    expect(moveCardProperty(['company', 'status'], 1, 0)).toEqual(['status', 'company']);
  });

  it('leaves the list alone for an out-of-range index', () => {
    expect(moveCardProperty(['company', 'status'], 0, 5)).toEqual(['company', 'status']);
  });
});
