/** Mirrors KanbanCardStates on the server. */
export type KanbanCardState = 'published' | 'publishedPendingChanges' | 'draft';

/** Mirrors KanbanCardPropertyModel. */
export interface KanbanCardPropertyModel {
  alias: string;
  name: string;
  /** The property editor *schema* alias, handed to umb-value-summary-extension. */
  editorAlias: string;
  /** A UFM template to render instead of the value's own summary, when configured. */
  nameTemplate?: string | null;
  value: unknown;
}

/** Mirrors KanbanCardChildModel. */
export interface KanbanCardChildModel {
  key: string;
  name: string;
  /** Verbatim from the content type, colour suffix and all — umb-icon parses it. */
  icon?: string | null;
}

/** Mirrors KanbanCardModel. */
export interface KanbanCardModel {
  key: string;
  name: string;
  contentTypeAlias: string;
  /** Verbatim from the content type, colour suffix and all — umb-icon parses it. */
  icon?: string | null;
  state: KanbanCardState;
  /** Whether the current user may update this card; with the board's allowDrag, gates dragging. */
  canUpdate: boolean;
  /** Whether the current user may create under this card; gates the add button. */
  canCreate: boolean;
  /** The card's content type key — what the allowed-child-types lookup is keyed by. */
  contentTypeKey: string;
  /** The first few children, in the board's configured child order. Empty unless the board shows them. */
  children: KanbanCardChildModel[];
  /** Browse-filtered, and safe to display — unlike KanbanBoardModel.childCount. */
  childTotal: number;
  /** False when the board hit its grandchild cap, making childTotal a lower bound. */
  childTotalIsExact: boolean;
  properties: KanbanCardPropertyModel[];
  /**
   * Client-only, never sent by the server: true while a lane write for this card is in flight. Lives on
   * the card rather than in a separate set on the board so the lane can pass it straight down, the same
   * way every other per-card value already reaches the card element.
   */
  saving?: boolean;
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
  /** Whether cards on this board list their children. Board-wide, so it is not on the card. */
  showChildItems: boolean;
  /** Whether this board's configuration permits dragging cards between lanes. Board-wide. */
  allowDrag: boolean;
}
