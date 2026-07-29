/**
 * One summary item on a card.
 *
 * Mirrors Umbraco's `UmbCollectionColumnConfiguration`, including `isSystem` as `0`/`1` rather than a
 * boolean, so the List View's column control and this value need no translation between them.
 */
export interface KanbanCardPropertyValue {
  alias: string;
  header?: string;
  nameTemplate?: string;
  isSystem?: number;
}

/**
 * Appends a property. Returns a new array; never mutates the input.
 *
 * A repeat of one already listed is dropped rather than added: the same property twice on a card is
 * never what an editor meant, and two content types can offer the same alias, so the picker can
 * legitimately hand back one that is already there. Matched without regard to case, because a card
 * showing "status" and "Status" would read as two properties while resolving to one.
 */
export function addCardProperty(
  properties: readonly KanbanCardPropertyValue[],
  added: KanbanCardPropertyValue,
): KanbanCardPropertyValue[] {
  const alias = added?.alias?.trim();
  if (!alias) return [...properties];

  const existing = properties.some((property) => property.alias.toLowerCase() === alias.toLowerCase());

  if (existing) return [...properties];

  return [
    ...properties,
    {
      alias,
      // The picked label becomes the header, as core's column configuration does, so a row arrives
      // already reading like the property rather than like its alias.
      header: added.header?.trim() || alias,
      isSystem: added.isSystem ? 1 : 0,
    },
  ];
}

export function removeCardPropertyAt(
  properties: readonly KanbanCardPropertyValue[],
  index: number,
): KanbanCardPropertyValue[] {
  if (index < 0 || index >= properties.length) return [...properties];

  return properties.filter((_, i) => i !== index);
}

/** Writes one field of one row, matched by alias as core's column configuration does. */
export function setCardPropertyField(
  properties: readonly KanbanCardPropertyValue[],
  alias: string,
  field: 'header' | 'nameTemplate',
  value: string,
): KanbanCardPropertyValue[] {
  return properties.map((property) =>
    property.alias === alias ? { ...property, [field]: value || undefined } : property,
  );
}

/**
 * Reads a value stored before card properties gained headers and templates, when they were a bare
 * array of aliases.
 *
 * The server's converter does the same, and both are needed: the server reads what a board renders
 * from, and this reads what the editor shows. Neither writes the old shape back.
 */
export function readCardProperties(value: unknown): KanbanCardPropertyValue[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry): KanbanCardPropertyValue | undefined => {
      if (typeof entry === 'string') {
        const alias = entry.trim();
        return alias ? { alias } : undefined;
      }

      const alias = (entry as KanbanCardPropertyValue)?.alias?.trim();

      return alias ? { ...(entry as KanbanCardPropertyValue), alias } : undefined;
    })
    .filter((entry): entry is KanbanCardPropertyValue => entry !== undefined);
}
