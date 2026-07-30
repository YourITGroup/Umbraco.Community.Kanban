import { describe, it, expect } from 'vitest';
import { boardViewportHeight, edgeScrollDelta } from './canvas.model.js';

describe('boardViewportHeight', () => {
  it('fills the window below the board’s top edge, less the bottom gutter', () => {
    expect(boardViewportHeight({ rectTop: 200, innerHeight: 1000, gutter: 24, min: 320 })).toBe(776);
  });

  it('clamps to the minimum when the board starts near the bottom of the window', () => {
    // 1000 - 900 - 24 = 76, which is uselessly short; the floor wins and the page scrolls instead.
    expect(boardViewportHeight({ rectTop: 900, innerHeight: 1000, gutter: 24, min: 320 })).toBe(320);
  });

  it('clamps to the minimum in a window shorter than the minimum', () => {
    expect(boardViewportHeight({ rectTop: 0, innerHeight: 200, gutter: 24, min: 320 })).toBe(320);
  });

  it('subtracts the gutter, so the board never overhangs the window', () => {
    const withGutter = boardViewportHeight({ rectTop: 100, innerHeight: 1000, gutter: 24, min: 320 });
    const without = boardViewportHeight({ rectTop: 100, innerHeight: 1000, gutter: 0, min: 320 });

    expect(without - withGutter).toBe(24);
  });
});

describe('edgeScrollDelta', () => {
  const rect = { left: 100, top: 100, right: 900, bottom: 700 };
  const at = (x: number, y: number) =>
    edgeScrollDelta({ pointer: { x, y }, rect, threshold: 60, maxSpeed: 20 });

  it('does not scroll from the middle of the viewport', () => {
    expect(at(500, 400)).toEqual({ dx: 0, dy: 0 });
  });

  it('scrolls left near the left edge, and only on that axis', () => {
    const delta = at(130, 400);

    expect(delta.dx).toBeLessThan(0);
    expect(delta.dy).toBe(0);
  });

  it('scrolls right near the right edge', () => {
    expect(at(870, 400).dx).toBeGreaterThan(0);
  });

  it('scrolls up near the top edge', () => {
    expect(at(500, 130).dy).toBeLessThan(0);
  });

  it('scrolls down near the bottom edge', () => {
    expect(at(500, 670).dy).toBeGreaterThan(0);
  });

  it('scrolls both axes at once in a corner', () => {
    const delta = at(120, 120);

    expect(delta.dx).toBeLessThan(0);
    expect(delta.dy).toBeLessThan(0);
  });

  it('ramps: closer to the edge scrolls faster', () => {
    // The ramp is what makes the speed controllable — a flat speed is either too slow to cross a
    // wide board or too fast to stop on a lane.
    expect(Math.abs(at(105, 400).dx)).toBeGreaterThan(Math.abs(at(155, 400).dx));
  });

  it('reaches exactly maxSpeed at the edge', () => {
    expect(at(100, 400).dx).toBe(-20);
  });

  it('never exceeds maxSpeed, even well outside the viewport', () => {
    // A drag can leave the viewport entirely; the ramp must clamp rather than accelerate forever.
    expect(at(-500, 400).dx).toBe(-20);
    expect(at(2000, 400).dx).toBe(20);
  });

  it('is zero exactly at the threshold', () => {
    expect(at(160, 400).dx).toBe(0);
  });
});
