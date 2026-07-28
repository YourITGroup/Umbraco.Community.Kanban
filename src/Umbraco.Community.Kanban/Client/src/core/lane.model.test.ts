import { describe, it, expect } from 'vitest';
import { laneColourStyle } from './lane.model.js';

const known = (alias: string) => (alias === 'blue' ? '--uui-palette-violet-blue' : undefined);

describe('laneColourStyle', () => {
  it('resolves an Umbraco colour alias to its palette variable, so lanes track the theme', () => {
    expect(laneColourStyle('blue', known)).toBe('var(--uui-palette-violet-blue)');
  });

  it('passes an unrecognised value through as a raw CSS colour', () => {
    expect(laneColourStyle('#ff8800', known)).toBe('#ff8800');
  });

  it('has no colour for a lane that was not given one', () => {
    expect(laneColourStyle(null, known)).toBeUndefined();
    expect(laneColourStyle(undefined, known)).toBeUndefined();
    expect(laneColourStyle('', known)).toBeUndefined();
  });
});
