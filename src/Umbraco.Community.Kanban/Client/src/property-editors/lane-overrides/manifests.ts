import { KANBAN_LANE_OVERRIDES_UI_ALIAS } from '@/constants.js';

export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'propertyEditorUi',
    alias: KANBAN_LANE_OVERRIDES_UI_ALIAS,
    name: 'Kanban Lane Overrides Property Editor UI',
    element: () => import('./lane-overrides.element.js'),
    meta: {
      label: 'Kanban Lane Overrides',
      icon: 'icon-colorpicker',
      group: 'lists',
    },
  },
];
