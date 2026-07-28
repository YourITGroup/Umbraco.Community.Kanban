export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'propertyEditorUi',
    alias: 'Umb.Community.Kanban.PropertyEditorUi.ManualLanes',
    name: 'Kanban Manual Lanes Property Editor UI',
    element: () => import('./manual-lanes.element.js'),
    meta: {
      label: 'Kanban Manual Lanes',
      icon: 'icon-ordered-list',
      group: 'lists',
    },
  },
];
