import { describe, it, expect } from 'vitest';
import { panScrollLeft, shouldStartPan } from './pan.model.js';

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

describe('shouldStartPan', () => {
  const background = {
    isSelfTarget: true,
    pointerType: 'mouse',
    button: 0,
    isPrimary: true,
    offsetX: 10,
    offsetY: 10,
    clientWidth: 400,
    clientHeight: 300,
  };

  it('allows a primary mouse button press on the background', () => {
    expect(shouldStartPan(background)).toBe(true);
  });

  it('excludes a press that did not target the container itself (a card or a lane)', () => {
    expect(shouldStartPan({ ...background, isSelfTarget: false })).toBe(false);
  });

  it('excludes touch, since native scrolling already handles it with momentum', () => {
    expect(shouldStartPan({ ...background, pointerType: 'touch' })).toBe(false);
  });

  it('excludes a non-primary mouse button (right-click)', () => {
    expect(shouldStartPan({ ...background, button: 2 })).toBe(false);
  });

  it('excludes a pointer that is not the primary pointer of its type', () => {
    expect(shouldStartPan({ ...background, isPrimary: false })).toBe(false);
  });

  it('excludes a press in the scrollbar gutter (offsetX beyond clientWidth)', () => {
    expect(shouldStartPan({ ...background, offsetX: 410, clientWidth: 400 })).toBe(false);
  });

  it('excludes a press in the scrollbar gutter (offsetY beyond clientHeight)', () => {
    expect(shouldStartPan({ ...background, offsetY: 310, clientHeight: 300 })).toBe(false);
  });
});
