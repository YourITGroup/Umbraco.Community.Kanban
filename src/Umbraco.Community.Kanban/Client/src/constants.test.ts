import { describe, it, expect } from 'vitest';
import {
  KANBAN_BOARD_EDITOR_ALIAS,
  KANBAN_CALENDAR_EDITOR_ALIAS,
  KANBAN_API_PATH,
} from './constants.js';

describe('constants', () => {
  it('match the server-side editor aliases', () => {
    expect(KANBAN_BOARD_EDITOR_ALIAS).toBe('Umbraco.Community.Kanban.Board');
    expect(KANBAN_CALENDAR_EDITOR_ALIAS).toBe('Umbraco.Community.Kanban.Calendar');
  });

  it('points at the kanban management api', () => {
    expect(KANBAN_API_PATH).toBe('/umbraco/kanban/api/v1');
  });
});
