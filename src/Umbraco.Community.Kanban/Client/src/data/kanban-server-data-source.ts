import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { KANBAN_BOARD_ENDPOINT } from '@/constants.js';
import { buildBoardQuery, type KanbanBoardOutcome, type KanbanBoardQuery, type KanbanDataSource } from './kanban-data-source.js';
import type { KanbanBoardModel } from './kanban-board.types.js';

/**
 * Calls GET /board with backoffice auth. umbHttpClient is configured throwOnError, so
 * tryExecute is required rather than optional — it turns a non-2xx into a returned error.
 * Notifications are disabled because a 400 here is guidance, not a fault, and the board
 * element renders it inline.
 */
export class KanbanServerDataSource implements KanbanDataSource {
  #host: UmbControllerHost;

  constructor(host: UmbControllerHost) {
    this.#host = host;
  }

  async getBoard(query: KanbanBoardQuery): Promise<KanbanBoardOutcome> {
    const { data, error } = await tryExecute(
      this.#host,
      umbHttpClient.get<KanbanBoardModel>({
        url: KANBAN_BOARD_ENDPOINT,
        query: buildBoardQuery(query),
        security: [{ type: 'http', scheme: 'bearer' }],
      }),
      { disableNotifications: true },
    );

    if (error) {
      return (error as { status?: number }).status === 400 ? { kind: 'not-configured' } : { kind: 'error' };
    }

    return data ? { kind: 'success', board: data } : { kind: 'error' };
  }
}
