import type { ManifestWorkspaceView, MetaWorkspaceView } from '@umbraco-cms/backoffice/workspace';
import type { KanbanConfigurationModel } from '../data/kanban-configuration-data-source.js';
import {
  KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS,
  KANBAN_WORKSPACE_VIEW_BOARD_ALIAS_PREFIX,
  KANBAN_WORKSPACE_VIEW_CALENDAR_ALIAS_PREFIX,
} from '@/constants.js';

/** The standard workspace-view meta plus the configuration key the shared element reads back. */
export interface KanbanBoardWorkspaceViewMeta extends MetaWorkspaceView {
  kanbanConfigId: string;
}

export type KanbanBoardWorkspaceViewManifest = ManifestWorkspaceView<KanbanBoardWorkspaceViewMeta>;

/**
 * Core's UMB_DOCUMENT_WORKSPACE_ALIAS, as a literal rather than the import: this file is covered by
 * Node tests, and a value import of the documents package touches `document` at module scope. The
 * same trade every core-alias literal in manifests.ts makes.
 */
const DOCUMENT_WORKSPACE_ALIAS = 'Umb.Workspace.Document';

/**
 * One workspaceView per board configuration that names at least one content type, in configuration
 * order. Pure, so the skip rules and fallbacks are tested directly:
 *
 * - Calendar configurations are skipped — that host does not exist yet (design milestone 4).
 * - An empty appliesTo provides no tab anywhere: it names the types it applies to, and it named none.
 * - The configuration key rides in three places, deliberately: the alias (so unregistering finds it),
 *   the pathname (so two boards on one document type route distinctly), and meta.kanbanConfigId (so
 *   the one shared element knows which configuration it serves — this host has no Collection data
 *   type to resolve one from).
 *
 * Weight 90 sits after core's Content and Info tabs, identically for every board tab; ties keep
 * configuration order because the registry preserves registration order within a weight.
 */
export function boardWorkspaceViewManifests(
  configurations: KanbanConfigurationModel[],
): Array<KanbanBoardWorkspaceViewManifest> {
  return workspaceViewManifests(configurations, {
    kind: 'Board',
    aliasPrefix: KANBAN_WORKSPACE_VIEW_BOARD_ALIAS_PREFIX,
    name: 'Kanban Board Workspace View',
    pathnamePrefix: 'kanban-',
    defaultIcon: 'icon-columns',
    element: () => import('./kanban-workspace-view-board.element.js'),
  });
}

/** The calendar tabs, derived by exactly the board rules — only the kind, routing and icon differ. */
export function calendarWorkspaceViewManifests(
  configurations: KanbanConfigurationModel[],
): Array<KanbanBoardWorkspaceViewManifest> {
  return workspaceViewManifests(configurations, {
    kind: 'Calendar',
    aliasPrefix: KANBAN_WORKSPACE_VIEW_CALENDAR_ALIAS_PREFIX,
    name: 'Kanban Calendar Workspace View',
    pathnamePrefix: 'kanban-calendar-',
    defaultIcon: 'icon-calendar',
    element: () => import('./kanban-workspace-view-calendar.element.js'),
  });
}

interface WorkspaceViewShape {
  kind: KanbanConfigurationModel['kind'];
  aliasPrefix: string;
  name: string;
  pathnamePrefix: string;
  defaultIcon: string;
  element: () => Promise<unknown>;
}

function workspaceViewManifests(
  configurations: KanbanConfigurationModel[],
  shape: WorkspaceViewShape,
): Array<KanbanBoardWorkspaceViewManifest> {
  return configurations
    .filter((configuration) => configuration.kind === shape.kind && configuration.appliesTo.length > 0)
    .map((configuration) => {
      const manifest: KanbanBoardWorkspaceViewManifest = {
        type: 'workspaceView',
        alias: `${shape.aliasPrefix}${configuration.key}`,
        name: `${shape.name} (${configuration.name})`,
        element: shape.element as KanbanBoardWorkspaceViewManifest['element'],
        weight: 90,
        meta: {
          label: configuration.tabName || configuration.name,
          pathname: `${shape.pathnamePrefix}${configuration.key}`,
          icon: configuration.tabIcon || shape.defaultIcon,
          kanbanConfigId: configuration.key,
        },
        conditions: [
          { alias: 'Umb.Condition.WorkspaceAlias', match: DOCUMENT_WORKSPACE_ALIAS },
          { alias: 'Umb.Condition.WorkspaceEntityIsNew', match: false },
          { alias: KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS, oneOf: [...configuration.appliesTo] },
        ],
      };

      return manifest;
    });
}
