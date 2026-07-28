import {
  KANBAN_DATA_TYPE_IS_COLLECTION_CONDITION_ALIAS,
  KANBAN_DATA_TYPE_WORKSPACE_VIEW_ALIAS,
} from '@/constants.js';

export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'condition',
    alias: KANBAN_DATA_TYPE_IS_COLLECTION_CONDITION_ALIAS,
    name: 'Kanban Data Type Is Collection Condition',
    api: () => import('./conditions/data-type-is-collection.condition.js'),
  },
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
    // The workspace-alias condition alone would put an empty Kanban tab on every data type,
    // so the tab is also gated on the data type actually being a Collection.
    conditions: [
      {
        alias: 'Umb.Condition.WorkspaceAlias',
        match: 'Umb.Workspace.DataType',
      },
      {
        alias: KANBAN_DATA_TYPE_IS_COLLECTION_CONDITION_ALIAS,
      },
    ],
  },
];
