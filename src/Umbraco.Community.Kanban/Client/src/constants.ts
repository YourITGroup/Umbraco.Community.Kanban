export const KANBAN_BOARD_EDITOR_ALIAS = 'Umbraco.Community.Kanban.Board';
export const KANBAN_CALENDAR_EDITOR_ALIAS = 'Umbraco.Community.Kanban.Calendar';
export const KANBAN_BOARD_EDITOR_UI_ALIAS = 'Umb.Community.Kanban.PropertyEditorUi.Board';
export const KANBAN_CALENDAR_EDITOR_UI_ALIAS = 'Umb.Community.Kanban.PropertyEditorUi.Calendar';
export const KANBAN_LANE_OVERRIDES_UI_ALIAS = 'Umb.Community.Kanban.PropertyEditorUi.LaneOverrides';
export const KANBAN_MANUAL_LANES_UI_ALIAS = 'Umb.Community.Kanban.PropertyEditorUi.ManualLanes';
export const KANBAN_LANE_PROPERTY_UI_ALIAS = 'Umb.Community.Kanban.PropertyEditorUi.LaneProperty';
export const KANBAN_CARD_PROPERTIES_UI_ALIAS = 'Umb.Community.Kanban.PropertyEditorUi.CardProperties';
export const KANBAN_API_PATH = '/umbraco/kanban/api/v1';

export const KANBAN_BOARD_ENDPOINT = `${KANBAN_API_PATH}/board`;
export const KANBAN_CALENDAR_ENDPOINT = `${KANBAN_API_PATH}/calendar`;
export const KANBAN_CONFIGURATIONS_ENDPOINT = `${KANBAN_API_PATH}/configurations`;
export const KANBAN_LANES_PREVIEW_ENDPOINT = `${KANBAN_API_PATH}/lanes/preview`;

/**
 * One card's lane, for the drag write-back. A function rather than a template constant because the key
 * is a path segment: it is encoded here so no caller has to remember to.
 */
export const KANBAN_CARD_LANE_ENDPOINT = (key: string): string =>
  `${KANBAN_API_PATH}/card/${encodeURIComponent(key)}/lane`;

export const KANBAN_CARD_ENDPOINT = (key: string): string =>
  `${KANBAN_API_PATH}/card/${encodeURIComponent(key)}`;

export const KANBAN_COLLECTION_VIEW_BOARD_ALIAS = 'Umb.Community.Kanban.CollectionView.Board';
export const KANBAN_COLLECTION_VIEW_CALENDAR_ALIAS = 'Umb.Community.Kanban.CollectionView.Calendar';
export const KANBAN_DATA_TYPE_WORKSPACE_VIEW_ALIAS = 'Umb.Community.Kanban.WorkspaceView.DataType.Kanban';

/** Per-configuration workspace views append the configuration key to this. */
export const KANBAN_WORKSPACE_VIEW_BOARD_ALIAS_PREFIX = 'Umb.Community.Kanban.WorkspaceView.Board.';
export const KANBAN_WORKSPACE_VIEW_CALENDAR_ALIAS_PREFIX = 'Umb.Community.Kanban.WorkspaceView.Calendar.';

/** Our own condition: the open document's content type key is in a configuration's appliesTo list. */
export const KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS =
  'Umb.Community.Kanban.Condition.DocumentTypeApplies';

/** Our own condition: the open Data Type workspace edits a Collection data type. */
export const KANBAN_DATA_TYPE_IS_COLLECTION_CONDITION_ALIAS =
  'Umb.Community.Kanban.Condition.DataTypeIsCollection';

/** The extra configuration alias written onto a Collection data type. Must match Constants.BoardConfigIdKey. */
export const KANBAN_BOARD_CONFIG_ID_KEY = 'kanban.boardConfigId';

/** The calendar sibling of the board key above. Must match Constants.CalendarConfigIdKey. */
export const KANBAN_CALENDAR_CONFIG_ID_KEY = 'kanban.calendarConfigId';

/**
 * The Board configuration key naming the content type the lane property was picked from.
 * Written by the lane property picker alongside its own value rather than shown as a setting of
 * its own — an editor picks a property, not a content type and a property.
 */
export const KANBAN_LANE_CONTENT_TYPE_KEY = 'laneContentTypeKey';

/**
 * The Board configuration key holding lane values in display order. Written by dragging lanes in the
 * lane appearance editor rather than shown as a setting of its own, so like the key above it is not
 * declared in the settings list. Must match the server's ConfigurationField key.
 */
export const KANBAN_LANE_ORDER_KEY = 'laneOrder';

/** The Collection property editor UI our Data Type workspace tab attaches itself to. */
export const KANBAN_COLLECTION_PROPERTY_EDITOR_UI_ALIAS = 'Umb.PropertyEditorUi.Collection';

/** The document collection our board layout is offered for. */
export const KANBAN_DOCUMENT_COLLECTION_ALIAS = 'Umb.Collection.Document';

/** Our backoffice entry point, which swaps the document collection's element for ours. */
export const KANBAN_ENTRY_POINT_ALIAS = 'Umb.Community.Kanban.EntryPoint';

/**
 * Views that supply their own chrome, so the collection layout hides its pager and selection-action bar
 * while one of them is showing. A board pages its own lanes and has no checkbox selection, so neither
 * control can act on anything it displays.
 *
 * The calendar collection view joins this list when it exists — it will have the same problem for the same
 * reason.
 */
export const KANBAN_CHROMELESS_COLLECTION_VIEW_ALIASES: readonly string[] = [
  KANBAN_COLLECTION_VIEW_BOARD_ALIAS,
];
