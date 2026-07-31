import { describe, it, expect } from 'vitest';
import { boardWorkspaceViewManifests } from './workspace-view.model.js';
import type { KanbanConfigurationModel } from '../data/kanban-configuration-data-source.js';
import {
  KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS,
  KANBAN_WORKSPACE_VIEW_BOARD_ALIAS_PREFIX,
} from '@/constants.js';

function configuration(overrides: Partial<KanbanConfigurationModel> = {}): KanbanConfigurationModel {
  return {
    key: 'cfg-1',
    name: 'By status',
    kind: 'Board',
    appliesTo: ['ct-a'],
    ...overrides,
  };
}

describe('boardWorkspaceViewManifests', () => {
  it('derives one workspaceView per applicable configuration, in input order', () => {
    const manifests = boardWorkspaceViewManifests([
      configuration({ key: 'cfg-1' }),
      configuration({ key: 'cfg-2', name: 'By priority' }),
    ]);

    expect(manifests.map((m) => m.alias)).toEqual([
      `${KANBAN_WORKSPACE_VIEW_BOARD_ALIAS_PREFIX}cfg-1`,
      `${KANBAN_WORKSPACE_VIEW_BOARD_ALIAS_PREFIX}cfg-2`,
    ]);
    expect(manifests.every((m) => m.type === 'workspaceView')).toBe(true);
  });

  it('skips calendar configurations — that host does not exist yet', () => {
    expect(boardWorkspaceViewManifests([configuration({ kind: 'Calendar' })])).toEqual([]);
  });

  it('skips a configuration that names no content types', () => {
    expect(boardWorkspaceViewManifests([configuration({ appliesTo: [] })])).toEqual([]);
  });

  it('labels the tab from tabName, falling back to the configuration name', () => {
    const [named, fallback] = boardWorkspaceViewManifests([
      configuration({ key: 'a', tabName: 'Pipeline' }),
      configuration({ key: 'b', tabName: null }),
    ]);

    expect((named.meta as { label?: string }).label).toBe('Pipeline');
    expect((fallback.meta as { label?: string }).label).toBe('By status');
  });

  it('icons the tab from tabIcon, falling back to the package icon', () => {
    const [custom, fallback] = boardWorkspaceViewManifests([
      configuration({ key: 'a', tabIcon: 'icon-calendar' }),
      configuration({ key: 'b' }),
    ]);

    expect((custom.meta as { icon?: string }).icon).toBe('icon-calendar');
    expect((fallback.meta as { icon?: string }).icon).toBe('icon-columns');
  });

  it('routes each tab by its configuration key and carries the key for the element', () => {
    const [manifest] = boardWorkspaceViewManifests([configuration({ key: 'cfg-9' })]);
    const meta = manifest.meta as { pathname?: string; kanbanConfigId?: string };

    expect(meta.pathname).toBe('kanban-cfg-9');
    expect(meta.kanbanConfigId).toBe('cfg-9');
  });

  it('conditions each tab on the document workspace, a saved document, and the appliesTo keys', () => {
    const [manifest] = boardWorkspaceViewManifests([
      configuration({ appliesTo: ['ct-a', 'ct-b'] }),
    ]);

    expect((manifest as { conditions?: unknown }).conditions).toEqual([
      { alias: 'Umb.Condition.WorkspaceAlias', match: 'Umb.Workspace.Document' },
      { alias: 'Umb.Condition.WorkspaceEntityIsNew', match: false },
      { alias: KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS, oneOf: ['ct-a', 'ct-b'] },
    ]);
  });

  it('loads the element lazily', () => {
    const [manifest] = boardWorkspaceViewManifests([configuration()]);

    expect(typeof (manifest as { element?: unknown }).element).toBe('function');
  });
});
