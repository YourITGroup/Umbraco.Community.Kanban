import { describe, it, expect } from 'vitest';
import {
  KANBAN_BOARD_EDITOR_ALIAS,
  KANBAN_CALENDAR_EDITOR_ALIAS,
  KANBAN_LANE_OVERRIDES_UI_ALIAS,
  KANBAN_CARD_PROPERTIES_UI_ALIAS,
  KANBAN_LANE_PROPERTY_UI_ALIAS,
  KANBAN_MANUAL_LANES_UI_ALIAS,
  KANBAN_LANE_CONTENT_TYPE_KEY,
  KANBAN_API_PATH,
} from './constants.js';

describe('constants', () => {
  it('match the server-side editor aliases', () => {
    expect(KANBAN_BOARD_EDITOR_ALIAS).toBe('Umbraco.Community.Kanban.Board');
    expect(KANBAN_CALENDAR_EDITOR_ALIAS).toBe('Umbraco.Community.Kanban.Calendar');
  });

  it('pins the internal sub-editor UI aliases', () => {
    expect(KANBAN_LANE_OVERRIDES_UI_ALIAS).toBe('Umb.Community.Kanban.PropertyEditorUi.LaneOverrides');
    expect(KANBAN_MANUAL_LANES_UI_ALIAS).toBe('Umb.Community.Kanban.PropertyEditorUi.ManualLanes');
    expect(KANBAN_LANE_PROPERTY_UI_ALIAS).toBe('Umb.Community.Kanban.PropertyEditorUi.LaneProperty');
    expect(KANBAN_CARD_PROPERTIES_UI_ALIAS).toBe('Umb.Community.Kanban.PropertyEditorUi.CardProperties');
  });

  it('matches the server-side board configuration field the lane property picker writes', () => {
    // Must equal the ConfigurationField key on KanbanBoardConfiguration.LaneContentTypeKey.
    expect(KANBAN_LANE_CONTENT_TYPE_KEY).toBe('laneContentTypeKey');
  });

  it('points at the kanban management api', () => {
    expect(KANBAN_API_PATH).toBe('/umbraco/kanban/api/v1');
  });
});
