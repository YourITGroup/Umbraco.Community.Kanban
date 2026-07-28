/** Mirrors KanbanManualLane on the server. */
export interface KanbanManualLaneValue {
  value: string;
  label?: string;
  colour?: string;
  icon?: string;
}

/** Appends a blank lane. Returns a new array; never mutates the input. */
export function addLane(lanes: KanbanManualLaneValue[]): KanbanManualLaneValue[] {
  return [...lanes, { value: '' }];
}

export function removeLaneAt(lanes: KanbanManualLaneValue[], index: number): KanbanManualLaneValue[] {
  if (index < 0 || index >= lanes.length) return [...lanes];

  return lanes.filter((_, i) => i !== index);
}

/**
 * Moves a lane. Order is not cosmetic — it decides which palette colour each
 * uncoloured lane gets, so this has to be exact.
 */
export function moveLane(
  lanes: KanbanManualLaneValue[],
  from: number,
  to: number,
): KanbanManualLaneValue[] {
  if (from === to) return [...lanes];
  if (from < 0 || from >= lanes.length) return [...lanes];
  if (to < 0 || to >= lanes.length) return [...lanes];

  const next = [...lanes];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);

  return next;
}
