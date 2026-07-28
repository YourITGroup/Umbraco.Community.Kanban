import { describe, it, expect } from 'vitest';
import { manifests } from './manifests.js';

describe('board property editor manifests', () => {
  it('registers a schema and a ui', () => {
    expect(manifests.map((m) => m.type).sort()).toEqual(['propertyEditorSchema', 'propertyEditorUi']);
  });

  it('binds the ui to the schema', () => {
    const schema = manifests.find((m) => m.type === 'propertyEditorSchema') as any;
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;

    expect(schema.alias).toBe('Umbraco.Community.Kanban.Board');
    expect(schema.meta.defaultPropertyEditorUiAlias).toBe(ui.alias);
    expect(ui.meta.propertyEditorSchemaAlias).toBe(schema.alias);
  });

  it('exposes every setting the server configuration model declares', () => {
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;
    const aliases = ui.meta.settings.properties.map((p: { alias: string }) => p.alias).sort();

    expect(aliases).toEqual([
      'allowDrag',
      'appliesTo',
      'cardProperties',
      'laneOverrides',
      'lanePageSize',
      'laneProperty',
      'laneSource',
      'manualLanes',
      'tabIcon',
      'tabName',
    ]);
  });

  it('defaults the lane page size to 25 and drag to on', () => {
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;
    const defaults = Object.fromEntries(
      ui.meta.settings.defaultData.map((d: { alias: string; value: unknown }) => [d.alias, d.value]),
    );

    expect(defaults.lanePageSize).toBe(25);
    expect(defaults.allowDrag).toBe(true);
  });
});
