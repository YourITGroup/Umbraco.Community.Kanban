import { KANBAN_LANE_PROPERTY_UI_ALIAS } from '@/constants.js';

export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'propertyEditorUi',
    alias: KANBAN_LANE_PROPERTY_UI_ALIAS,
    name: 'Kanban Lane Property Property Editor UI',
    element: () => import('./lane-property.element.js'),
    meta: {
      label: 'Kanban Lane Property',
      icon: 'icon-settings',
      group: 'lists',
    },
  },
];
