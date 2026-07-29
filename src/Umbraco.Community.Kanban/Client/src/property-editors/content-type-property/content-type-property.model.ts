/** The subset of a content type property a picker needs. */
export interface KanbanPickablePropertyType {
  alias: string;
  name: string;
}

/** An entry in Umbraco's item picker modal. */
export interface KanbanPropertyPickerItem {
  label: string;
  value: string;
  description: string;
  icon: string;
}

/** A property an editor picked, with the content type it was browsed to through. */
export interface KanbanPickedProperty {
  alias: string;
  contentTypeUnique: string;
  contentTypeName: string;
  /** The property's name, used as the initial header of a card property row. */
  label: string;
  /** True for a document field rather than a content type property. */
  isSystem: boolean;
}

/** The icon shown beside every property in the picker, matching core's column picker. */
const PROPERTY_ICON = 'icon-document';

/** The icon core's column picker shows beside its system properties. */
const SYSTEM_PROPERTY_ICON = 'icon-nodes';

/**
 * The document fields a card can show that are not content type properties. The same five, under the
 * same aliases, that Umbraco's own List View column picker offers, so an editor moving between the two
 * sees the same names. Kept in step with `KanbanSystemProperty` on the server, which reads them.
 */
export const KANBAN_SYSTEM_PROPERTIES: readonly KanbanPickablePropertyType[] = [
  { alias: 'createDate', name: 'Created' },
  { alias: 'updateDate', name: 'Last edited' },
  { alias: 'creator', name: 'Creator' },
  { alias: 'sortOrder', name: 'Sort order' },
  { alias: 'published', name: 'Published' },
];

/**
 * The system fields as picker entries, offered ahead of a content type's own properties.
 *
 * Unlike a content type property, a system field has no data type — the server reads it off the
 * document directly. That is why they are only offered for *card* properties: a lane property is
 * resolved through the data type behind it, which a system field does not have.
 */
export function toSystemPropertyPickerItems(): KanbanPropertyPickerItem[] {
  return KANBAN_SYSTEM_PROPERTIES.map((property) => ({
    label: property.name,
    value: property.alias,
    description: property.alias,
    icon: SYSTEM_PROPERTY_ICON,
  }));
}

/** Whether an alias names one of the system fields above. */
export function isSystemProperty(alias: string): boolean {
  return KANBAN_SYSTEM_PROPERTIES.some(
    (property) => property.alias.toLowerCase() === alias?.trim().toLowerCase(),
  );
}

/**
 * Maps a content type's properties to item picker entries, labelled by name and described by
 * alias — the alias is what gets stored, so it has to be visible when two properties read alike.
 *
 * Umbraco's own collection column picker also offers system properties (createDate, sortOrder…).
 * This one deliberately does not: a Kanban property is read by looking up the data type behind a
 * *content type property*, and a system property has none, so offering them would let an editor
 * configure a board that silently shows nothing.
 */
export function toPropertyPickerItems(
  properties: readonly KanbanPickablePropertyType[] | undefined | null,
): KanbanPropertyPickerItem[] {
  return (properties ?? [])
    .filter((property) => !!property?.alias)
    .map((property) => ({
      label: property.name || property.alias,
      value: property.alias,
      description: property.alias,
      icon: PROPERTY_ICON,
    }));
}
