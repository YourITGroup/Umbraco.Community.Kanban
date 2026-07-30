import { describe, it, expect } from 'vitest';
import { KANBAN_COLLECTION_VIEW_BOARD_ALIAS } from '@/constants.js';
import { isChromelessCollectionView } from './collection-chrome.model.js';

describe('isChromelessCollectionView', () => {
  it('hides the layout’s chrome for the board view, which brings its own action bar', () => {
    expect(isChromelessCollectionView(KANBAN_COLLECTION_VIEW_BOARD_ALIAS)).toBe(true);
  });

  it('keeps the chrome for the list view, whose pager and bulk actions are the point', () => {
    expect(isChromelessCollectionView('Umb.CollectionView.Document.Table')).toBe(false);
  });

  it('keeps the chrome when no view is showing yet', () => {
    // The list view is the default; hiding a control before we know what is showing would flicker it
    // on every load.
    expect(isChromelessCollectionView(undefined)).toBe(false);
  });

  it('matches the alias exactly, since a near-miss is a different extension', () => {
    expect(isChromelessCollectionView(`${KANBAN_COLLECTION_VIEW_BOARD_ALIAS}.Other`)).toBe(false);
  });
});
