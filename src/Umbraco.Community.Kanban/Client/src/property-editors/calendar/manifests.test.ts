import { describe, it, expect } from 'vitest';
import { manifests } from './manifests.js';

describe('calendar property editor manifests', () => {
  it('binds the ui to the schema', () => {
    const schema = manifests.find((m) => m.type === 'propertyEditorSchema') as any;
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;

    expect(schema.alias).toBe('Umbraco.Community.Kanban.Calendar');
    expect(schema.meta.defaultPropertyEditorUiAlias).toBe(ui.alias);
    expect(ui.meta.propertyEditorSchemaAlias).toBe(schema.alias);
  });

  it('exposes every setting the server configuration model declares', () => {
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;
    const aliases = ui.meta.settings.properties.map((p: { alias: string }) => p.alias).sort();

    // `categoryContentTypeKey` is deliberately absent: the category property picker writes it as a
    // sibling value, the same way the board's lane picker writes `laneContentTypeKey`.
    expect(aliases).toEqual([
      'appliesTo',
      'cardProperties',
      'categoryManualValues',
      'categoryOverrides',
      'categoryProperty',
      'dateProperty',
      'endDateProperty',
      'showAgenda',
      'tabIcon',
      'tabName',
    ]);
  });

  it('defaults the agenda on, and deliberately leaves the date property unset', () => {
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;
    const defaults = Object.fromEntries(
      ui.meta.settings.defaultData.map((d: { alias: string; value: unknown }) => [d.alias, d.value]),
    );

    // No dateProperty default: the picker cannot browse to a system property, so "unset" is the
    // representation of updateDate — the server model falls back to it, covered by its own test.
    expect(defaults.dateProperty).toBeUndefined();
    expect(defaults.showAgenda).toBe(true);
  });
});
