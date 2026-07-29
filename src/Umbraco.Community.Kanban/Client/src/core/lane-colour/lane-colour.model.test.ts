import { describe, it, expect } from 'vitest';
import {
  KANBAN_LANE_PALETTE,
  KANBAN_LANE_SWATCHES,
  KANBAN_LANE_SWATCH_BY_ALIAS,
} from './lane-colour.model.js';

describe('KANBAN_LANE_PALETTE', () => {
  it('matches the server palette exactly', () => {
    expect(KANBAN_LANE_PALETTE).toEqual([
      'yellow',
      'pink',
      'blue',
      'light-blue',
      'red',
      'green',
      'brown',
      'grey',
    ]);
  });
});

describe('KANBAN_LANE_SWATCHES', () => {
  it('offers one colour per palette alias, in the same order', () => {
    // The picker needs real CSS values, but the palette is the mirror of the server's cycle and
    // stays as aliases. Two lists means they can drift; this is the guard that they do not.
    expect(KANBAN_LANE_SWATCHES).toHaveLength(KANBAN_LANE_PALETTE.length);
    expect(KANBAN_LANE_SWATCHES).toEqual(KANBAN_LANE_PALETTE.map((alias) => KANBAN_LANE_SWATCH_BY_ALIAS[alias]));
  });

  it('maps every alias to a six-digit hex colour', () => {
    for (const alias of KANBAN_LANE_PALETTE) {
      expect(KANBAN_LANE_SWATCH_BY_ALIAS[alias]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('has no entry for an alias the palette does not contain', () => {
    // Guards a copy-paste of the legacy umbracoColors entries, which resolve to duplicate hues.
    expect(Object.keys(KANBAN_LANE_SWATCH_BY_ALIAS).sort()).toEqual([...KANBAN_LANE_PALETTE].sort());
  });
});
