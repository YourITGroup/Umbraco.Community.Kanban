import { describe, it, expect } from 'vitest';
import { panScrollLeft } from './pan.model.js';

describe('panScrollLeft', () => {
  it('decreases scrollLeft when the pointer moves right', () => {
    // Dragging right reveals content to the left, which is a smaller scrollLeft.
    expect(panScrollLeft(100, 50, 80)).toBe(70);
  });

  it('increases scrollLeft when the pointer moves left', () => {
    expect(panScrollLeft(100, 80, 50)).toBe(130);
  });

  it('leaves scrollLeft unchanged when the pointer has not moved', () => {
    expect(panScrollLeft(100, 50, 50)).toBe(100);
  });
});
