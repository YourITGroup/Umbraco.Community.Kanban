import { describe, it, expect } from 'vitest';
import {
  isSystemProperty,
  toPropertyPickerItems,
  toSystemPropertyPickerItems,
} from './content-type-property.model.js';

describe('toPropertyPickerItems', () => {
  it('labels by name and describes by alias, because the alias is what gets stored', () => {
    const items = toPropertyPickerItems([{ alias: 'status', name: 'Status' }]);

    expect(items).toEqual([
      { label: 'Status', value: 'status', description: 'status', icon: 'icon-document' },
    ]);
  });

  it('keeps the content type’s own property order rather than sorting', () => {
    const items = toPropertyPickerItems([
      { alias: 'status', name: 'Status' },
      { alias: 'company', name: 'Company' },
    ]);

    expect(items.map((item) => item.value)).toEqual(['status', 'company']);
  });

  it('falls back to the alias when a property has no name', () => {
    expect(toPropertyPickerItems([{ alias: 'status', name: '' }])[0]?.label).toBe('status');
  });

  it('drops properties with no alias, which could never be resolved server-side', () => {
    expect(toPropertyPickerItems([{ alias: '', name: 'Nameless' }])).toEqual([]);
  });

  it.each([undefined, null, []])('returns nothing for %p', (properties) => {
    expect(toPropertyPickerItems(properties)).toEqual([]);
  });
});

describe('toSystemPropertyPickerItems', () => {
  it('offers the five document fields Umbraco own column picker offers', () => {
    // Same aliases as core, so an editor moving between a List View and a board sees the same names.
    // Kept in step with KanbanSystemProperty on the server, which is what reads them.
    expect(toSystemPropertyPickerItems().map((item) => item.value)).toEqual([
      'createDate',
      'updateDate',
      'creator',
      'sortOrder',
      'published',
    ]);
  });

  it('labels each one and describes it by alias, as the property items do', () => {
    const created = toSystemPropertyPickerItems()[0];

    expect(created.label).toBe('Created');
    expect(created.description).toBe('createDate');
  });
});

describe('isSystemProperty', () => {
  it('recognises a system field', () => {
    expect(isSystemProperty('updateDate')).toBe(true);
  });

  it('recognises one whatever its case, and ignores surrounding space', () => {
    expect(isSystemProperty('  UPDATEDATE ')).toBe(true);
  });

  it('does not claim a content type property', () => {
    expect(isSystemProperty('status')).toBe(false);
    expect(isSystemProperty('')).toBe(false);
  });
});
