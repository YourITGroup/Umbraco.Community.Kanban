/** The suffix appended to a Collection data type's name when proposing a Kanban Board name. */
const BOARD_NAME_SUFFIX = 'Kanban Board';

/**
 * Proposes a name for a Kanban Board data type created from a Collection data type's Kanban tab.
 *
 * Derived from the Collection data type's own name so the pair reads as related in the data type
 * tree — "List View - bookingList" proposes "List View - bookingList Kanban Board". This is only a
 * modal preset, so the editor can still change it before saving.
 */
export function buildBoardDataTypeName(collectionDataTypeName: string | undefined | null): string {
  const trimmed = collectionDataTypeName?.trim();

  // An unnamed Collection data type — or one whose workspace has not resolved its name yet — would
  // otherwise propose a name with a leading space, or the literal word "undefined".
  if (!trimmed) return BOARD_NAME_SUFFIX;

  return `${trimmed} ${BOARD_NAME_SUFFIX}`;
}
