import type { KanbanCardModel } from './kanban-board.types.js';

/** Mirrors the server's KanbanCalendarItemModel. */
export interface KanbanCalendarItemModel {
  /** Start calendar date, 'yyyy-MM-dd', always inside the requested range. */
  date: string;
  /** Start time 'HH:mm', or null when the stored value is date-only. */
  time?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  /** The raw category property value; null when uncategorised. */
  category?: string | null;
  card: KanbanCardModel;
}

/** Mirrors the server's KanbanCategoryModel — a category resolved like a lane. */
export interface KanbanCategoryModel {
  value: string;
  name: string;
  colour?: string | null;
  icon?: string | null;
}

/** Mirrors the server's KanbanCalendarResponseModel. */
export interface KanbanCalendarModel {
  items: KanbanCalendarItemModel[];
  categories: KanbanCategoryModel[];
  /** Null for system date properties, which cannot be preset on creation. */
  datePropertyEditorAlias?: string | null;
  /** Whether the configuration shows the agenda list — echoed so hosts need only the config key. */
  showAgenda?: boolean;
  undatedCount: number;
  truncated: boolean;
}
