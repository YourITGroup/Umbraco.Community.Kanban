import type { UmbEntryPointOnInit, UmbEntryPointOnUnload } from '@umbraco-cms/backoffice/extension-api';
import type { ManifestCollection } from '@umbraco-cms/backoffice/collection';
import { KANBAN_DOCUMENT_COLLECTION_ALIAS } from '@/constants.js';
import { getBoardConfigurations } from '@/data/kanban-configuration-data-source.js';
import { boardWorkspaceViewManifests, type KanbanBoardWorkspaceViewManifest } from './workspace-view.model.js';

/**
 * Core's document collection manifest, exactly as it was registered, kept so `onUnload` can put it back.
 */
let replaced: ManifestCollection | undefined;

/** The per-configuration board tabs this entry point registered, kept so onUnload can remove them. */
let registeredWorkspaceViews: Array<KanbanBoardWorkspaceViewManifest> = [];

/**
 * Points the document collection at our own layout element, so a Kanban view can suppress the pager and
 * the selection-action bar that belong to the list view.
 *
 * The swap keeps core's registered manifest and replaces **only** its `element`. That matters: the
 * manifest's `api` is `UmbDocumentCollectionContext`, which is not a public export and is not merely
 * decorative — it waits on the display culture before loading, and supplies `requestItemHref` for every
 * item link in the list. Re-registering a hand-written manifest would silently drop both for every
 * document collection in the backoffice. Reusing the manifest's own `api` and `meta` references means
 * nothing about the collection changes except which element renders it.
 *
 * A registry-level swap is the only seam available: the collection layout is chosen per entity type, from
 * a fixed alias the workspace context supplies, so a collection *view* cannot influence it and the data
 * type's configuration cannot either.
 */
export const onInit: UmbEntryPointOnInit = (host, extensionRegistry) => {
  // Board tabs are derived from server-side configurations, so registration is asynchronous. onInit
  // itself must not await it: a slow or failing Kanban endpoint must never hold up or degrade the
  // backoffice.
  void registerBoardWorkspaceViews(host, extensionRegistry);

  const registered = extensionRegistry.getByAlias<ManifestCollection>(KANBAN_DOCUMENT_COLLECTION_ALIAS);

  if (!registered) {
    // Core did not register it, or renamed it. Leaving the collection alone is the safe outcome: the
    // board still works, it just keeps the list view's pager.
    console.warn(
      `[Kanban] '${KANBAN_DOCUMENT_COLLECTION_ALIAS}' is not registered; leaving the document collection as it is.`,
    );
    return;
  }

  replaced = registered;

  // Typed on the way in rather than passed as a literal: the entry point hands us a registry typed to
  // `ManifestBase`, and a fresh literal would be excess-property-checked against that narrower type.
  const swapped: ManifestCollection = {
    ...registered,
    element: () => import('./kanban-document-collection.element.js'),
  };

  extensionRegistry.unregister(KANBAN_DOCUMENT_COLLECTION_ALIAS);
  extensionRegistry.register(swapped);
};

/**
 * Puts core's own manifest back. Without this, unregistering this package would leave every document
 * collection in the backoffice rendering an element from a package that is no longer loaded.
 */
/**
 * Fetches every board configuration and registers one workspace-view tab per applicable one.
 * getBoardConfigurations returns [] on any request failure, so the common failure cannot throw;
 * the try/catch covers the uncommon ones for the same reason — no Kanban problem may degrade the
 * backoffice.
 */
async function registerBoardWorkspaceViews(
  host: Parameters<UmbEntryPointOnInit>[0],
  extensionRegistry: Parameters<UmbEntryPointOnInit>[1],
): Promise<void> {
  try {
    const configurations = await getBoardConfigurations(host);

    registeredWorkspaceViews = boardWorkspaceViewManifests(configurations);

    if (registeredWorkspaceViews.length > 0) {
      extensionRegistry.registerMany(registeredWorkspaceViews);
    }
  } catch (error) {
    console.warn('[Kanban] Could not register board tabs from configurations.', error);
    registeredWorkspaceViews = [];
  }
}

export const onUnload: UmbEntryPointOnUnload = (_host, extensionRegistry) => {
  for (const manifest of registeredWorkspaceViews) {
    extensionRegistry.unregister(manifest.alias);
  }
  registeredWorkspaceViews = [];

  if (!replaced) return;

  extensionRegistry.unregister(KANBAN_DOCUMENT_COLLECTION_ALIAS);
  extensionRegistry.register(replaced);

  replaced = undefined;
};
