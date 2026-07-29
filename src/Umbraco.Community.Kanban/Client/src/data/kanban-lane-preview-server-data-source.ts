import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { KANBAN_LANES_PREVIEW_ENDPOINT } from '@/constants.js';
import type { KanbanResolvedLane } from '@/property-editors/lane-overrides/lane-override.model.js';
import type { KanbanLanePreviewRequest } from './kanban-lane-preview-data-source.js';

interface KanbanLanePreviewResponse {
  lanes: KanbanResolvedLane[];
}

/**
 * Resolves the lanes a configuration would produce, without it having been saved.
 *
 * Returns undefined when the request failed and an empty array when it succeeded but produced no
 * lanes: the editor says different things about the two, so they must not collapse into one value.
 * Notifications are disabled because a failure here is shown inline beside the setting.
 */
export async function previewLanes(
  host: UmbControllerHost,
  request: KanbanLanePreviewRequest,
): Promise<KanbanResolvedLane[] | undefined> {
  const { data, error } = await tryExecute(
    host,
    umbHttpClient.post<KanbanLanePreviewResponse>({
      url: KANBAN_LANES_PREVIEW_ENDPOINT,
      body: request,
      security: [{ type: 'http', scheme: 'bearer' }],
    }),
    { disableNotifications: true },
  );

  if (error || !data) return undefined;

  return data.lanes ?? [];
}
