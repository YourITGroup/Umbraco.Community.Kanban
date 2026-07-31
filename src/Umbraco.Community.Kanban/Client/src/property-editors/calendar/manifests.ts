import {
  KANBAN_CALENDAR_EDITOR_ALIAS,
  KANBAN_CALENDAR_EDITOR_UI_ALIAS,
  KANBAN_CARD_PROPERTIES_UI_ALIAS,
  KANBAN_LANE_OVERRIDES_UI_ALIAS,
  KANBAN_LANE_PROPERTY_UI_ALIAS,
  KANBAN_MANUAL_LANES_UI_ALIAS,
} from '@/constants.js';

/**
 * The date and end-date pickers browse to a property like the board's lane property does, but
 * write no sibling content-type key — nothing previews off them. An explicit empty string, not an
 * omission: omitted, the picker defaults to the board's historic `laneContentTypeKey`.
 */
const NO_SIBLING_KEY = [{ alias: 'contentTypeKeyAlias', value: '' }];

export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'propertyEditorSchema',
    name: 'Kanban Calendar',
    alias: KANBAN_CALENDAR_EDITOR_ALIAS,
    meta: {
      defaultPropertyEditorUiAlias: KANBAN_CALENDAR_EDITOR_UI_ALIAS,
    },
  },
  {
    type: 'propertyEditorUi',
    alias: KANBAN_CALENDAR_EDITOR_UI_ALIAS,
    name: 'Kanban Calendar Property Editor UI',
    element: () => import('./calendar-config.element.js'),
    meta: {
      label: 'Kanban Calendar',
      propertyEditorSchemaAlias: KANBAN_CALENDAR_EDITOR_ALIAS,
      icon: 'icon-calendar',
      group: 'lists',
      settings: {
        properties: [
          {
            alias: 'dateProperty',
            label: 'Date property',
            description:
              'The child property that places a card on a day. Defaults to updateDate (last-updated) when left unset.',
            propertyEditorUiAlias: KANBAN_LANE_PROPERTY_UI_ALIAS,
            config: NO_SIBLING_KEY,
          },
          {
            alias: 'endDateProperty',
            label: 'End date property',
            description:
              'Optional. Gives cards a span for the week grid and agenda; items without a valid end use a one-hour block.',
            propertyEditorUiAlias: KANBAN_LANE_PROPERTY_UI_ALIAS,
            config: NO_SIBLING_KEY,
          },
          {
            alias: 'categoryProperty',
            label: 'Category property',
            description: 'Optional. Its values colour and badge cards, like lanes colour a board.',
            propertyEditorUiAlias: KANBAN_LANE_PROPERTY_UI_ALIAS,
            // The category appearance editor previews real values off this pair.
            config: [{ alias: 'contentTypeKeyAlias', value: 'categoryContentTypeKey' }],
          },
          {
            alias: 'categoryManualValues',
            label: 'Manual categories',
            description: 'Used when the category property’s editor provides no options of its own.',
            propertyEditorUiAlias: KANBAN_MANUAL_LANES_UI_ALIAS,
          },
          {
            alias: 'categoryOverrides',
            label: 'Category appearance',
            description: 'Override the colour, icon or label of individual categories.',
            propertyEditorUiAlias: KANBAN_LANE_OVERRIDES_UI_ALIAS,
            // Point the shared overrides editor at the calendar's own settings: categories have no
            // manual toggle (a non-empty list is the toggle) and no stored order.
            config: [
              { alias: 'propertyAlias', value: 'categoryProperty' },
              { alias: 'contentTypeKeyAlias', value: 'categoryContentTypeKey' },
              { alias: 'manualAlias', value: 'categoryManualValues' },
              { alias: 'useManualAlias', value: '' },
              { alias: 'orderAlias', value: '' },
              { alias: 'subject', value: 'category' },
            ],
          },
          {
            alias: 'cardProperties',
            label: 'Card properties',
            description: 'Properties shown as summary items on each card.',
            propertyEditorUiAlias: KANBAN_CARD_PROPERTIES_UI_ALIAS,
          },
          {
            alias: 'showAgenda',
            label: 'Show agenda list',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
          },
          {
            alias: 'appliesTo',
            label: 'Applies to content types',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.DocumentTypePicker',
          },
          {
            alias: 'tabName',
            label: 'Content app name',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.TextBox',
          },
          {
            alias: 'tabIcon',
            label: 'Content app icon',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.IconPicker',
          },
        ],
        defaultData: [{ alias: 'showAgenda', value: true }],
      },
    },
  },
];
