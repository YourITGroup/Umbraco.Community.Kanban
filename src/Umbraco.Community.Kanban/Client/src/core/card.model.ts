import type { KanbanCardState } from '../data/kanban-board.types.js';

/**
 * The tag colour and localisation key for a card's publish state. Copied from the built-in
 * document table collection view's state column: Umbraco ships no reusable publish-state
 * element, so matching its colours and terms by hand is how a card reads like a tree node.
 */
export function cardStateTag(state: KanbanCardState): { color: string; term: string } {
  switch (state) {
    case 'published':
      return { color: 'positive', term: 'content_published' };
    case 'publishedPendingChanges':
      return { color: 'warning', term: 'content_publishedPendingChanges' };
    default:
      return { color: 'default', term: 'content_unpublished' };
  }
}
