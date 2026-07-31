import { describe, expect, it } from 'vitest';
import { inViewerTimeZone, placeInViewerTimeZone } from './viewer-time.model.js';
import type { KanbanCalendarItemModel } from '../data/kanban-calendar.types.js';

/**
 * Zones are named explicitly in every case, never taken from the machine, so these assert the
 * conversion rather than wherever the suite happens to run.
 */
function item(over: Partial<KanbanCalendarItemModel> = {}): KanbanCalendarItemModel {
  return {
    date: '2026-08-15',
    time: '09:00',
    card: { key: 'a', name: 'A booking', icon: null, state: 'published', canUpdate: false, properties: [] } as never,
    ...over,
  };
}

describe('inViewerTimeZone', () => {
  it('converts a moment into the viewer zone', () => {
    const result = inViewerTimeZone(
      item({ instant: '2026-08-15T09:00:00+10:00' }),
      'Australia/Sydney',
    );

    expect(result.date).toBe('2026-08-15');
    expect(result.time).toBe('09:00');
  });

  it('moves an item onto the previous day for a viewer behind the stored zone', () => {
    // 09:00 in Sydney is 23:00 the evening before in UTC — the same shift the board card's own
    // value summary shows for this property.
    const result = inViewerTimeZone(item({ instant: '2026-08-15T09:00:00+10:00' }), 'UTC');

    expect(result.date).toBe('2026-08-14');
    expect(result.time).toBe('23:00');
  });

  it('moves an item onto the next day for a viewer ahead of the stored zone', () => {
    const result = inViewerTimeZone(
      item({ date: '2026-08-15', time: '20:00', instant: '2026-08-15T20:00:00-04:00' }),
      'Australia/Sydney',
    );

    expect(result.date).toBe('2026-08-16');
    expect(result.time).toBe('10:00');
  });

  it('converts the end alongside the start', () => {
    const result = inViewerTimeZone(
      item({
        instant: '2026-08-15T09:00:00+10:00',
        endDate: '2026-08-15',
        endTime: '11:30',
        endInstant: '2026-08-15T11:30:00+10:00',
      }),
      'UTC',
    );

    // The start crosses back to the 14th, the end does not — a span the viewer sees over midnight.
    expect(result.date).toBe('2026-08-14');
    expect(result.time).toBe('23:00');
    expect(result.endDate).toBe('2026-08-15');
    expect(result.endTime).toBe('01:30');
  });

  it('leaves a bare wall clock exactly as stored', () => {
    const stored = item({ time: '14:15' });

    expect(inViewerTimeZone(stored, 'UTC')).toBe(stored);
  });

  it('keeps a converted midnight timed rather than turning it all-day', () => {
    const result = inViewerTimeZone(item({ instant: '2026-08-15T10:00:00+10:00' }), 'UTC');

    expect(result.date).toBe('2026-08-15');
    expect(result.time).toBe('00:00');
  });

  it('leaves an unparseable instant alone', () => {
    const result = inViewerTimeZone(item({ instant: 'not a moment' }), 'UTC');

    expect(result.date).toBe('2026-08-15');
    expect(result.time).toBe('09:00');
  });

  it('applies the zone rules that were in force on the date, not today', () => {
    // Sydney is UTC+10 in August (standard time) and UTC+11 in January (daylight saving).
    const january = inViewerTimeZone(
      item({ date: '2026-01-15', instant: '2026-01-15T00:00:00Z' }),
      'Australia/Sydney',
    );
    const august = inViewerTimeZone(
      item({ date: '2026-08-15', instant: '2026-08-15T00:00:00Z' }),
      'Australia/Sydney',
    );

    expect(january.time).toBe('11:00');
    expect(august.time).toBe('10:00');
  });
});

describe('placeInViewerTimeZone', () => {
  it('drops what the conversion moved outside the requested window', () => {
    const items = [
      // Delivered from the server's slack day, and the conversion moves it into the window.
      item({ date: '2026-07-31', instant: '2026-07-31T23:00:00-04:00', card: { key: 'stays' } as never }),
      // 2026-08-01 09:00+10:00 is 2026-07-31 23:00 in UTC — before the window the calendar asked for.
      item({ date: '2026-08-01', instant: '2026-08-01T09:00:00+10:00', card: { key: 'leaves' } as never }),
    ];

    const result = placeInViewerTimeZone(items, 'UTC', { from: '2026-08-01', to: '2026-08-31' });

    expect(result.map((i) => i.card.key)).toEqual(['stays']);
  });

  it('keeps wall-clock items inside the window untouched', () => {
    const items = [item({ date: '2026-08-15' }), item({ date: '2026-09-05' })];

    const result = placeInViewerTimeZone(items, 'UTC', { from: '2026-08-01', to: '2026-08-31' });

    expect(result).toEqual([items[0]]);
  });
});
