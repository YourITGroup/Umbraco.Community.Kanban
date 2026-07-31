import { describe, it, expect } from 'vitest';
import { manifests } from './manifests.js';
import {
  KANBAN_COLLECTION_VIEW_BOARD_ALIAS,
  KANBAN_COLLECTION_VIEW_CALENDAR_ALIAS,
  KANBAN_DOCUMENT_COLLECTION_ALIAS,
  KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS,
} from '@/constants.js';

describe('document type applies condition manifest', () => {
  const condition = manifests.find(
    (manifest) => manifest.alias === KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS,
  );

  it('registers the condition', () => {
    expect(condition).toBeDefined();
    expect(condition?.type).toBe('condition');
  });

  it('loads its api lazily', () => {
    expect(typeof (condition as { api?: unknown }).api).toBe('function');
  });
});

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

describe('calendar collection view manifest', () => {
  const calendar = manifests.find((manifest) => manifest.alias === KANBAN_COLLECTION_VIEW_CALENDAR_ALIAS);

  it('registers a calendar collection view for document collections, lazily', () => {
    expect(calendar?.type).toBe('collectionView');
    expect(typeof (calendar as { element?: unknown }).element).toBe('function');
    expect((calendar as { conditions?: unknown }).conditions).toEqual([
      { alias: 'Umb.Condition.CollectionAlias', match: KANBAN_DOCUMENT_COLLECTION_ALIAS },
    ]);
  });

  it('describes itself for the layout picker', () => {
    const meta = (calendar as { meta?: { label?: string; icon?: string; pathName?: string } }).meta;

    expect(meta?.label).toBe('Calendar');
    expect(meta?.icon).toBe('icon-calendar');
    expect(meta?.pathName).toBe('kanban-calendar');
  });
});
