/**
 * The pixel height the board's scroll viewport should take, so it ends at the bottom of the space it is
 * allowed to occupy.
 *
 * Measured in JS rather than expressed in CSS because no ancestor can supply it: the chain
 * `umb-collection-default` → `#router` → our host has no explicit height (`router-slot { height: 100% }`
 * resolves to `auto` against `#router`), and `#router` is sealed inside a shadow root, so there is no
 * reachable stylesheet to fix. Takes plain numbers so the arithmetic is testable without a DOM.
 *
 * `availableBottom` is the viewport coordinate the board must end at — deliberately not the window's
 * height. The workspace footer holding Save sits below the collection's own container, so a board sized
 * to the window overhangs it and makes the whole region scroll. See `boardAvailableBottom`.
 */
export function boardViewportHeight(input: {
  rectTop: number;
  availableBottom: number;
  gutter: number;
  min: number;
}): number {
  return Math.max(input.min, input.availableBottom - input.rectTop - input.gutter);
}

/** One ancestor as the container search sees it. */
export interface KanbanAncestorBox {
  /**
   * The viewport-relative bottom of its **content** box — padding and border excluded, since neither is
   * space a child may occupy.
   */
  bottom: number;
  /**
   * Whether it has a real box with a definite height. False for the layout's `router-slot` wrappers,
   * which report a percentage height and no box at all — exactly the broken chain that stops CSS from
   * sizing the board, and exactly what must be ignored when looking for what really bounds it.
   */
  definiteHeight: boolean;
  /**
   * Whether it clips its children (overflow-y is anything but visible). An element that cannot clip
   * cannot bound: a display:block wrapper with auto height still resolves its computed height to
   * pixels — its own content — so definiteHeight alone mistakes it for a container, feeding the
   * board's current height back into the measurement. The real container in every observed chain is
   * a scroll region.
   */
  clips: boolean;
}

/**
 * The viewport coordinate the board must end at: the lowest bottom edge among the ancestors that actually
 * bound it, never below the window.
 *
 * The window is the wrong answer on its own. The workspace's footer — the Save bar — sits below the
 * collection's container, so a board sized to the window overhangs by the footer's height and the whole
 * region grows a second scrollbar. The collection's container knows where the space ends; the wrappers
 * between us and it do not, and are filtered out by `definiteHeight`.
 *
 * Ancestors ending at or above `rectTop` are ignored as nonsense — they cannot be containing the board.
 */
export function boardAvailableBottom(input: {
  windowHeight: number;
  rectTop: number;
  ancestors: readonly KanbanAncestorBox[];
}): number {
  const bounded = input.ancestors
    .filter((ancestor) => ancestor.definiteHeight && ancestor.clips && ancestor.bottom > input.rectTop)
    .map((ancestor) => ancestor.bottom);

  return Math.min(input.windowHeight, ...bounded);
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
