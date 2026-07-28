import { KANBAN_MANUAL_LANES_UI_ALIAS } from '@/constants.js';

export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'propertyEditorUi',
    alias: KANBAN_MANUAL_LANES_UI_ALIAS,
    name: 'Kanban Manual Lanes Property Editor UI',
    element: () => import('./manual-lanes.element.js'),
    meta: {
      label: 'Kanban Manual Lanes',
      icon: 'icon-ordered-list',
      group: 'lists',
    },
  },
];
