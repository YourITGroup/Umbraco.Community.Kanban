/** Mirrors KanbanCardStates on the server. */
export type KanbanCardState = 'published' | 'publishedPendingChanges' | 'draft';

/** Mirrors KanbanCardPropertyModel. */
export interface KanbanCardPropertyModel {
  alias: string;
  name: string;
  /** The property editor *schema* alias, handed to umb-value-summary-extension. */
  editorAlias: string;
  value: unknown;
}

/** Mirrors KanbanCardModel. */
export interface KanbanCardModel {
  key: string;
  name: string;
  contentTypeAlias: string;
  /** Verbatim from the content type, colour suffix and all — umb-icon parses it. */
  icon?: string | null;
  state: KanbanCardState;
  /** Populated by the server; unused until drag arrives in milestone 3. */
  canUpdate: boolean;
  properties: KanbanCardPropertyModel[];
}

/** Mirrors KanbanBoardLaneModel. */
export interface KanbanBoardLaneModel {
  value: string;
  name: string;
  colour?: string | null;
  icon?: string | null;
  isUnassigned: boolean;
  acceptsDrops: boolean;
  /** Exact while totalIsExact, otherwise a lower bound. */
  total: number;
  totalIsExact: boolean;
  skip: number;
  cards: KanbanCardModel[];
}

/** Mirrors KanbanBoardResponseModel. */
export interface KanbanBoardModel {
  lanes: KanbanBoardLaneModel[];
  truncated: boolean;
  childCount: number;
}
