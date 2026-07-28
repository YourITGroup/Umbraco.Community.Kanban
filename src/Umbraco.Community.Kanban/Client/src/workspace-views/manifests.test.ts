import { describe, it, expect } from 'vitest';
import { manifests } from './manifests.js';
import { KANBAN_DATA_TYPE_WORKSPACE_VIEW_ALIAS } from '@/constants.js';

describe('data type workspace view manifests', () => {
  const view = manifests.find((manifest) => manifest.alias === KANBAN_DATA_TYPE_WORKSPACE_VIEW_ALIAS);

  it('registers a Kanban workspace view', () => {
    expect(view).toBeDefined();
    expect(view?.type).toBe('workspaceView');
  });

  it('names itself and gives itself a route segment', () => {
    const meta = (view as { meta?: { label?: string; pathname?: string; icon?: string } }).meta;

    expect(meta?.label).toBeTruthy();
    expect(meta?.pathname).toBeTruthy();
    expect(meta?.icon).toBeTruthy();
  });

  it('is scoped to the data type workspace', () => {
    const conditions = (view as { conditions?: Array<{ alias: string; match?: string }> }).conditions;

    expect(conditions).toEqual([
      { alias: 'Umb.Condition.WorkspaceAlias', match: 'Umb.Workspace.DataType' },
    ]);
  });

  it('loads its element lazily', () => {
    expect(typeof (view as { element?: unknown }).element).toBe('function');
  });
});
