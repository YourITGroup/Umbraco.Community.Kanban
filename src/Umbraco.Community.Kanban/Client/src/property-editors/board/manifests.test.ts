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

  /**
   * Two server configuration fields are deliberately absent. `laneContentTypeKey` is written by the
   * lane property picker alongside its own value, and `laneSource` pins a source by alias for
   * third-party lane sources — the toggle covers the only choice an editor makes.
   */
  it('exposes every setting an editor configures', () => {
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;
    const aliases = ui.meta.settings.properties.map((p: { alias: string }) => p.alias).sort();

    expect(aliases).toEqual([
      'allowDrag',
      'appliesTo',
      'cardProperties',
      'childItemsSortBy',
      'childItemsSortDirection',
      'laneOverrides',
      'lanePageSize',
      'laneProperty',
      'manualLanes',
      'showChildItems',
      'tabIcon',
      'tabName',
      'useManualLanes',
    ]);
  });

  it('picks the lane property rather than letting an alias be typed', () => {
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;
    const laneProperty = ui.meta.settings.properties.find((p: { alias: string }) => p.alias === 'laneProperty');

    expect(laneProperty.propertyEditorUiAlias).toBe('Umb.Community.Kanban.PropertyEditorUi.LaneProperty');
  });

  it('picks card properties the same way as the lane property', () => {
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;
    const cardProperties = ui.meta.settings.properties.find((p: { alias: string }) => p.alias === 'cardProperties');

    expect(cardProperties.propertyEditorUiAlias).toBe('Umb.Community.Kanban.PropertyEditorUi.CardProperties');
  });

  it('makes manual lanes a toggle rather than a source alias to type', () => {
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;
    const toggle = ui.meta.settings.properties.find((p: { alias: string }) => p.alias === 'useManualLanes');

    expect(toggle.propertyEditorUiAlias).toBe('Umb.PropertyEditorUi.Toggle');
  });

  it('defaults the lane page size to 25 and drag to on', () => {
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;
    const defaults = Object.fromEntries(
      ui.meta.settings.defaultData.map((d: { alias: string; value: unknown }) => [d.alias, d.value]),
    );

    expect(defaults.lanePageSize).toBe(25);
    expect(defaults.allowDrag).toBe(true);
  });

  it('defaults child items to sort order ascending, and leaves showChildItems unset', () => {
    // showChildItems has no default: absent means off, and a default of false would be noise.
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;
    const defaults = Object.fromEntries(
      ui.meta.settings.defaultData.map((d: { alias: string; value: unknown }) => [d.alias, d.value]),
    );

    expect(defaults.childItemsSortBy).toBe('sortOrder');
    expect(defaults.childItemsSortDirection).toBe('asc');
    expect('showChildItems' in defaults).toBe(false);
  });

  it('defaults card properties to the created and updated dates, in that order', () => {
    // What a fresh List View shows. Without it a new board's cards carry nothing but a title.
    const ui = manifests.find((m) => m.type === 'propertyEditorUi') as any;
    const defaults = Object.fromEntries(
      ui.meta.settings.defaultData.map((d: { alias: string; value: unknown }) => [d.alias, d.value]),
    );

    expect(defaults.cardProperties).toEqual([
      { alias: 'createDate', header: 'Created', isSystem: 1 },
      { alias: 'updateDate', header: 'Last edited', isSystem: 1 },
    ]);
  });
});
