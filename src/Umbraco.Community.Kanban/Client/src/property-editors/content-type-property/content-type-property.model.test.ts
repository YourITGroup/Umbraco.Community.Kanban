import { describe, it, expect } from 'vitest';
import { toPropertyPickerItems } from './content-type-property.model.js';

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
