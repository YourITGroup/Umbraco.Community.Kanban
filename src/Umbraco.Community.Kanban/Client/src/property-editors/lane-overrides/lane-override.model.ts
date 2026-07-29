export interface KanbanLaneOverrideValue {
  value: string;
  colour?: string;
  icon?: string;
  label?: string;
}

export interface KanbanResolvedLane {
  value: string;
  name: string;
  isUnassigned: boolean;
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
