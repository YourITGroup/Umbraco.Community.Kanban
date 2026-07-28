import {
  KANBAN_BOARD_EDITOR_ALIAS,
  KANBAN_BOARD_EDITOR_UI_ALIAS,
  KANBAN_LANE_OVERRIDES_UI_ALIAS,
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
      icon: 'icon-grid',
      group: 'lists',
      settings: {
        properties: [
          {
            alias: 'laneProperty',
            label: 'Lane property',
            description: 'The child property whose value decides which lane a card sits in.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.TextBox',
          },
          {
            alias: 'laneSource',
            label: 'Lane source',
            description: 'Leave empty to detect from the lane property. Set to "manual" to use the lanes below.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.TextBox',
          },
          {
            alias: 'manualLanes',
            label: 'Manual lanes',
            description: 'Used only when the lane source is "manual".',
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
            description: 'Properties shown as summary items on each card.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.MultipleTextString',
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
        ],
      },
    },
  },
];
