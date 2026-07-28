import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { KANBAN_CONFIGURATIONS_ENDPOINT } from '@/constants.js';

/** Mirrors KanbanConfigurationResponseModel. */
export interface KanbanConfigurationModel {
  key: string;
  name: string;
  kind: 'Board' | 'Calendar';
  appliesTo: string[];
  tabName?: string | null;
  tabIcon?: string | null;
}

/** Every Kanban Board configuration, for the Data Type workspace picker. */
export async function getBoardConfigurations(host: UmbControllerHost): Promise<KanbanConfigurationModel[]> {
  const { data, error } = await tryExecute(
    host,
    umbHttpClient.get<KanbanConfigurationModel[]>({
      url: KANBAN_CONFIGURATIONS_ENDPOINT,
      security: [{ type: 'http', scheme: 'bearer' }],
    }),
  );

  if (error || !data) return [];

  return data.filter((configuration) => configuration.kind === 'Board');
}
