import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import {
  KANBAN_BOARD_ENDPOINT,
  KANBAN_CALENDAR_ENDPOINT,
  KANBAN_CARD_ENDPOINT,
  KANBAN_CARD_LANE_ENDPOINT,
} from '@/constants.js';
import {
  buildBoardQuery,
  buildCalendarQuery,
  buildCardQuery,
  buildLaneBody,
  type KanbanBoardOutcome,
  type KanbanBoardQuery,
  type KanbanCalendarOutcome,
  type KanbanCalendarQuery,
  type KanbanCardLaneCommand,
  type KanbanCardOutcome,
  type KanbanCardQuery,
  type KanbanDataSource,
  type KanbanSetLaneOutcome,
} from './kanban-data-source.js';
import type { KanbanBoardModel, KanbanCardModel, KanbanCardState } from './kanban-board.types.js';
import type { KanbanCalendarModel } from './kanban-calendar.types.js';

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
 * Response body of GET /card/{key}. An interface for the same RequestResult-collapse reason
 * KanbanCardLaneResponseModel documents above.
 */
interface KanbanCardResponseModel {
  isChild: boolean;
  laneValue?: string | null;
  card?: KanbanCardModel | null;
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

  async getCard(query: KanbanCardQuery): Promise<KanbanCardOutcome> {
    const { data, error } = await tryExecute(
      this.#host,
      umbHttpClient.get<KanbanCardResponseModel>({
        url: KANBAN_CARD_ENDPOINT(query.key),
        query: buildCardQuery(query),
        security: [{ type: 'http', scheme: 'bearer' }],
      }),
      // Reconciliation is background work; a toast per failed background fetch would be noise.
      { disableNotifications: true },
    );

    if (error) {
      // 404 is an answer — the document is gone — not a fault. Everything else is transient.
      return (error as { status?: number }).status === 404 ? { kind: 'gone' } : { kind: 'error' };
    }

    if (!data) return { kind: 'error' };

    return data.isChild && data.card
      ? { kind: 'child', laneValue: data.laneValue ?? '', card: data.card }
      : { kind: 'not-child' };
  }

  async getCalendar(query: KanbanCalendarQuery): Promise<KanbanCalendarOutcome> {
    const { data, error } = await tryExecute(
      this.#host,
      umbHttpClient.get<KanbanCalendarModel>({
        url: KANBAN_CALENDAR_ENDPOINT,
        query: buildCalendarQuery(query),
        security: [{ type: 'http', scheme: 'bearer' }],
      }),
      { disableNotifications: true },
    );

    if (error) {
      // Same contract as the board: 400 is "not configured (yet)", a normal state with guidance.
      return (error as { status?: number }).status === 400 ? { kind: 'not-configured' } : { kind: 'error' };
    }

    return data ? { kind: 'success', calendar: data } : { kind: 'error' };
  }
}
