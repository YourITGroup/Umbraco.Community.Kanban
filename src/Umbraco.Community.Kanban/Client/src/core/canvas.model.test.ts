import { describe, it, expect } from 'vitest';
import { boardAvailableBottom, boardViewportHeight, edgeScrollDelta } from './canvas.model.js';

describe('boardViewportHeight', () => {
  it('fills the space below the board’s top edge, less the bottom gutter', () => {
    expect(boardViewportHeight({ rectTop: 200, availableBottom: 1000, gutter: 24, min: 320 })).toBe(776);
  });

  it('clamps to the minimum when the board starts near the bottom of the space', () => {
    // 1000 - 900 - 24 = 76, which is uselessly short; the floor wins and the region scrolls instead.
    expect(boardViewportHeight({ rectTop: 900, availableBottom: 1000, gutter: 24, min: 320 })).toBe(320);
  });

  it('clamps to the minimum in a space shorter than the minimum', () => {
    expect(boardViewportHeight({ rectTop: 0, availableBottom: 200, gutter: 24, min: 320 })).toBe(320);
  });

  it('subtracts the gutter, so the board never overhangs its container', () => {
    const withGutter = boardViewportHeight({ rectTop: 100, availableBottom: 1000, gutter: 24, min: 320 });
    const without = boardViewportHeight({ rectTop: 100, availableBottom: 1000, gutter: 0, min: 320 });

    expect(without - withGutter).toBe(24);
  });
});

describe('boardAvailableBottom', () => {
  it('falls back to the window when no ancestor bounds the board', () => {
    expect(boardAvailableBottom({ windowHeight: 1201, rectTop: 272, ancestors: [] })).toBe(1201);
  });

  it('uses the container’s bottom rather than the window, so the Save bar is not overhung', () => {
    // The real measurements from the backoffice: the collection's container ends 54px above the window,
    // which is the workspace footer, and sizing to the window is what produced a second scrollbar.
    expect(
      boardAvailableBottom({
        windowHeight: 1201,
        rectTop: 272,
        ancestors: [
          { bottom: 1147, definiteHeight: true, clips: true },
          { bottom: 1201, definiteHeight: true, clips: true },
        ],
      }),
    ).toBe(1147);
  });

  it('ignores the boxless router-slot wrappers between the board and its container', () => {
    // These report a percentage height and no box; believing their bottoms would defeat the whole search.
    expect(
      boardAvailableBottom({
        windowHeight: 1201,
        rectTop: 272,
        ancestors: [
          { bottom: 1201, definiteHeight: false, clips: true },
          { bottom: 1147, definiteHeight: true, clips: true },
        ],
      }),
    ).toBe(1147);
  });

  it('takes the lowest bounding ancestor when several bound it', () => {
    expect(
      boardAvailableBottom({
        windowHeight: 1201,
        rectTop: 272,
        ancestors: [
          { bottom: 1147, definiteHeight: true, clips: true },
          { bottom: 900, definiteHeight: true, clips: true },
        ],
      }),
    ).toBe(900);
  });

  it('ignores an ancestor ending above the board, which cannot be containing it', () => {
    // umb-split-panel reports a 0-height box in the real chain; treating it as the container would
    // collapse the board to its minimum height.
    expect(
      boardAvailableBottom({
        windowHeight: 1201,
        rectTop: 272,
        ancestors: [
          { bottom: 0, definiteHeight: true, clips: true },
          { bottom: 1147, definiteHeight: true, clips: true },
        ],
      }),
    ).toBe(1147);
  });

  it('ignores a content-height ancestor that does not clip, whatever height it reports', () => {
    // The workspace-view host is display:block with auto height: its computed height still resolves to
    // pixels — its own content — so definiteHeight alone believes it. An element with overflow visible
    // cannot clip its children, so it cannot be what bounds the board; trusting it fed the board's own
    // height back into the measurement and pinned the tab's board at its minimum height.
    expect(
      boardAvailableBottom({
        windowHeight: 1201,
        rectTop: 272,
        ancestors: [
          { bottom: 620, definiteHeight: true, clips: false },
          { bottom: 1147, definiteHeight: true, clips: true },
        ],
      }),
    ).toBe(1147);
  });

  it('never returns more than the window, however tall an ancestor claims to be', () => {
    expect(
      boardAvailableBottom({
        windowHeight: 1201,
        rectTop: 272,
        ancestors: [{ bottom: 5000, definiteHeight: true, clips: true }],
      }),
    ).toBe(1201);
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
