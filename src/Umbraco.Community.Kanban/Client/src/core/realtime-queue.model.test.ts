import { describe, it, expect } from 'vitest';
import { enqueueEvent, type KanbanRealtimeEvent } from './realtime-queue.model.js';

describe('enqueueEvent', () => {
  const changed = (key: string): KanbanRealtimeEvent => ({ key, kind: 'changed' });
  const gone = (key: string): KanbanRealtimeEvent => ({ key, kind: 'gone' });

  it('appends events for distinct keys in arrival order', () => {
    const queue = enqueueEvent(enqueueEvent([], changed('a')), changed('b'));

    expect(queue.map((e) => e.key)).toEqual(['a', 'b']);
  });

  it('keeps only the latest event per key — a save then a delete is just the delete', () => {
    const queue = enqueueEvent(enqueueEvent([changed('b')], changed('a')), gone('a'));

    expect(queue).toEqual([changed('b'), gone('a')]);
  });

  it('moves a re-raised key to the back, preserving overall arrival order', () => {
    const queue = enqueueEvent([changed('a'), changed('b')], changed('a'));

    expect(queue.map((e) => e.key)).toEqual(['b', 'a']);
  });

  it('never mutates its input', () => {
    const original: KanbanRealtimeEvent[] = [changed('a')];

    enqueueEvent(original, gone('a'));

    expect(original).toEqual([changed('a')]);
  });
});
