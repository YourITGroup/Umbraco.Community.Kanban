import { describe, it, expect } from 'vitest';
import {
  addDays,
  addMonths,
  agendaDays,
  monthGrid,
  monthRange,
  partitionCell,
  placeByDay,
  weekRange,
} from './calendar.model.js';
import type { KanbanCalendarItemModel } from '../data/kanban-calendar.types.js';

function item(date: string, time: string | null = null, name = 'x'): KanbanCalendarItemModel {
  return {
    date,
    time,
    card: {
      key: `k-${name}`,
      name,
      contentTypeAlias: 'booking',
      contentTypeKey: 'ct',
      state: 'draft',
      canUpdate: false,
      canCreate: false,
      children: [],
      childTotal: 0,
      childTotalIsExact: true,
      properties: [],
    },
  };
}

describe('monthGrid', () => {
  it('lays out a leap February exactly, Monday start', () => {
    // Feb 2028: 29 days, starts on a Tuesday.
    const weeks = monthGrid(2028, 2, 1, '2028-02-15');

    expect(weeks).toHaveLength(5);
    expect(weeks[0].cells[0].date).toBe('2028-01-31'); // Monday before the 1st
    expect(weeks[0].cells[0].inMonth).toBe(false);
    expect(weeks[0].cells[1].date).toBe('2028-02-01');
    expect(weeks[0].cells[1].inMonth).toBe(true);
    expect(weeks[4].cells[6].date).toBe('2028-03-05');
    expect(weeks.every((week) => week.cells.length === 7)).toBe(true);
  });

  it('lays out a non-leap February that fits exactly four weeks with no leading strip', () => {
    // Feb 2027 starts on Monday and has 28 days: a perfect 4x7 grid, Monday start.
    const weeks = monthGrid(2027, 2, 1, '2027-06-01');

    expect(weeks).toHaveLength(4);
    expect(weeks[0].cells[0].date).toBe('2027-02-01');
    expect(weeks[3].cells[6].date).toBe('2027-02-28');
    expect(weeks.flatMap((w) => w.cells).every((cell) => cell.inMonth)).toBe(true);
  });

  it('respects a Sunday week start', () => {
    // Aug 2026 starts on a Saturday.
    const weeks = monthGrid(2026, 8, 0, '2026-08-15');

    expect(weeks[0].cells[0].date).toBe('2026-07-26'); // Sunday before the 1st
    expect(weeks[0].cells[6].date).toBe('2026-08-01');
  });

  it('marks today only on the matching cell', () => {
    const weeks = monthGrid(2026, 8, 1, '2026-08-15');
    const todayCells = weeks.flatMap((w) => w.cells).filter((cell) => cell.isToday);

    expect(todayCells.map((cell) => cell.date)).toEqual(['2026-08-15']);
  });
});

describe('monthRange', () => {
  it('covers the whole visible grid including out-of-month days', () => {
    // May 2027, Monday start: 1 May is a Saturday → grid runs 26 Apr to 6 Jun.
    expect(monthRange(2027, 5, 1)).toEqual({ from: '2027-04-26', to: '2027-06-06' });
  });

  it('is exactly the month when it fits the grid perfectly', () => {
    expect(monthRange(2027, 2, 1)).toEqual({ from: '2027-02-01', to: '2027-02-28' });
  });
});

describe('weekRange', () => {
  it('finds the Monday-start week containing a mid-week date', () => {
    // 2026-08-15 is a Saturday.
    expect(weekRange('2026-08-15', 1)).toEqual({ from: '2026-08-10', to: '2026-08-16' });
  });

  it('crosses a month boundary', () => {
    // 2026-09-01 is a Tuesday; Monday start puts the week from 31 Aug.
    expect(weekRange('2026-09-01', 1)).toEqual({ from: '2026-08-31', to: '2026-09-06' });
  });

  it('starts on the date itself when it is the week start', () => {
    // 2026-08-16 is a Sunday.
    expect(weekRange('2026-08-16', 0)).toEqual({ from: '2026-08-16', to: '2026-08-22' });
  });
});

describe('placeByDay', () => {
  it('groups by date and orders null-time first, then time, then name', () => {
    const placed = placeByDay([
      item('2026-08-15', '10:00', 'b'),
      item('2026-08-15', null, 'allday'),
      item('2026-08-15', '09:00', 'a'),
      item('2026-08-15', '09:00', 'A2'),
      item('2026-08-16', '08:00', 'next'),
    ]);

    expect([...placed.keys()].sort()).toEqual(['2026-08-15', '2026-08-16']);
    expect(placed.get('2026-08-15')!.map((entry) => entry.card.name)).toEqual(['allday', 'a', 'A2', 'b']);
  });
});

describe('partitionCell', () => {
  it('shows everything at exactly capacity rather than replacing one item with "+1 more"', () => {
    const items = ['a', 'b', 'c'];

    expect(partitionCell(items, 3)).toEqual({ visible: ['a', 'b', 'c'], more: 0 });
  });

  it('cuts to capacity and counts the rest', () => {
    expect(partitionCell(['a', 'b', 'c', 'd', 'e'], 3)).toEqual({ visible: ['a', 'b', 'c'], more: 2 });
  });
});

describe('agendaDays', () => {
  it('lists days in ascending order with their ordered items, omitting empty days', () => {
    const days = agendaDays([
      item('2026-08-20', '09:00', 'later'),
      item('2026-08-15', '10:00', 'b'),
      item('2026-08-15', null, 'allday'),
    ]);

    expect(days.map((day) => day.date)).toEqual(['2026-08-15', '2026-08-20']);
    expect(days[0].items.map((entry) => entry.card.name)).toEqual(['allday', 'b']);
  });
});

describe('date arithmetic', () => {
  it('addDays crosses a month end', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('addDays crosses a year end backwards', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('addMonths wraps December into January', () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it('addMonths wraps January into December backwards', () => {
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
});
