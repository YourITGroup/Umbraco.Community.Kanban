import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

/** What the action bar needs to know to render itself. */
export interface KanbanBoardActionsState {
  /** How many loaded cards have unpublished changes. Zero hides the bar. */
  pending: number;
  /** Whether there is a move on this session's stack to undo. */
  canUndo: boolean;
  /** Whether a write is in flight, so every button disables. */
  busy: boolean;
}

/** What pressing a button does. Owned by the board, which holds the data and the write path. */
export interface KanbanBoardActionsHandlers {
  publish: () => Promise<void>;
  undo: () => Promise<void>;
}

const EMPTY: KanbanBoardActionsState = { pending: 0, canUndo: false, busy: false };

/**
 * Carries the board's action state up to the collection layout, which is the only element that can render
 * into `umb-body-layout`'s footer slot — where the native bulk-action bar renders, and the reason that bar
 * spans the full width while anything inside the board cannot.
 *
 * A context rather than events because the direction is wrong for events: the layout is an *ancestor* of
 * the board, so a bar it renders has no way to dispatch an action back down. Provided by the ancestor and
 * written to by the descendant, which is the way round Umbraco contexts flow.
 *
 * The board keeps every decision — what is pending, what is undoable, what a press does. This only moves
 * that across the boundary, so the bar stays a view of the board rather than a second source of truth.
 */
export class UmbKanbanBoardActionsContext extends UmbContextBase {
  #state = new UmbObjectState<KanbanBoardActionsState>(EMPTY);

  readonly state = this.#state.asObservable();

  #handlers?: KanbanBoardActionsHandlers;

  constructor(host: UmbControllerHost) {
    super(host, KANBAN_BOARD_ACTIONS_CONTEXT);
  }

  /** Called by the board whenever what the bar should show changes. */
  setState(state: KanbanBoardActionsState) {
    this.#state.setValue(state);
  }

  setHandlers(handlers: KanbanBoardActionsHandlers) {
    this.#handlers = handlers;
  }

  /**
   * Called when the board goes away — a different view, or a reload. Without it the bar would outlive the
   * board it acts on and its buttons would write into nothing.
   */
  clear() {
    this.#handlers = undefined;
    this.#state.setValue(EMPTY);
  }

  async publish() {
    await this.#handlers?.publish();
  }

  async undo() {
    await this.#handlers?.undo();
  }
}

export const KANBAN_BOARD_ACTIONS_CONTEXT = new UmbContextToken<UmbKanbanBoardActionsContext>(
  'Umb.Community.Kanban.BoardActions',
);
