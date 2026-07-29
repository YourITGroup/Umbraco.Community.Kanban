/** The board configuration values that decide which lanes exist, as the editor currently holds them. */
export interface KanbanLanePreviewInput {
  laneProperty?: string;
  laneContentTypeKey?: string;
  useManualLanes?: boolean;
  manualLanes?: unknown[];
  laneSource?: string;

  /**
   * Accepted and deliberately ignored, so a caller holding a whole board configuration can pass it
   * straight in. Overrides restyle lanes; they cannot change which lanes exist.
   */
  laneOverrides?: unknown[];
}

/** Mirrors KanbanLanePreviewRequestModel, minus contentTypeKey — see below. */
export interface KanbanLanePreviewRequest {
  configuration: Record<string, unknown>;
}

/**
 * Assembles a preview request, or reports that there is nothing to preview.
 *
 * `contentTypeKey` is deliberately never sent. The configuration editor has no document and so no
 * content type of its own; omitting it lets the server fall back to the configuration's own
 * `laneContentTypeKey` through `EffectiveContentTypeKey`, which is the only content type available
 * here. Sending an empty GUID instead would be treated as a real answer and resolve nothing.
 *
 * The overrides being edited are not sent either: they restyle lanes, they cannot change which
 * lanes exist, so including them would make the request change on every keystroke for no effect.
 *
 * Kept apart from the HTTP call in `kanban-lane-preview-server-data-source.ts` for the same reason
 * `buildBoardQuery` is: Vitest runs in Node here, where the backoffice packages do not resolve, so
 * only a module free of them can be tested at all.
 */
export function buildLanePreviewRequest(input: KanbanLanePreviewInput): KanbanLanePreviewRequest | undefined {
  const laneProperty = input.laneProperty?.trim() ?? '';
  const useManualLanes = input.useManualLanes === true;

  // A manual board resolves lanes with no property at all, so either one alone is enough.
  if (!laneProperty && !useManualLanes) return undefined;

  const configuration: Record<string, unknown> = {};

  if (laneProperty) configuration.laneProperty = laneProperty;
  if (input.laneContentTypeKey) configuration.laneContentTypeKey = input.laneContentTypeKey;
  if (useManualLanes) configuration.useManualLanes = true;
  if (input.manualLanes?.length) configuration.manualLanes = input.manualLanes;
  if (input.laneSource) configuration.laneSource = input.laneSource;

  return { configuration };
}
