import {
  KANBAN_BOARD_EDITOR_ALIAS,
  KANBAN_CARD_PROPERTIES_UI_ALIAS,
  KANBAN_BOARD_EDITOR_UI_ALIAS,
  KANBAN_LANE_OVERRIDES_UI_ALIAS,
  KANBAN_LANE_PROPERTY_UI_ALIAS,
  KANBAN_MANUAL_LANES_UI_ALIAS,
} from '@/constants.js';

export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'propertyEditorSchema',
    name: 'Kanban Board',
    alias: KANBAN_BOARD_EDITOR_ALIAS,
    meta: {
      defaultPropertyEditorUiAlias: KANBAN_BOARD_EDITOR_UI_ALIAS,
    },
  },
  {
    type: 'propertyEditorUi',
    alias: KANBAN_BOARD_EDITOR_UI_ALIAS,
    name: 'Kanban Board Property Editor UI',
    element: () => import('./board-config.element.js'),
    meta: {
      label: 'Kanban Board',
      propertyEditorSchemaAlias: KANBAN_BOARD_EDITOR_ALIAS,
      icon: 'icon-columns',
      group: 'lists',
      settings: {
        properties: [
          {
            alias: 'laneProperty',
            label: 'Lane property',
            description: 'The child property whose value decides which lane a card sits in.',
            propertyEditorUiAlias: KANBAN_LANE_PROPERTY_UI_ALIAS,
          },
          {
            alias: 'useManualLanes',
            label: 'Define lanes manually',
            description:
              'Off: lanes come from the lane property’s own options. On: lanes come from the list below.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
          },
          {
            alias: 'manualLanes',
            label: 'Manual lanes',
            description: 'Used only when lanes are defined manually.',
            propertyEditorUiAlias: KANBAN_MANUAL_LANES_UI_ALIAS,
          },
          {
            alias: 'laneOverrides',
            label: 'Lane appearance',
            description: 'Override the colour, icon or label of individual lanes.',
            propertyEditorUiAlias: KANBAN_LANE_OVERRIDES_UI_ALIAS,
          },
          {
            alias: 'cardProperties',
            label: 'Card properties',
            description: 'Properties shown as summary items on each card, in the order listed.',
            propertyEditorUiAlias: KANBAN_CARD_PROPERTIES_UI_ALIAS,
          },
          {
            alias: 'showChildItems',
            label: 'Show child items',
            description: 'List each card’s own children on the card, with an edit button and an add button.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
          },
          {
            alias: 'childItemsSortBy',
            label: 'Sort child items by',
            description: 'Used only when child items are shown.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.Dropdown',
            config: [
              {
                alias: 'items',
                value: [
                  { name: 'Sort order', value: 'sortOrder' },
                  { name: 'Name', value: 'name' },
                  { name: 'Last edited', value: 'updateDate' },
                  { name: 'Created', value: 'createDate' },
                ],
              },
            ],
          },
          {
            alias: 'childItemsSortDirection',
            label: 'Sort child items',
            description: 'Used only when child items are shown.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.Dropdown',
            config: [
              {
                alias: 'items',
                value: [
                  { name: 'Ascending', value: 'asc' },
                  { name: 'Descending', value: 'desc' },
                ],
              },
            ],
          },
          {
            alias: 'lanePageSize',
            label: 'Cards per lane',
            description: 'How many cards load in a lane before "Show more".',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.Integer',
            config: [{ alias: 'min', value: 1 }],
          },
          {
            alias: 'allowDrag',
            label: 'Allow drag',
            description: 'Let editors move cards between lanes.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
          },
          {
            alias: 'appliesTo',
            label: 'Applies to content types',
            description: 'Content types that get this board as a content app.',
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
          { alias: 'lanePageSize', value: 25 },
          { alias: 'allowDrag', value: true },
          { alias: 'childItemsSortBy', value: 'sortOrder' },
          { alias: 'childItemsSortDirection', value: 'asc' },
          {
            // What a fresh List View shows, and without it a new board's cards carry nothing but a
            // title. Defaults apply to newly created data types only, so no existing board gains
            // them — and either row can be removed like any other.
            alias: 'cardProperties',
            value: [
              { alias: 'createDate', header: 'Created', isSystem: 1 },
              { alias: 'updateDate', header: 'Last edited', isSystem: 1 },
            ],
          },
        ],
      },
    },
  },
];
