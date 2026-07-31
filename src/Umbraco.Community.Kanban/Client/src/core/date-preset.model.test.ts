import { describe, it, expect } from 'vitest';
import { datePresetValue } from './date-preset.model.js';

describe('datePresetValue', () => {
  it('builds the editor-value object for the with-timezone editor', () => {
    expect(datePresetValue('Umbraco.DateTimeWithTimeZone', { date: '2026-08-15', time: '09:00' })).toEqual({
      date: '2026-08-15T09:00:00',
    });
  });

  it('builds the editor-value object for the unspecified-kind editor', () => {
    expect(datePresetValue('Umbraco.DateTimeUnspecified', { date: '2026-08-15', time: '14:00' })).toEqual({
      date: '2026-08-15T14:00:00',
    });
  });

  it('ignores the time for the date-only editor', () => {
    expect(datePresetValue('Umbraco.DateOnly', { date: '2026-08-15', time: '09:00' })).toEqual({
      date: '2026-08-15T00:00:00',
    });
  });

  it('defaults a slot with no time to midnight', () => {
    expect(datePresetValue('Umbraco.DateTimeWithTimeZone', { date: '2026-08-15' })).toEqual({
      date: '2026-08-15T00:00:00',
    });
  });

  it('builds a plain string for the deprecated Umbraco.DateTime editor', () => {
    expect(datePresetValue('Umbraco.DateTime', { date: '2026-08-15', time: '09:00' })).toBe('2026-08-15 09:00:00');
  });

  it('cannot preset a time-only editor — it has no calendar date', () => {
    expect(datePresetValue('Umbraco.TimeOnly', { date: '2026-08-15', time: '09:00' })).toBeUndefined();
  });

  it('cannot preset system properties or unknown editors', () => {
    expect(datePresetValue(null, { date: '2026-08-15' })).toBeUndefined();
    expect(datePresetValue(undefined, { date: '2026-08-15' })).toBeUndefined();
    expect(datePresetValue('Umbraco.TextBox', { date: '2026-08-15' })).toBeUndefined();
  });
});
