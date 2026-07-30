/**
 * The next scroll offset for a pointer-drag pan on one axis: dragging in the positive direction
 * (the pointer moves toward larger X, or larger Y) reveals content on the negative side, so the
 * offset decreases by exactly the distance dragged, and vice versa. Pure, so the direction of the
 * scroll is tested without a DOM. Used for both scrollLeft (with clientX) and scrollTop (with
 * clientY) — the formula doesn't care which axis it's driving.
 */
export function panScrollOffset(startOffset: number, startAt: number, currentAt: number): number {
  return startOffset - (currentAt - startAt);
}

/**
 * Elements that own a press themselves, so a pan must not also start from one. A card drags; a button
 * or link is clicked. Everything else — the canvas, a lane, a lane header, the empty space under a
 * lane's cards — is background you can grab to pan.
 */
const PAN_BLOCKING_ELEMENTS = [
  'umb-community-kanban-card',
  'button',
  'uui-button',
  'a',
  'input',
  'textarea',
  'select',
];

/**
 * Whether a press that travelled this composed path may start a pan, given the path's local element
 * names innermost-first.
 *
 * A composed path rather than the event's target, because shadow retargeting makes the target useless
 * here: a press anywhere inside a lane's shadow tree — its background or a card within it — is reported
 * to the board as the lane host element either way, so the two cannot be told apart without the path.
 */
export function isPannablePath(path: readonly string[]): boolean {
  return !path.some((name) => PAN_BLOCKING_ELEMENTS.includes(name.toLowerCase()));
}

/**
 * Whether a pointerdown on `.viewport` should start a background pan. False for a press that something
 * else owns (see `isPannablePath`), a non-primary mouse button (right/middle click share the mouse's
 * single pointerId, so pointerId cannot distinguish them), touch (native scroll already handles it, with
 * momentum), or a press in the scrollbar gutter (target is still the scrolling element itself there, in
 * Chromium, but this must not hijack the native scrollbar thumb drag).
 */
export function shouldStartPan(input: {
  isPannableTarget: boolean;
  pointerType: string;
  button: number;
  isPrimary: boolean;
  offsetX: number;
  offsetY: number;
  clientWidth: number;
  clientHeight: number;
}): boolean {
  if (!input.isPannableTarget) return false;
  if (input.pointerType === 'touch') return false;
  if (input.button !== 0 || !input.isPrimary) return false;
  if (input.offsetX > input.clientWidth || input.offsetY > input.clientHeight) return false;
  return true;
}
