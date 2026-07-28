import { describe, it, expect } from 'vitest';
import { cardStateTag } from './card.model.js';

describe('cardStateTag', () => {
  it('shows a published card positively', () => {
    expect(cardStateTag('published')).toEqual({ color: 'positive', term: 'content_published' });
  });

  it('warns on a published card with pending changes', () => {
    expect(cardStateTag('publishedPendingChanges')).toEqual({
      color: 'warning',
      term: 'content_publishedPendingChanges',
    });
  });

  it('shows a draft neutrally', () => {
    expect(cardStateTag('draft')).toEqual({ color: 'default', term: 'content_unpublished' });
  });
});
