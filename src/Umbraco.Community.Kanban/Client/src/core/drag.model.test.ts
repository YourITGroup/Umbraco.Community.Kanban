import { describe, it, expect } from 'vitest';
import {
  formatPublishSummary,
  ghostPosition,
  laneAtPoint,
  moveFailureMessage,
  shouldStartCardDrag,
  type KanbanLaneHitTarget,
} from './drag.model.js';

describe('shouldStartCardDrag', () => {
  const draggable = {
    allowDrag: true,
    canUpdate: true,
    saving: false,
    pointerType: 'mouse',
    button: 0,
    isPrimary: true,
  };

  it('allows a primary mouse press on an updatable card of a drag-enabled board', () => {
    expect(shouldStartCardDrag(draggable)).toBe(true);
  });

  it('refuses when the board’s configuration disables dragging', () => {
    expect(shouldStartCardDrag({ ...draggable, allowDrag: false })).toBe(false);
  });

  it('refuses when the user cannot update this card', () => {
    // Both halves are required: only the server knows the configuration AND the per-card permission.
    expect(shouldStartCardDrag({ ...draggable, canUpdate: false })).toBe(false);
  });

  it('refuses while a write for this card is still in flight', () => {
    expect(shouldStartCardDrag({ ...draggable, saving: true })).toBe(false);
  });

  it('refuses touch, which scrolls the board instead', () => {
    expect(shouldStartCardDrag({ ...draggable, pointerType: 'touch' })).toBe(false);
  });

  it('refuses a non-primary mouse button (right-click)', () => {
    // Right and middle click share the mouse's single pointerId, so pointerId cannot distinguish them.
    expect(shouldStartCardDrag({ ...draggable, button: 2 })).toBe(false);
  });

  it('refuses a pointer that is not the primary pointer of its type', () => {
    expect(shouldStartCardDrag({ ...draggable, isPrimary: false })).toBe(false);
  });
});

describe('laneAtPoint', () => {
  const at = (value: string, left: number, right: number, acceptsDrops = true): KanbanLaneHitTarget => ({
    value,
    acceptsDrops,
    rect: { left, top: 0, right, bottom: 100 },
  });

  const lanes = [at('todo', 0, 100), at('doing', 100, 200), at('', 200, 300, false)];

  it('finds the lane the point falls inside', () => {
    expect(laneAtPoint(150, 50, lanes)?.value).toBe('doing');
  });

  it('reports whether that lane would take the card', () => {
    expect(laneAtPoint(250, 50, lanes)?.acceptsDrops).toBe(false);
  });

  it('is nothing when the point is beyond every lane horizontally', () => {
    expect(laneAtPoint(400, 50, lanes)).toBeUndefined();
  });

  it('is nothing when the point is above or below the lanes', () => {
    expect(laneAtPoint(150, -5, lanes)).toBeUndefined();
    expect(laneAtPoint(150, 105, lanes)).toBeUndefined();
  });

  it('includes the leading edges and excludes the trailing ones, so touching lanes never both match', () => {
    // Lane rects abut exactly; a half-open range is what keeps "only ever one lane highlighted" true.
    expect(laneAtPoint(100, 50, lanes)?.value).toBe('doing');
    expect(laneAtPoint(99.9, 50, lanes)?.value).toBe('todo');
  });

  it('is nothing when there are no lanes', () => {
    expect(laneAtPoint(50, 50, [])).toBeUndefined();
  });
});

describe('moveFailureMessage', () => {
  it('says the permission is gone on a 403', () => {
    expect(moveFailureMessage('Write the spec', 403)).toBe(
      'Couldn’t move ‘Write the spec’ — you no longer have permission to change it.',
    );
  });

  it('says the card is gone on a 404', () => {
    expect(moveFailureMessage('Write the spec', 404)).toBe(
      'Couldn’t move ‘Write the spec’ — it no longer exists.',
    );
  });

  it('falls back to a generic reason for anything else', () => {
    expect(moveFailureMessage('Write the spec', 500)).toBe(
      'Couldn’t move ‘Write the spec’ — the change could not be saved.',
    );
  });

  it('falls back to a generic reason when there is no status at all', () => {
    expect(moveFailureMessage('Write the spec', undefined)).toBe(
      'Couldn’t move ‘Write the spec’ — the change could not be saved.',
    );
  });
});

describe('formatPublishSummary', () => {
  it('reports a clean run as a plain count', () => {
    expect(formatPublishSummary(8, 8)).toBe('Published 8 cards.');
  });

  it('uses the singular for one card', () => {
    expect(formatPublishSummary(1, 1)).toBe('Published 1 card.');
  });

  it('reports a partial run in one line rather than one toast per card', () => {
    expect(formatPublishSummary(6, 8)).toBe('Published 6 of 8 — 2 failed.');
  });

  it('reports a total failure the same way', () => {
    expect(formatPublishSummary(0, 3)).toBe('Published 0 of 3 — 3 failed.');
  });
});

describe('ghostPosition', () => {
  it('keeps the card under the point where it was grabbed', () => {
    // Grabbed 30px in and 12px down from the card's own top-left; the ghost's corner sits there still.
    expect(ghostPosition({ pointer: { x: 500, y: 400 }, grabOffset: { x: 30, y: 12 } })).toEqual({
      left: 470,
      top: 388,
    });
  });

  it('places the corner at the pointer when the card was grabbed by its corner', () => {
    expect(ghostPosition({ pointer: { x: 500, y: 400 }, grabOffset: { x: 0, y: 0 } })).toEqual({
      left: 500,
      top: 400,
    });
  });

  it('allows negative coordinates, so a drag above or left of the window still tracks', () => {
    expect(ghostPosition({ pointer: { x: 10, y: 5 }, grabOffset: { x: 40, y: 20 } })).toEqual({
      left: -30,
      top: -15,
    });
  });
});
