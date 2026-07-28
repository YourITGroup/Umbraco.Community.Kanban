import { KANBAN_CARD_PROPERTIES_UI_ALIAS } from '@/constants.js';

export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'propertyEditorUi',
    alias: KANBAN_CARD_PROPERTIES_UI_ALIAS,
    name: 'Kanban Card Properties Property Editor UI',
    element: () => import('./card-properties.element.js'),
    meta: {
      label: 'Kanban Card Properties',
      icon: 'icon-list',
      group: 'lists',
    },
  },
];
