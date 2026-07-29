import { describe, it, expect } from 'vitest';
import { formatChildOverflow } from './card-children.model.js';

describe('formatChildOverflow', () => {
  it('is nothing when every child is shown', () => {
    expect(formatChildOverflow(3, 3, true)).toBeUndefined();
  });

  it('is nothing when there are no children at all', () => {
    expect(formatChildOverflow(0, 0, true)).toBeUndefined();
  });

  it('counts the children beyond the ones shown', () => {
    expect(formatChildOverflow(8, 5, true)).toBe('+3 more');
  });

  it('says "or more" when the total is only a lower bound', () => {
    expect(formatChildOverflow(8, 5, false)).toBe('+3 or more');
  });

  it('still reports more when a capped total matches what is shown', () => {
    // The board hit its grandchild cap, so five loaded means "at least five" — there may be a sixth.
    expect(formatChildOverflow(5, 5, false)).toBe('and more');
  });

  it('never reports a negative overflow', () => {
    expect(formatChildOverflow(2, 5, true)).toBeUndefined();
  });
});
