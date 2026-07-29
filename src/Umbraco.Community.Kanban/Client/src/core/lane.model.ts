/**
 * The CSS colour for a lane header.
 *
 * `toVariable` is injected rather than imported so this stays testable in the Node test
 * environment; the element passes Umbraco's own extractUmbColorVariable. An alias is resolved to its
 * `--uui-palette-*` variable and anything else is passed through as a raw CSS colour. The two are
 * equivalent in practice: those variables are declared once in UUI's palette.css with no theme
 * override, so an alias does not track light and dark mode — a claim this comment used to make.
 * Colours picked in the configuration editor are stored as hex; aliases come from boards configured
 * before that control existed, and from the server's own palette cycle.
 */
export function laneColourStyle(
  colour: string | null | undefined,
  toVariable: (alias: string) => string | undefined,
): string | undefined {
  if (!colour) return undefined;

  const variable = toVariable(colour);

  return variable ? `var(${variable})` : colour;
}
