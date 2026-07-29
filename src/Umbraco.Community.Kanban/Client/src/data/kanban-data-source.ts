import type { KanbanBoardModel, KanbanCardState } from './kanban-board.types.js';

export interface KanbanBoardQuery {
  parentId: string;
  configId?: string;
  culture?: string | null;
  /** A single lane to load. The empty string addresses the unassigned lane. */
  lane?: string;
  skip?: number;
  take?: number;
}

/**
 * Why an outcome union rather than a thrown error: "this collection has no Kanban
 * configuration yet" is a normal state on the way to setting a board up, and the view shows
 * guidance for it rather than an error.
 */
export type KanbanBoardOutcome =
  | { kind: 'success'; board: KanbanBoardModel }
  | { kind: 'not-configured' }
  | { kind: 'error' };

/** A request to move one card to one lane. */
export interface KanbanCardLaneCommand {
  cardKey: string;
  /** The empty string clears the lane property, putting the card in the unassigned lane. */
  laneValue: string;
  culture?: string | null;
}

/**
 * Why the status is carried on failure: the board distinguishes 403 (permission changed mid-session) and
 * 404 (card deleted concurrently) in the message it shows, and nothing else can tell them apart once the
 * response has been discarded.
 */
export type KanbanSetLaneOutcome =
  | { kind: 'success'; state: KanbanCardState }
  | { kind: 'error'; status?: number };

export interface KanbanDataSource {
  getBoard(query: KanbanBoardQuery): Promise<KanbanBoardOutcome>;
  setLane(command: KanbanCardLaneCommand): Promise<KanbanSetLaneOutcome>;
}

/**
 * Builds the query string for GET /board. Pure and tested because the empty-string cases
 * are load-bearing: `lane: ''` names the unassigned lane and must survive, while an empty
 * culture means "no culture" and must not be sent.
 */
export function buildBoardQuery(query: KanbanBoardQuery): Record<string, string | number> {
  const built: Record<string, string | number> = { parentId: query.parentId };

  if (query.configId) built.configId = query.configId;
  if (query.culture) built.culture = query.culture;
  if (query.lane !== undefined) built.lane = query.lane;
  if (query.skip !== undefined) built.skip = query.skip;
  if (query.take !== undefined) built.take = query.take;

  return built;
}

/**
 * Builds the body for PUT /card/{key}/lane. Pure and tested for the same reason buildBoardQuery is: the
 * empty-string cases are load-bearing in opposite directions — an empty lane value must survive, because
 * it clears the property, while an empty culture must not be sent at all.
 */
export function buildLaneBody(command: KanbanCardLaneCommand): { laneValue: string; culture?: string } {
  const body: { laneValue: string; culture?: string } = { laneValue: command.laneValue };

  if (command.culture) body.culture = command.culture;

  return body;
}
