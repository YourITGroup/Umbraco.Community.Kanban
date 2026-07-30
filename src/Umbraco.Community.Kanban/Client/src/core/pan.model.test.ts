import { describe, it, expect } from 'vitest';
import { isPannablePath, panScrollOffset, shouldStartPan } from './pan.model.js';

describe('panScrollOffset', () => {
  it('decreases the offset when the pointer moves in the positive direction', () => {
    // Dragging right reveals content to the left, which is a smaller scrollLeft — the same
    // formula applies to scrollTop when dragging down reveals content above.
    expect(panScrollOffset(100, 50, 80)).toBe(70);
  });

  it('increases the offset when the pointer moves in the negative direction', () => {
    expect(panScrollOffset(100, 80, 50)).toBe(130);
  });

  it('leaves the offset unchanged when the pointer has not moved', () => {
    expect(panScrollOffset(100, 50, 50)).toBe(100);
  });
});

describe('isPannablePath', () => {
  // The composed path's local names, innermost first — what the board can see of a press that began
  // inside a lane's shadow tree.
  it('allows a press on the canvas itself', () => {
    expect(isPannablePath(['div', 'div'])).toBe(true);
  });

  it('allows a press on a lane’s own background, so the board pans from inside a lane', () => {
    expect(isPannablePath(['div', 'umb-community-kanban-lane', 'div', 'div'])).toBe(true);
  });

  it('allows a press on a lane header, which is not interactive', () => {
    expect(isPannablePath(['span', 'div', 'umb-community-kanban-lane', 'div'])).toBe(true);
  });

  it('refuses a press on a card, which drags instead', () => {
    expect(
      isPannablePath(['div', 'umb-community-kanban-card', 'div', 'umb-community-kanban-lane', 'div']),
    ).toBe(false);
  });

  it('refuses a press on a button, so Show more still just clicks', () => {
    expect(isPannablePath(['uui-button', 'div', 'umb-community-kanban-lane', 'div'])).toBe(false);
  });

  it('refuses a press on a native button or link', () => {
    expect(isPannablePath(['button', 'div'])).toBe(false);
    expect(isPannablePath(['a', 'div'])).toBe(false);
  });

  it('ignores case, since composedPath local names are lowercase but callers may not be', () => {
    expect(isPannablePath(['UMB-COMMUNITY-KANBAN-CARD', 'div'])).toBe(false);
  });
});

describe('shouldStartPan', () => {
  const background = {
    isPannableTarget: true,
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

  it('excludes a press on something that owns the gesture itself, such as a card', () => {
    expect(shouldStartPan({ ...background, isPannableTarget: false })).toBe(false);
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
