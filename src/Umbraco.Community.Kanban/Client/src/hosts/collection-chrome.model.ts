import { KANBAN_CHROMELESS_COLLECTION_VIEW_ALIASES } from '@/constants.js';

/**
 * Whether the showing collection view supplies its own chrome, so the collection layout should hide its
 * pager and selection-action bar.
 *
 * Pure and tested because it is the one decision in the layout swap that can be: the element around it
 * cannot be unit-tested in this package's Node test environment, and this is where a future view — the
 * calendar — opts in.
 *
 * No view showing at all (undefined) keeps the chrome: the list view is the default, and hiding a control
 * because we do not yet know what is showing would flicker it on every load.
 */
export function isChromelessCollectionView(alias: string | undefined): boolean {
  return alias !== undefined && KANBAN_CHROMELESS_COLLECTION_VIEW_ALIASES.includes(alias);
}
