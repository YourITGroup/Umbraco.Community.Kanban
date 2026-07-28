import { KANBAN_DATA_TYPE_WORKSPACE_VIEW_ALIAS } from '@/constants.js';

export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'workspaceView',
    alias: KANBAN_DATA_TYPE_WORKSPACE_VIEW_ALIAS,
    name: 'Kanban Data Type Workspace View',
    element: () => import('./data-type-kanban.element.js'),
    weight: 80,
    meta: {
      label: 'Kanban',
      pathname: 'kanban',
      icon: 'icon-grid',
    },
    conditions: [
      {
        alias: 'Umb.Condition.WorkspaceAlias',
        match: 'Umb.Workspace.DataType',
      },
    ],
  },
];
