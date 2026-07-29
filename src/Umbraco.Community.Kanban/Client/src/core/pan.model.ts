/**
 * The next scrollLeft for a pointer-drag pan: dragging right (the pointer moves toward larger X)
 * reveals content to the left, so scrollLeft decreases by exactly the distance dragged, and vice
 * versa. Pure, so the direction of the scroll is tested without a DOM.
 */
export function panScrollLeft(startScrollLeft: number, startX: number, currentX: number): number {
  return startScrollLeft - (currentX - startX);
}
