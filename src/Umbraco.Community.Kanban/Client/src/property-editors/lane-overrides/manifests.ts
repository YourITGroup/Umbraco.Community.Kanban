export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'propertyEditorUi',
    alias: 'Umb.Community.Kanban.PropertyEditorUi.LaneOverrides',
    name: 'Kanban Lane Overrides Property Editor UI',
    element: () => import('./lane-overrides.element.js'),
    meta: {
      label: 'Kanban Lane Overrides',
      icon: 'icon-colorpicker',
      group: 'lists',
    },
  },
];
