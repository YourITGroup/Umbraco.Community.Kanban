import { describe, it, expect } from 'vitest';
import { orderLaneRows, toLaneOrder } from './lane-order.model.js';
import type { KanbanLaneOverrideRow } from './lane-override.model.js';

const row = (value: string, orphaned = false): KanbanLaneOverrideRow => ({
  value,
  name: value,
  orphaned,
});

const values = (rows: KanbanLaneOverrideRow[]) => rows.map((r) => r.value);

// The same cases KanbanGroupOrderApplierTests asserts server-side. The two implementations must agree,
// or the editor shows an order the board does not render.
describe('orderLaneRows', () => {
  it('puts listed rows in the listed order', () => {
    const rows = [row('pending'), row('confirmed'), row('cancelled')];

    expect(values(orderLaneRows(rows, ['cancelled', 'confirmed', 'pending']))).toEqual([
      'cancelled',
      'confirmed',
      'pending',
    ]);
  });

  it('keeps unlisted rows in source order after the listed ones', () => {
    const rows = [row('pending'), row('confirmed'), row('archived'), row('cancelled')];

    expect(values(orderLaneRows(rows, ['cancelled', 'pending']))).toEqual([
      'cancelled',
      'pending',
      'confirmed',
      'archived',
    ]);
  });

  it('ignores a value matching no row', () => {
    const rows = [row('pending'), row('confirmed')];

    expect(values(orderLaneRows(rows, ['confirmed', 'renamed-away', 'pending']))).toEqual([
      'confirmed',
      'pending',
    ]);
  });

  it('matches without regard to case', () => {
    const rows = [row('Pending'), row('Confirmed')];

    expect(values(orderLaneRows(rows, ['confirmed', 'PENDING']))).toEqual(['Confirmed', 'Pending']);
  });

  it('leaves the rows alone when no order is configured', () => {
    const rows = [row('pending'), row('confirmed')];

    expect(values(orderLaneRows(rows, undefined))).toEqual(['pending', 'confirmed']);
    expect(values(orderLaneRows(rows, []))).toEqual(['pending', 'confirmed']);
  });

  it('ignores blank entries', () => {
    const rows = [row('pending'), row('confirmed')];

    expect(values(orderLaneRows(rows, ['', '   ', 'confirmed']))).toEqual(['confirmed', 'pending']);
  });

  it('keeps the first of two rows sharing a value', () => {
    const rows = [row('Todo'), row('todo'), row('done')];

    expect(values(orderLaneRows(rows, ['done', 'todo']))).toEqual(['done', 'Todo', 'todo']);
  });

  it('never mutates the rows it was given', () => {
    const rows = [row('pending'), row('confirmed')];

    orderLaneRows(rows, ['confirmed', 'pending']);

    expect(values(rows)).toEqual(['pending', 'confirmed']);
  });

  it('sorts an orphaned row like any other, since its position only matters if the lane returns', () => {
    const rows = [row('pending'), row('gone', true)];

    expect(values(orderLaneRows(rows, ['gone', 'pending']))).toEqual(['gone', 'pending']);
  });
});

describe('toLaneOrder', () => {
  it('stores the row values in their current order', () => {
    expect(toLaneOrder([row('confirmed'), row('pending')])).toEqual(['confirmed', 'pending']);
  });

  it('stores nothing for no rows', () => {
    expect(toLaneOrder([])).toEqual([]);
  });
});
