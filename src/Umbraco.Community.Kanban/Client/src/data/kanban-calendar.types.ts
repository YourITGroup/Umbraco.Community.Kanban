import type { KanbanCardModel } from './kanban-board.types.js';

/** Mirrors the server's KanbanCalendarItemModel. */
export interface KanbanCalendarItemModel {
  /** Start calendar date as stored, 'yyyy-MM-dd'. */
  date: string;
  /** Start time as stored, 'HH:mm', or null when the stored value is date-only. */
  time?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  /**
   * The moment the start value names (ISO-8601 with offset), present only when the stored value
   * states its own zone. `viewer-time.model.ts` converts it, replacing date/time.
   */
  instant?: string | null;
  /** The end value's moment, on the same terms as `instant`. */
  endInstant?: string | null;
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
  /** The configured date property alias — the property a slot-created document presets. */
  datePropertyAlias: string;
  /** The parent's content type key, which is what the allowed-child-types lookup needs. */
  parentContentTypeKey: string;
  /** Whether the configuration shows the agenda list — echoed so hosts need only the config key. */
  showAgenda?: boolean;
  undatedCount: number;
  truncated: boolean;
}
