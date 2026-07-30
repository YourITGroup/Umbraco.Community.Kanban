/**
 * The pixel height the board's scroll viewport should take, so it ends at the bottom of the window.
 *
 * Measured in JS rather than expressed in CSS because no ancestor can supply it: the chain
 * `umb-collection-default` → `#router` → our host has no explicit height (`router-slot { height: 100% }`
 * resolves to `auto` against `#router`), and `#router` is sealed inside a shadow root, so there is no
 * reachable stylesheet to fix. Takes plain numbers so the arithmetic is testable without a DOM.
 */
export function boardViewportHeight(input: {
  rectTop: number;
  innerHeight: number;
  gutter: number;
  min: number;
}): number {
  return Math.max(input.min, input.innerHeight - input.rectTop - input.gutter);
}

/** Pixels to scroll the canvas this frame. Negative is left/up. */
export interface KanbanEdgeScroll {
  dx: number;
  dy: number;
}

/**
 * How far to scroll the canvas when a dragged card is held near a viewport edge, so a lane that is
 * off-screen when the drag starts is still reachable.
 *
 * The speed ramps linearly with proximity — `maxSpeed` at the edge, zero at `threshold` — because a flat
 * speed is either too slow to cross a wide board or too fast to stop on a lane. Beyond the edge the ramp
 * clamps at `maxSpeed` rather than accelerating: a drag can leave the viewport entirely.
 *
 * In a viewport narrower than twice the threshold both edges are in range at once; the leading edge wins,
 * which is arbitrary but stable, and such a viewport is below the minimum height anyway.
 */
export function edgeScrollDelta(input: {
  pointer: { x: number; y: number };
  rect: { left: number; top: number; right: number; bottom: number };
  threshold: number;
  maxSpeed: number;
}): KanbanEdgeScroll {
  return {
    dx: axisDelta(input.pointer.x, input.rect.left, input.rect.right, input.threshold, input.maxSpeed),
    dy: axisDelta(input.pointer.y, input.rect.top, input.rect.bottom, input.threshold, input.maxSpeed),
  };
}

function axisDelta(position: number, min: number, max: number, threshold: number, maxSpeed: number): number {
  const fromStart = position - min;
  const fromEnd = max - position;

  if (fromStart < threshold) return -ramp(fromStart, threshold, maxSpeed);
  if (fromEnd < threshold) return ramp(fromEnd, threshold, maxSpeed);

  return 0;
}

/** Zero at the threshold, `maxSpeed` at the edge and anywhere past it. */
function ramp(distance: number, threshold: number, maxSpeed: number): number {
  const proximity = Math.min(1, Math.max(0, (threshold - distance) / threshold));

  return maxSpeed * proximity;
}
