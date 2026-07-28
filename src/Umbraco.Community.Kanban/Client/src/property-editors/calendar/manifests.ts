import { KANBAN_CALENDAR_EDITOR_ALIAS, KANBAN_CALENDAR_EDITOR_UI_ALIAS } from '@/constants.js';

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
            alias: 'cardProperties',
            label: 'Card properties',
            description: 'Properties shown as summary items on each card.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.MultipleTextString',
          },
          {
            alias: 'showAgenda',
            label: 'Show agenda list',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
          },
          {
            alias: 'allowDrag',
            label: 'Allow drag',
            description: 'Ignored when the date property is updateDate, which cannot be written to.',
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
