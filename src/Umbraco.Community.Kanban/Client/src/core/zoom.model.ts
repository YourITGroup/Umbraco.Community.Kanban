/**
 * Ctrl + wheel zoom for the board canvas.
 *
 * The scale is applied as CSS `zoom` on the canvas, not a `transform: scale`, and that choice is what
 * keeps the rest of the board working unchanged: `zoom` scales the *layout*, so the canvas' scroll extent
 * grows and shrinks with it, `getBoundingClientRect` reports where lanes really are on screen — which is
 * all the drag hit-test and the edge auto-scroll read — and nothing has to be re-expressed in canvas
 * coordinates. A transform would have left the scroll extent at 100% and moved the lanes out from under
 * every viewport-coordinate measurement in `drag.model.ts` and `canvas.model.ts`.
 *
 * Everything here is plain arithmetic so the anchoring and the clamping are testable without a DOM.
 */

/** Zoomed out far enough to see a wide board, without lane text becoming decorative. */
export const KANBAN_ZOOM_MIN = 0.5;

/** Zoomed in far enough to read a dense card comfortably. Past this the board holds one lane. */
export const KANBAN_ZOOM_MAX = 2;

export const KANBAN_ZOOM_DEFAULT = 1;

/**
 * How fast a wheel notch zooms. Applied to an exponential, so a notch is a *proportion* of the current
 * scale rather than a fixed step — otherwise the same notch is a small change when zoomed in and a huge
 * one when zoomed out, and zoom-in/zoom-out do not cancel out.
 *
 * A mouse notch is ~100px, so it changes the scale by about a sixth.
 */
const WHEEL_SENSITIVITY = 0.0015;

/** Steps finer than this are not worth a re-render — and rounding is what stops float drift. */
const ZOOM_PRECISION = 1000;

/** A line-mode wheel delta in pixels. Firefox reports lines; the exact line height barely matters here. */
const LINE_HEIGHT = 16;

/** A page-mode wheel delta in pixels. Rare — only some remote-desktop and accessibility setups send it. */
const PAGE_HEIGHT = 400;

/**
 * Whether a wheel event means "zoom" rather than "scroll".
 *
 * A trackpad pinch arrives as a wheel event with `ctrlKey` set even though no key is held — a browser
 * convention, and exactly the behaviour wanted here: pinch-to-zoom for free. `metaKey` is included for
 * Cmd + wheel, which macOS users reach for first and which the browser would otherwise spend on zooming
 * the whole backoffice.
 */
export function isZoomGesture(event: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return event.ctrlKey || event.metaKey;
}

/** A wheel delta in pixels, whatever unit the browser reported it in. */
export function wheelDeltaPixels(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) return deltaY * LINE_HEIGHT;
  if (deltaMode === 2) return deltaY * PAGE_HEIGHT;

  return deltaY;
}

/**
 * The scale after a wheel gesture. Wheeling down (a positive delta, the scroll-away direction) zooms out,
 * matching every other zoomable surface. Clamped, so holding the wheel at either end is inert rather than
 * shrinking the board to nothing.
 */
export function nextZoom(current: number, deltaPixels: number): number {
  const scaled = current * Math.exp(-deltaPixels * WHEEL_SENSITIVITY);
  const clamped = Math.min(KANBAN_ZOOM_MAX, Math.max(KANBAN_ZOOM_MIN, scaled));

  return Math.round(clamped * ZOOM_PRECISION) / ZOOM_PRECISION;
}

/**
 * The scroll offset that keeps whatever is under the pointer under the pointer, on one axis.
 *
 * Without this the canvas grows from its top-left corner, so zooming in on a lane at the right of the
 * board sends that lane off-screen and the editor has to chase it. Works for both axes: `scroll` and
 * `pointerOffset` are scrollLeft with an X offset, or scrollTop with a Y offset.
 *
 * `pointerOffset` is measured from the viewport's content-box edge, in screen pixels; `scroll` is in the
 * scroll container's own (unzoomed) pixels, which is what makes the division by `from` the whole trick:
 * it recovers the canvas-local coordinate under the pointer, which must not move.
 */
export function zoomScrollOffset(input: {
  scroll: number;
  pointerOffset: number;
  from: number;
  to: number;
}): number {
  const canvasCoordinate = (input.scroll + input.pointerOffset) / input.from;

  // Never negative: a negative assignment is clamped to 0 by the browser anyway, and returning it would
  // make the arithmetic disagree with what the element ends up doing.
  return Math.max(0, canvasCoordinate * input.to - input.pointerOffset);
}
