import {
  KANBAN_CALENDAR_EDITOR_ALIAS,
  KANBAN_CALENDAR_EDITOR_UI_ALIAS,
  KANBAN_CARD_PROPERTIES_UI_ALIAS,
  KANBAN_LANE_OVERRIDES_UI_ALIAS,
  KANBAN_MANUAL_LANES_UI_ALIAS,
} from '@/constants.js';

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
            description: 'The child property that places a card on a day. Leave as updateDate for last-updated, which makes the calendar read-only.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.TextBox',
          },
          {
            alias: 'endDateProperty',
            label: 'End date property',
            description:
              'Optional. Gives cards a span for the week grid and agenda; items without a valid end use a one-hour block.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.TextBox',
          },
          {
            alias: 'categoryProperty',
            label: 'Category property',
            description: 'Optional. Its values colour and badge cards, like lanes colour a board.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.TextBox',
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
            alias: 'allowDrag',
            label: 'Allow drag',
            description: 'Ignored: the calendar is read-only.',
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
        defaultData: [
          { alias: 'dateProperty', value: 'updateDate' },
          { alias: 'showAgenda', value: true },
          { alias: 'allowDrag', value: true },
        ],
      },
    },
  },
];
