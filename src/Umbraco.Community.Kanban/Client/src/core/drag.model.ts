/**
 * Whether a pointerdown on a card should start a drag.
 *
 * Takes plain values rather than a PointerEvent for the same reason `shouldStartPan` does: the decision
 * is then testable in the Node test environment, where there is no PointerEvent at all.
 *
 * Both `allowDrag` (the board's configuration) and `canUpdate` (this user, this card) are required, and
 * both come from the server — only the server knows either one, so no host attribute can supply them.
 * Touch is excluded because the board already scrolls horizontally on a touch swipe, with native
 * momentum; hijacking that to drag a card would cost more than it buys.
 */
export function shouldStartCardDrag(input: {
  allowDrag: boolean;
  canUpdate: boolean;
  saving: boolean;
  pointerType: string;
  button: number;
  isPrimary: boolean;
}): boolean {
  if (!input.allowDrag || !input.canUpdate) return false;
  if (input.saving) return false;
  if (input.pointerType === 'touch') return false;
  if (input.button !== 0 || !input.isPrimary) return false;
  return true;
}

/** One lane as the hit-test sees it: its identity, whether it would take a card, and where it is. */
export interface KanbanLaneHitTarget {
  value: string;
  acceptsDrops: boolean;
  rect: { left: number; top: number; right: number; bottom: number };
}

/**
 * The lane under a viewport point, or nothing.
 *
 * Ranges are half-open — `left <= x < right`, `top <= y < bottom` — because lane rects abut exactly, and
 * an inclusive upper bound would match two lanes at once on the shared edge. Only ever one lane
 * highlighted at a time is a property of the drag, not a coincidence of the geometry.
 */
export function laneAtPoint(
  x: number,
  y: number,
  lanes: readonly KanbanLaneHitTarget[],
): KanbanLaneHitTarget | undefined {
  return lanes.find(
    (lane) =>
      x >= lane.rect.left && x < lane.rect.right && y >= lane.rect.top && y < lane.rect.bottom,
  );
}

/**
 * Why a card could not be moved. 403 and 404 get their own wording because they are the two failures an
 * editor can act on — a permission changed under them, or someone else deleted the card — and "the
 * change could not be saved" would send them looking in the wrong place for both.
 */
export function moveFailureMessage(cardName: string, status: number | undefined): string {
  const reason =
    status === 403
      ? 'you no longer have permission to change it'
      : status === 404
        ? 'it no longer exists'
        : 'the change could not be saved';

  return `Couldn’t move ‘${cardName}’ — ${reason}.`;
}

/**
 * One summary line for a publish run, rather than one toast per card — publishing twenty cards must not
 * mean twenty notifications. Mirrors how core's own bulk publish reports a single count.
 */
export function formatPublishSummary(succeeded: number, total: number): string {
  if (succeeded === total) {
    return `Published ${succeeded} ${succeeded === 1 ? 'card' : 'cards'}.`;
  }

  return `Published ${succeeded} of ${total} — ${total - succeeded} failed.`;
}

/** Where the ghost's top-left corner goes. */
export interface KanbanGhostPosition {
  left: number;
  top: number;
}

/**
 * The ghost's corner, given the pointer and where within the card it was grabbed.
 *
 * Subtracting the grab offset is what stops the card jumping so its corner snaps to the cursor — it stays
 * held exactly where it was picked up. Negative results are legitimate: a drag can travel above or to the
 * left of the window.
 */
export function ghostPosition(input: {
  pointer: { x: number; y: number };
  grabOffset: { x: number; y: number };
}): KanbanGhostPosition {
  return {
    left: input.pointer.x - input.grabOffset.x,
    top: input.pointer.y - input.grabOffset.y,
  };
}
