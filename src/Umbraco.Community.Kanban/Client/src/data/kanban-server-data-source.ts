import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { KANBAN_BOARD_ENDPOINT, KANBAN_CARD_LANE_ENDPOINT } from '@/constants.js';
import {
  buildBoardQuery,
  buildLaneBody,
  type KanbanBoardOutcome,
  type KanbanBoardQuery,
  type KanbanCardLaneCommand,
  type KanbanDataSource,
  type KanbanSetLaneOutcome,
} from './kanban-data-source.js';
import type { KanbanBoardModel, KanbanCardState } from './kanban-board.types.js';

/**
 * Response body of PUT /card/{key}/lane. Deliberately a named `interface` rather than an inline object
 * literal or `type` alias: the generated client's `RequestResult` unwraps a generic response type `T` via
 * `T extends Record<string, unknown> ? T[keyof T] : T`, and TypeScript infers an implicit index signature
 * for fresh object-literal types — including `type` aliases — which makes that check true and collapses a
 * single-property shape like `{ state: KanbanCardState }` down to just `KanbanCardState`. A declared
 * `interface` does not get that implicit index signature, so the shape survives intact.
 */
interface KanbanCardLaneResponseModel {
  state: KanbanCardState;
}

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

  async setLane(command: KanbanCardLaneCommand): Promise<KanbanSetLaneOutcome> {
    const { data, error } = await tryExecute(
      this.#host,
      umbHttpClient.put<KanbanCardLaneResponseModel>({
        url: KANBAN_CARD_LANE_ENDPOINT(command.cardKey),
        body: buildLaneBody(command),
        security: [{ type: 'http', scheme: 'bearer' }],
      }),
      // The board shows its own targeted message and snaps the card back, so a generic toast on top of
      // that would be two notifications for one failure.
      { disableNotifications: true },
    );

    if (error) {
      return { kind: 'error', status: (error as { status?: number }).status };
    }

    return data ? { kind: 'success', state: data.state } : { kind: 'error' };
  }
}
