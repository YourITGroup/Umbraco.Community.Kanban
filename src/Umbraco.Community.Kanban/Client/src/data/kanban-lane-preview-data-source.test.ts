import { describe, it, expect } from 'vitest';
import { buildLanePreviewRequest } from './kanban-lane-preview-data-source.js';

describe('buildLanePreviewRequest', () => {
  it('sends the lane property, which is all an automatic board needs', () => {
    expect(buildLanePreviewRequest({ laneProperty: 'status' })).toEqual({
      configuration: { laneProperty: 'status' },
    });
  });

  it('sends the content type the property was picked from, which the server resolves against', () => {
    // The configuration editor has no document, so laneContentTypeKey is the only content type the
    // server can use — it stands in through KanbanLanePreviewRequestModel.EffectiveContentTypeKey.
    const request = buildLanePreviewRequest({
      laneProperty: 'status',
      laneContentTypeKey: '8f6f5f4e-0000-4000-8000-000000000001',
    });

    expect(request?.configuration.laneContentTypeKey).toBe('8f6f5f4e-0000-4000-8000-000000000001');
  });

  it('never sends a contentTypeKey of its own', () => {
    // Sending Guid.Empty would be honoured as a real request rather than falling back.
    const request = buildLanePreviewRequest({ laneProperty: 'status' });

    expect(request && 'contentTypeKey' in request).toBe(false);
  });

  it('previews a manual board, which needs no lane property at all', () => {
    const request = buildLanePreviewRequest({
      useManualLanes: true,
      manualLanes: [{ value: 'todo', label: 'To do' }],
    });

    expect(request).toEqual({
      configuration: { useManualLanes: true, manualLanes: [{ value: 'todo', label: 'To do' }] },
    });
  });

  it('carries a pinned lane source, so a hand-configured board previews as it will resolve', () => {
    const request = buildLanePreviewRequest({ laneProperty: 'status', laneSource: 'contentment-data-list' });

    expect(request?.configuration.laneSource).toBe('contentment-data-list');
  });

  it('omits everything that was not supplied, rather than sending empty values', () => {
    const request = buildLanePreviewRequest({ laneProperty: 'status' });

    expect(Object.keys(request!.configuration)).toEqual(['laneProperty']);
  });

  it('has nothing to preview when there is no lane property and lanes are not manual', () => {
    // The editor shows "choose a lane property first" instead of asking the server to resolve an
    // empty configuration.
    expect(buildLanePreviewRequest({})).toBeUndefined();
    expect(buildLanePreviewRequest({ laneProperty: '' })).toBeUndefined();
    expect(buildLanePreviewRequest({ laneProperty: '   ' })).toBeUndefined();
    expect(buildLanePreviewRequest({ useManualLanes: false })).toBeUndefined();
  });

  it('previews manual lanes even before any have been defined', () => {
    // The toggle alone changes what lanes exist, so the editor should stop saying "choose a
    // property first" the moment it is switched on.
    expect(buildLanePreviewRequest({ useManualLanes: true })).toEqual({
      configuration: { useManualLanes: true },
    });
  });

  it('does not send the overrides being edited, which cannot change which lanes exist', () => {
    const request = buildLanePreviewRequest({
      laneProperty: 'status',
      laneOverrides: [{ value: 'todo', colour: '#283a97' }],
    });

    expect('laneOverrides' in request!.configuration).toBe(false);
  });
});
