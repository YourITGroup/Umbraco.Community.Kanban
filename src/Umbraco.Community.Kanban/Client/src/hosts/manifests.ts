import {
  KANBAN_COLLECTION_VIEW_BOARD_ALIAS,
  KANBAN_DOCUMENT_COLLECTION_ALIAS,
  KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS,
  KANBAN_ENTRY_POINT_ALIAS,
} from '@/constants.js';

export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'condition',
    alias: KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS,
    name: 'Kanban Document Type Applies Condition',
    api: () => import('./conditions/document-type-applies.condition.js'),
  },
  {
    type: 'backofficeEntryPoint',
    alias: KANBAN_ENTRY_POINT_ALIAS,
    name: 'Kanban Entry Point',
    js: () => import('./entry-point.js'),
  },
  {
    type: 'collectionView',
    alias: KANBAN_COLLECTION_VIEW_BOARD_ALIAS,
    name: 'Kanban Board Collection View',
    element: () => import('./collection-view-board.element.js'),
    weight: 250,
    meta: {
      label: 'Kanban',
      icon: 'icon-columns',
      pathName: 'kanban',
    },
    conditions: [
      {
        alias: 'Umb.Condition.CollectionAlias',
        match: KANBAN_DOCUMENT_COLLECTION_ALIAS,
      },
    ],
  },
];
