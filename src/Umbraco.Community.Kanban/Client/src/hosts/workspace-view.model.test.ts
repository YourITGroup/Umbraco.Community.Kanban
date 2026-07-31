import { describe, it, expect } from 'vitest';
import { boardWorkspaceViewManifests, calendarWorkspaceViewManifests } from './workspace-view.model.js';
import type { KanbanConfigurationModel } from '../data/kanban-configuration-data-source.js';
import {
  KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS,
  KANBAN_WORKSPACE_VIEW_BOARD_ALIAS_PREFIX,
  KANBAN_WORKSPACE_VIEW_CALENDAR_ALIAS_PREFIX,
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

  it('skips calendar configurations — those derive through the calendar model', () => {
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

describe('calendarWorkspaceViewManifests', () => {
  it('derives one workspaceView per calendar configuration, skipping boards and empty appliesTo', () => {
    const manifests = calendarWorkspaceViewManifests([
      configuration({ key: 'cal-1', kind: 'Calendar' }),
      configuration({ key: 'board-1', kind: 'Board' }),
      configuration({ key: 'cal-2', kind: 'Calendar', appliesTo: [] }),
    ]);

    expect(manifests.map((m) => m.alias)).toEqual([`${KANBAN_WORKSPACE_VIEW_CALENDAR_ALIAS_PREFIX}cal-1`]);
  });

  it('routes by configuration key, defaults the icon to icon-calendar, and carries the key', () => {
    const [manifest] = calendarWorkspaceViewManifests([configuration({ key: 'cal-9', kind: 'Calendar' })]);
    const meta = manifest.meta as { pathname?: string; icon?: string; kanbanConfigId?: string };

    expect(meta.pathname).toBe('kanban-calendar-cal-9');
    expect(meta.icon).toBe('icon-calendar');
    expect(meta.kanbanConfigId).toBe('cal-9');
  });

  it('conditions each tab exactly as board tabs are conditioned', () => {
    const [manifest] = calendarWorkspaceViewManifests([
      configuration({ kind: 'Calendar', appliesTo: ['ct-a', 'ct-b'] }),
    ]);

    expect((manifest as { conditions?: unknown }).conditions).toEqual([
      { alias: 'Umb.Condition.WorkspaceAlias', match: 'Umb.Workspace.Document' },
      { alias: 'Umb.Condition.WorkspaceEntityIsNew', match: false },
      { alias: KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS, oneOf: ['ct-a', 'ct-b'] },
    ]);
  });

  it('labels from tabName with the configuration name as fallback, and loads the element lazily', () => {
    const [named] = calendarWorkspaceViewManifests([configuration({ kind: 'Calendar', tabName: 'Schedule' })]);

    expect((named.meta as { label?: string }).label).toBe('Schedule');
    expect(typeof (named as { element?: unknown }).element).toBe('function');
  });
});
