import { describe, it, expect } from 'vitest';
import {
  addCardProperty,
  readCardProperties,
  removeCardPropertyAt,
  setCardPropertyField,
  type KanbanCardPropertyValue,
} from './card-property.model.js';

const property = (alias: string, header?: string): KanbanCardPropertyValue => ({ alias, header });

describe('addCardProperty', () => {
  it('appends the picked property, using its label as the header', () => {
    const next = addCardProperty([], { alias: 'bookingOwner', header: 'Owner' });

    expect(next).toEqual([{ alias: 'bookingOwner', header: 'Owner', isSystem: 0 }]);
  });

  it('appends, so the newest property shows last on the card', () => {
    const next = addCardProperty([property('company', 'Company')], { alias: 'status', header: 'Status' });

    expect(next.map((p) => p.alias)).toEqual(['company', 'status']);
  });

  it('falls back to the alias when the pick carried no label', () => {
    expect(addCardProperty([], { alias: 'status' })[0].header).toBe('status');
  });

  it('records a system property as one', () => {
    expect(addCardProperty([], { alias: 'updateDate', header: 'Last edited', isSystem: 1 })[0].isSystem).toBe(1);
  });

  it('drops a repeat rather than showing one property twice', () => {
    // Two content types can offer the same alias, so the picker can legitimately hand back one that
    // is already listed.
    const existing = [property('status', 'Status')];

    expect(addCardProperty(existing, { alias: 'status', header: 'Something else' })).toEqual(existing);
  });

  it('drops a repeat that differs only in case', () => {
    // A card showing "status" and "Status" would read as two properties while resolving to one.
    const existing = [property('status')];

    expect(addCardProperty(existing, { alias: 'STATUS' })).toEqual(existing);
  });

  it('ignores a blank alias', () => {
    expect(addCardProperty([], { alias: '   ' })).toEqual([]);
  });

  it('trims the alias it stores', () => {
    expect(addCardProperty([], { alias: '  status  ' })[0].alias).toBe('status');
  });

  it('never mutates its input', () => {
    const existing = [property('status')];

    addCardProperty(existing, { alias: 'company' });

    expect(existing).toHaveLength(1);
  });
});

describe('removeCardPropertyAt', () => {
  it('drops the property at the index', () => {
    const next = removeCardPropertyAt([property('a'), property('b'), property('c')], 1);

    expect(next.map((p) => p.alias)).toEqual(['a', 'c']);
  });

  it('returns an unchanged copy for an index out of range', () => {
    const existing = [property('a')];

    expect(removeCardPropertyAt(existing, -1)).toEqual(existing);
    expect(removeCardPropertyAt(existing, 1)).toEqual(existing);
    expect(removeCardPropertyAt(existing, 1)).not.toBe(existing);
  });
});

describe('setCardPropertyField', () => {
  it('writes the header of the matching row only', () => {
    const next = setCardPropertyField([property('a', 'A'), property('b', 'B')], 'b', 'header', 'Bee');

    expect(next.map((p) => p.header)).toEqual(['A', 'Bee']);
  });

  it('writes a label template', () => {
    const next = setCardPropertyField(
      [property('recurring')],
      'recurring',
      'nameTemplate',
      "${ value ? 'Yes' : 'No' }",
    );

    expect(next[0].nameTemplate).toBe("${ value ? 'Yes' : 'No' }");
  });

  it('clears a field to undefined rather than storing an empty string', () => {
    const next = setCardPropertyField([{ alias: 'a', nameTemplate: 'x' }], 'a', 'nameTemplate', '');

    expect(next[0].nameTemplate).toBeUndefined();
  });

  it('never mutates its input', () => {
    const existing = [property('a', 'A')];

    setCardPropertyField(existing, 'a', 'header', 'Changed');

    expect(existing[0].header).toBe('A');
  });
});

describe('readCardProperties', () => {
  it('reads the old array of aliases', () => {
    // Every board configured before card properties gained headers and templates stores this.
    expect(readCardProperties(['status', 'company'])).toEqual([{ alias: 'status' }, { alias: 'company' }]);
  });

  it('reads the current array of objects unchanged', () => {
    const stored = [{ alias: 'updateDate', header: 'Last edited', isSystem: 1 }];

    expect(readCardProperties(stored)).toEqual(stored);
  });

  it('reads a mixture of both shapes', () => {
    expect(readCardProperties(['status', { alias: 'updateDate', isSystem: 1 }])).toEqual([
      { alias: 'status' },
      { alias: 'updateDate', isSystem: 1 },
    ]);
  });

  it('skips an entry that cannot name a property', () => {
    expect(readCardProperties(['status', '', '   ', null, 42, {}, { alias: '  ' }, 'company'])).toEqual([
      { alias: 'status' },
      { alias: 'company' },
    ]);
  });

  it('reads nothing readable as nothing', () => {
    expect(readCardProperties(undefined)).toEqual([]);
    expect(readCardProperties(null)).toEqual([]);
    expect(readCardProperties('status')).toEqual([]);
    expect(readCardProperties([])).toEqual([]);
  });
});
