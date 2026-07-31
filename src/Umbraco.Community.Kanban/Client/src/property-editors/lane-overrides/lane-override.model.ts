export interface KanbanLaneOverrideValue {
  value: string;
  colour?: string;
  icon?: string;
  label?: string;
  /** True keeps the lane/category, and everything in it, off the board or calendar. */
  hidden?: boolean;
}

export interface KanbanResolvedLane {
  value: string;
  name: string;
  isUnassigned: boolean;
  /** Echoed by the preview so a hidden lane can still be listed, and un-hidden. */
  hidden?: boolean;
}

export interface KanbanLaneOverrideRow {
  value: string;
  name: string;
  override?: KanbanLaneOverrideValue;
  /** True when the override targets a lane the configuration no longer resolves. */
  orphaned: boolean;
}

/**
 * Pairs resolved lanes with their overrides, keeping overrides whose lane has gone
 * so the editor can flag them instead of silently losing the styling.
 */
export function mergeOverridesWithLanes(
  lanes: KanbanResolvedLane[],
  overrides: KanbanLaneOverrideValue[],
): KanbanLaneOverrideRow[] {
  const byValue = new Map(overrides.map((o) => [o.value.toLowerCase(), o]));

  const rows: KanbanLaneOverrideRow[] = lanes
    .filter((lane) => lane.isUnassigned === false)
    .map((lane) => {
      const key = lane.value.toLowerCase();
      const override = byValue.get(key);
      byValue.delete(key);
      return { value: lane.value, name: lane.name, override, orphaned: false };
    });

  for (const orphan of byValue.values()) {
    rows.push({ value: orphan.value, name: orphan.value, override: orphan, orphaned: true });
  }

  return rows;
}

/**
 * True when an override says nothing at all and should not be stored, so an untouched lane leaves no
 * residue in the configuration.
 *
 * `hidden: false` counts as saying nothing — it is the default, and keeping it would leave a row behind
 * for every lane an editor ever un-hid.
 */
export function isEmptyOverride(value: KanbanLaneOverrideValue): boolean {
  return !value.colour && !value.icon && !value.label && !value.hidden;
}
