import { describe, it, expect } from 'vitest';
import { isEmptyOverride, mergeOverridesWithLanes } from './lane-override.model.js';

describe('lane override model', () => {
  it('pairs each resolved lane with its override', () => {
    const rows = mergeOverridesWithLanes(
      [
        { value: 'open', name: 'Open', isUnassigned: false },
        { value: 'done', name: 'Done', isUnassigned: false },
      ],
      [{ value: 'done', colour: 'green' }],
    );

    expect(rows.map((r) => r.value)).toEqual(['open', 'done']);
    expect(rows[0].override).toBeUndefined();
    expect(rows[1].override?.colour).toBe('green');
    expect(rows.every((r) => r.orphaned === false)).toBe(true);
  });

  it('keeps an override whose lane no longer resolves and flags it', () => {
    const rows = mergeOverridesWithLanes(
      [{ value: 'open', name: 'Open', isUnassigned: false }],
      [{ value: 'archived', colour: 'grey' }],
    );

    const orphan = rows.find((r) => r.value === 'archived');
    expect(orphan).toBeDefined();
    expect(orphan!.orphaned).toBe(true);
  });

  it('excludes the unassigned lane, which is always neutral', () => {
    const rows = mergeOverridesWithLanes(
      [
        { value: 'open', name: 'Open', isUnassigned: false },
        { value: '', name: 'Unassigned', isUnassigned: true },
      ],
      [],
    );

    expect(rows.map((r) => r.value)).toEqual(['open']);
  });

  it('matches override values case-insensitively, as the server does', () => {
    const rows = mergeOverridesWithLanes(
      [{ value: 'open', name: 'Open', isUnassigned: false }],
      [{ value: 'OPEN', colour: 'red' }],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].override?.colour).toBe('red');
  });

  it('carries a hidden override through to its row', () => {
    const rows = mergeOverridesWithLanes(
      [{ value: 'open', name: 'Open', isUnassigned: false, hidden: true }],
      [{ value: 'open', hidden: true }],
    );

    expect(rows[0].override?.hidden).toBe(true);
  });
});

describe('isEmptyOverride', () => {
  it('is empty when nothing is set', () => {
    expect(isEmptyOverride({ value: 'open' })).toBe(true);
  });

  it('is not empty when the lane is hidden', () => {
    expect(isEmptyOverride({ value: 'open', hidden: true })).toBe(false);
  });

  it('is empty when hidden is explicitly false, which is the default anyway', () => {
    // Otherwise un-hiding a lane would leave a row behind for every lane an editor ever toggled.
    expect(isEmptyOverride({ value: 'open', hidden: false })).toBe(true);
  });

  it.each(['colour', 'icon', 'label'] as const)('is not empty when %s is set', (field) => {
    expect(isEmptyOverride({ value: 'open', [field]: 'something' })).toBe(false);
  });
});
