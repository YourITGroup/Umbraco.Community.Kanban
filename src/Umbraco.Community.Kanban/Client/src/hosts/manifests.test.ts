import { describe, it, expect } from 'vitest';
import { manifests } from './manifests.js';
import {
  KANBAN_COLLECTION_VIEW_BOARD_ALIAS,
  KANBAN_DOCUMENT_COLLECTION_ALIAS,
} from '@/constants.js';

describe('collection view manifests', () => {
  const board = manifests.find((manifest) => manifest.alias === KANBAN_COLLECTION_VIEW_BOARD_ALIAS);

  it('registers a board collection view', () => {
    expect(board).toBeDefined();
    expect(board?.type).toBe('collectionView');
  });

  it('describes itself for the layout picker', () => {
    const meta = (board as { meta?: { label?: string; icon?: string; pathName?: string } }).meta;

    expect(meta?.label).toBeTruthy();
    expect(meta?.icon).toBeTruthy();
    expect(meta?.pathName).toBeTruthy();
  });

  it('is offered only for document collections', () => {
    const conditions = (board as { conditions?: Array<{ alias: string; match?: string }> }).conditions;

    expect(conditions).toEqual([
      { alias: 'Umb.Condition.CollectionAlias', match: KANBAN_DOCUMENT_COLLECTION_ALIAS },
    ]);
  });

  it('loads its element lazily', () => {
    expect(typeof (board as { element?: unknown }).element).toBe('function');
  });
});
