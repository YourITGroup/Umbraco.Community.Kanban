/**
 * Moves one item within a list. Returns a new array; never mutates the input, and returns an
 * unchanged copy for any index that is out of range rather than throwing — a stored value with
 * fewer items than the UI last rendered is a reload race, not a programming error.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to) return [...items];
  if (from < 0 || from >= items.length) return [...items];
  if (to < 0 || to >= items.length) return [...items];

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);

  return next;
}
