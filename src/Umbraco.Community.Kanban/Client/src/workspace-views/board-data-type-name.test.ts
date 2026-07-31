import { describe, it, expect } from 'vitest';
import { buildBoardDataTypeName, buildCalendarDataTypeName } from './board-data-type-name.js';

describe('buildBoardDataTypeName', () => {
  it('derives the name from the Collection data type it was created from', () => {
    expect(buildBoardDataTypeName('List View - bookingList')).toBe('List View - bookingList Kanban Board');
  });

  it('trims surrounding whitespace rather than baking it into the name', () => {
    expect(buildBoardDataTypeName('  List View - bookingList  ')).toBe('List View - bookingList Kanban Board');
  });

  it.each([undefined, null, '', '   '])('falls back to a bare name when given %p', (name) => {
    expect(buildBoardDataTypeName(name)).toBe('Kanban Board');
  });
});

describe('buildCalendarDataTypeName', () => {
  it('appends the calendar suffix to the collection name', () => {
    expect(buildCalendarDataTypeName('List View - bookingList')).toBe('List View - bookingList Kanban Calendar');
  });

  it('falls back to the bare suffix when the collection has no name', () => {
    expect(buildCalendarDataTypeName(undefined)).toBe('Kanban Calendar');
  });
});
