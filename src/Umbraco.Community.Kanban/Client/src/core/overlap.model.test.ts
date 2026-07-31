import { describe, it, expect } from 'vitest';
import { blockGeometry, layoutSpans, toDaySpan, type SpanItem } from './overlap.model.js';
import type { KanbanCalendarItemModel } from '../data/kanban-calendar.types.js';

function item(
  date: string,
  time: string | null,
  overrides: Partial<KanbanCalendarItemModel> = {},
): KanbanCalendarItemModel {
  return {
    date,
    time,
    card: {
      key: 'k',
      name: 'x',
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
    ...overrides,
  };
}

function span(start: number, end: number, category: string | null = null): SpanItem<string> {
  return { start, end, category, item: 'x' };
}

describe('toDaySpan', () => {
  it('returns null for a date-only item — that belongs in the all-day strip', () => {
    expect(toDaySpan(item('2026-08-15', null), '2026-08-15')).toBeNull();
  });

  it('gives a timed item with no end a nominal hour', () => {
    expect(toDaySpan(item('2026-08-15', '09:00'), '2026-08-15')).toMatchObject({ start: 540, end: 600 });
  });

  it('uses a same-day end', () => {
    const entry = item('2026-08-15', '09:00', { endDate: '2026-08-15', endTime: '11:30' });

    expect(toDaySpan(entry, '2026-08-15')).toMatchObject({ start: 540, end: 690 });
  });

  it('clamps an end on a later day to the end of this day', () => {
    const entry = item('2026-08-15', '22:00', { endDate: '2026-08-16', endTime: '10:00' });

    expect(toDaySpan(entry, '2026-08-15')).toMatchObject({ start: 1320, end: 1440 });
  });

  it('falls back to the nominal hour when the end is before the start', () => {
    const entry = item('2026-08-15', '10:00', { endDate: '2026-08-15', endTime: '09:00' });

    expect(toDaySpan(entry, '2026-08-15')).toMatchObject({ start: 600, end: 660 });
  });

  it('carries the category', () => {
    expect(toDaySpan(item('2026-08-15', '09:00', { category: 'workshop' }), '2026-08-15')?.category).toBe('workshop');
  });
});

describe('layoutSpans', () => {
  it('gives disjoint spans the full width', () => {
    const laid = layoutSpans([span(540, 600), span(600, 660)]);

    expect(laid.map((l) => ({ column: l.column, columns: l.columns }))).toEqual([
      { column: 0, columns: 1 },
      { column: 0, columns: 1 },
    ]);
  });

  it('puts overlapping spans of different categories side by side, ordered by category', () => {
    const laid = layoutSpans([span(540, 660, 'zoo'), span(600, 720, 'aardvark')]);

    const byCategory = Object.fromEntries(laid.map((l) => [l.category, l.column]));

    expect(byCategory['aardvark']).toBe(0);
    expect(byCategory['zoo']).toBe(1);
    expect(laid.every((l) => l.columns === 2)).toBe(true);
  });

  it('sorts uncategorised spans after categorised ones', () => {
    const laid = layoutSpans([span(540, 660, null), span(600, 720, 'a')]);

    expect(laid.find((l) => l.category === 'a')?.column).toBe(0);
    expect(laid.find((l) => l.category === null)?.column).toBe(1);
  });

  it('stacks same-category overlaps into the next column', () => {
    const laid = layoutSpans([span(540, 660, 'a'), span(600, 720, 'a')]);

    expect(laid.map((l) => l.column).sort()).toEqual([0, 1]);
    expect(laid.every((l) => l.columns === 2)).toBe(true);
  });

  it('clusters transitively: A∩B and B∩C share a cluster even when A misses C', () => {
    const laid = layoutSpans([span(540, 610, 'a'), span(600, 700, 'a'), span(690, 780, 'a')]);

    // A and C never overlap, so they may share a column — but all three share the cluster width.
    expect(laid.every((l) => l.columns === 2)).toBe(true);
  });

  it('handles identical spans', () => {
    const laid = layoutSpans([span(540, 600, 'a'), span(540, 600, 'a'), span(540, 600, 'a')]);

    expect(laid.map((l) => l.column).sort()).toEqual([0, 1, 2]);
    expect(laid.every((l) => l.columns === 3)).toBe(true);
  });

  it('keeps separate clusters at their own widths', () => {
    const laid = layoutSpans([span(540, 660, 'a'), span(600, 720, 'b'), span(900, 960, 'c')]);

    expect(laid.find((l) => l.category === 'c')).toMatchObject({ column: 0, columns: 1 });
  });
});

describe('blockGeometry', () => {
  it('positions a 09:00–10:00 block', () => {
    const geometry = blockGeometry({ start: 540, end: 600 });

    expect(geometry.topPct).toBeCloseTo(37.5);
    expect(geometry.heightPct).toBeCloseTo(100 / 24);
  });

  it('spans the whole day for 00:00–24:00', () => {
    expect(blockGeometry({ start: 0, end: 1440 })).toEqual({ topPct: 0, heightPct: 100 });
  });
});
