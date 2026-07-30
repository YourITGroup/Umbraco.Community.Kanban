import { describe, it, expect } from 'vitest';
import { buildBoardQuery, buildLaneBody } from './kanban-data-source.js';

describe('buildBoardQuery', () => {
  it('always sends the parent id', () => {
    expect(buildBoardQuery({ parentId: 'p1' })).toEqual({ parentId: 'p1' });
  });

  it('omits everything that was not supplied', () => {
    const query = buildBoardQuery({ parentId: 'p1' });

    expect('configId' in query).toBe(false);
    expect('culture' in query).toBe(false);
    expect('lane' in query).toBe(false);
    expect('skip' in query).toBe(false);
    expect('take' in query).toBe(false);
  });

  it('sends every supplied value', () => {
    expect(
      buildBoardQuery({ parentId: 'p1', configId: 'c1', culture: 'da-DK', lane: 'todo', skip: 25, take: 10 }),
    ).toEqual({ parentId: 'p1', configId: 'c1', culture: 'da-DK', lane: 'todo', skip: 25, take: 10 });
  });

  it('keeps an empty lane, which addresses the unassigned lane', () => {
    expect(buildBoardQuery({ parentId: 'p1', lane: '', skip: 0 })).toEqual({
      parentId: 'p1',
      lane: '',
      skip: 0,
    });
  });

  it('keeps a zero skip, which is distinct from omitting it', () => {
    expect(buildBoardQuery({ parentId: 'p1', lane: 'todo', skip: 0 }).skip).toBe(0);
  });

  it('omits an empty culture rather than asking for the empty culture', () => {
    expect('culture' in buildBoardQuery({ parentId: 'p1', culture: '' })).toBe(false);
  });
});

describe('buildLaneBody', () => {
  it('always sends the lane value', () => {
    expect(buildLaneBody({ cardKey: 'c1', laneValue: 'doing' })).toEqual({ laneValue: 'doing' });
  });

  it('keeps an empty lane value, which clears the lane property', () => {
    // Dragging into the unassigned lane writes the empty string; dropping it would leave the card put.
    expect(buildLaneBody({ cardKey: 'c1', laneValue: '' })).toEqual({ laneValue: '' });
  });

  it('sends a culture when there is one', () => {
    expect(buildLaneBody({ cardKey: 'c1', laneValue: 'doing', culture: 'da-DK' })).toEqual({
      laneValue: 'doing',
      culture: 'da-DK',
    });
  });

  it('omits a null culture rather than sending null', () => {
    expect('culture' in buildLaneBody({ cardKey: 'c1', laneValue: 'doing', culture: null })).toBe(false);
  });

  it('omits an empty culture rather than asking for the empty culture', () => {
    // Matches buildBoardQuery: an empty culture means "no culture", not "the culture named ''".
    expect('culture' in buildLaneBody({ cardKey: 'c1', laneValue: 'doing', culture: '' })).toBe(false);
  });

  it('never sends the card key in the body, because it is a path segment', () => {
    expect('cardKey' in buildLaneBody({ cardKey: 'c1', laneValue: 'doing' })).toBe(false);
  });
});
