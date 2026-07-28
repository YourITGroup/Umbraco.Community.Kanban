import { moveItem } from '../move-item.js';

/**
 * Appends a property alias. Returns a new array; never mutates the input.
 *
 * A repeat of one already listed is dropped rather than added: the same property twice on a card is
 * never what an editor meant, and two content types can offer the same alias, so the picker can
 * legitimately hand back one that is already there. Matched without regard to case, because a card
 * showing "status" and "Status" would read as two properties while resolving to one.
 */
export function addCardProperty(aliases: readonly string[], alias: string): string[] {
  const trimmed = alias?.trim();
  if (!trimmed) return [...aliases];

  const existing = aliases.some((existingAlias) => existingAlias.toLowerCase() === trimmed.toLowerCase());

  return existing ? [...aliases] : [...aliases, trimmed];
}

export function removeCardPropertyAt(aliases: readonly string[], index: number): string[] {
  if (index < 0 || index >= aliases.length) return [...aliases];

  return aliases.filter((_, i) => i !== index);
}

/** Moves a property. Order is the order the summary items appear on a card, so it is not cosmetic. */
export function moveCardProperty(aliases: readonly string[], from: number, to: number): string[] {
  return moveItem(aliases, from, to);
}
