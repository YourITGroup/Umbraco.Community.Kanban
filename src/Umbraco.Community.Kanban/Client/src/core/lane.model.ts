/**
 * The CSS colour for a lane header.
 *
 * `toVariable` is injected rather than imported so this stays testable in the Node test
 * environment; the element passes Umbraco's own extractUmbColorVariable. An Umbraco colour
 * alias is preferred because it tracks light and dark mode; anything else is passed through
 * as a raw CSS colour, which supports brand colours at the cost of theme awareness.
 */
export function laneColourStyle(
  colour: string | null | undefined,
  toVariable: (alias: string) => string | undefined,
): string | undefined {
  if (!colour) return undefined;

  const variable = toVariable(colour);

  return variable ? `var(${variable})` : colour;
}
