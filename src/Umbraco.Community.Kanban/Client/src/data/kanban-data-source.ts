import type { KanbanBoardModel } from './kanban-board.types.js';

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

export interface KanbanDataSource {
  getBoard(query: KanbanBoardQuery): Promise<KanbanBoardOutcome>;
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
