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

    expect(aliases).toEqual([
      'allowDrag',
      'appliesTo',
      'cardProperties',
      'dateProperty',
      'showAgenda',
      'tabIcon',
      'tabName',
    ]);
  });

  it('defaults the date property to updateDate and shows the agenda', () => {
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;
    const defaults = Object.fromEntries(
      ui.meta.settings.defaultData.map((d: { alias: string; value: unknown }) => [d.alias, d.value]),
    );

    expect(defaults.dateProperty).toBe('updateDate');
    expect(defaults.showAgenda).toBe(true);
  });
});
