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

/** Every Kanban configuration, boards and calendars alike. Empty on any request failure. */
export async function getAllConfigurations(host: UmbControllerHost): Promise<KanbanConfigurationModel[]> {
  const { data, error } = await tryExecute(
    host,
    umbHttpClient.get<KanbanConfigurationModel[]>({
      url: KANBAN_CONFIGURATIONS_ENDPOINT,
      security: [{ type: 'http', scheme: 'bearer' }],
    }),
  );

  return error || !data ? [] : data;
}

/** Every Kanban configuration of one kind, for the Data Type workspace pickers. */
export async function getConfigurationsOfKind(
  host: UmbControllerHost,
  kind: 'Board' | 'Calendar',
): Promise<KanbanConfigurationModel[]> {
  const all = await getAllConfigurations(host);

  return all.filter((configuration) => configuration.kind === kind);
}

/** Every Kanban Board configuration, for the Data Type workspace picker. */
export async function getBoardConfigurations(host: UmbControllerHost): Promise<KanbanConfigurationModel[]> {
  return getConfigurationsOfKind(host, 'Board');
}

export async function getCalendarConfigurations(host: UmbControllerHost): Promise<KanbanConfigurationModel[]> {
  return getConfigurationsOfKind(host, 'Calendar');
}
