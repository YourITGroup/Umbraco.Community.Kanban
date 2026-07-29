/**
 * The next scrollLeft for a pointer-drag pan: dragging right (the pointer moves toward larger X)
 * reveals content to the left, so scrollLeft decreases by exactly the distance dragged, and vice
 * versa. Pure, so the direction of the scroll is tested without a DOM.
 */
export function panScrollLeft(startScrollLeft: number, startX: number, currentX: number): number {
  return startScrollLeft - (currentX - startX);
}

/**
 * Whether a pointerdown on `.lanes` should start a background pan. False for anything not aimed
 * at the container's own background — a descendant (a card, a lane), a non-primary mouse button
 * (right/middle click share the mouse's single pointerId, so pointerId cannot distinguish them),
 * touch (native scroll already handles it, with momentum), or a press in the scrollbar gutter
 * (target is still the scrolling element itself there, in Chromium, but this must not hijack the
 * native scrollbar thumb drag).
 */
export function shouldStartPan(input: {
  isSelfTarget: boolean;
  pointerType: string;
  button: number;
  isPrimary: boolean;
  offsetX: number;
  offsetY: number;
  clientWidth: number;
  clientHeight: number;
}): boolean {
  if (!input.isSelfTarget) return false;
  if (input.pointerType === 'touch') return false;
  if (input.button !== 0 || !input.isPrimary) return false;
  if (input.offsetX > input.clientWidth || input.offsetY > input.clientHeight) return false;
  return true;
}
