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
}

/** The icon shown beside every property in the picker, matching core's column picker. */
const PROPERTY_ICON = 'icon-document';

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
