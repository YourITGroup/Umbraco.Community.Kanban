/** Mirrors KanbanLanePalette.Cycle on the server. Keep the two in step. */
export const KANBAN_LANE_PALETTE = [
  'yellow',
  'pink',
  'blue',
  'light-blue',
  'red',
  'green',
  'brown',
  'grey',
] as const;

/**
 * The palette aliases as concrete colours, because a colour picker's swatches must be real CSS —
 * `light-blue` is not a CSS colour. Taken from the `--uui-palette-*` variables the aliases resolve to
 * through Umbraco's own extractUmbColorVariable, which are declared once in UUI's palette.css with no
 * theme override, so a hex here is exactly what an alias renders as under either theme.
 */
export const KANBAN_LANE_SWATCH_BY_ALIAS: Readonly<Record<string, string>> = {
  yellow: '#fad634', // --uui-palette-sunglow
  pink: '#ffe8e6', // --uui-palette-spanish-pink
  blue: '#283a97', // --uui-palette-violet-blue
  'light-blue': '#3879ff', // --uui-palette-malibu
  red: '#df2a5d', // --uui-palette-maroon-flush
  green: '#2bc37c', // --uui-palette-jungle-green
  brown: '#9d8057', // --uui-palette-chamoisee
  grey: '#9b9b9b', // --uui-palette-dusty-grey
};

/** The swatches a lane colour picker offers, in palette order so it reads like the board's cycle. */
export const KANBAN_LANE_SWATCHES: readonly string[] = KANBAN_LANE_PALETTE.map(
  (alias) => KANBAN_LANE_SWATCH_BY_ALIAS[alias],
);
