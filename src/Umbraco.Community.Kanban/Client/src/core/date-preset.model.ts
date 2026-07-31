/**
 * The property value a create-preset needs so a document created from a calendar slot lands on
 * that slot. The preset patches the workspace's *editor-facing* value (core merges
 * `modalContext.data.preset` over the scaffold), so the shape per family mirrors what each
 * editor's ToEditor returns:
 *
 * - The four modern JSON editors take `{ date: string }` (DateTimeEditorValue). FromEditor parses
 *   the date with DateTimeOffset.TryParse, so a plain ISO local string is safe; timeZone is left
 *   for the editor's own default.
 * - The deprecated `Umbraco.DateTime` takes the bare "yyyy-MM-dd HH:mm:ss" string its old picker
 *   uses.
 * - Time-only has no calendar date, and system properties/unknown editors cannot be preset at
 *   all — `undefined` tells the host not to offer slot creation.
 */
export function datePresetValue(
  editorAlias: string | null | undefined,
  slot: { date: string; time?: string },
): unknown | undefined {
  const time = slot.time ?? '00:00';

  switch (editorAlias) {
    case 'Umbraco.DateTimeWithTimeZone':
    case 'Umbraco.DateTimeUnspecified':
      return { date: `${slot.date}T${time}:00` };

    case 'Umbraco.DateOnly':
      return { date: `${slot.date}T00:00:00` };

    case 'Umbraco.DateTime':
      return `${slot.date} ${time}:00`;

    default:
      return undefined;
  }
}
