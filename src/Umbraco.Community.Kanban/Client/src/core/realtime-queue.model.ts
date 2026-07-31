/**
 * One server event, reduced to what reconciliation needs: which document, and whether it still
 * exists. 'gone' covers Deleted and Trashed — both skip the fetch; 'changed' covers Created and
 * Updated — both cost one fetch to learn the answer.
 */
export interface KanbanRealtimeEvent {
  key: string;
  kind: 'changed' | 'gone';
}

/**
 * Queues an event while the board is paused (mid-drag), keeping only the latest event per key.
 * Pure, so latest-wins is tested directly: ten saves of one document while a drag is held open
 * flush as one fetch, and a save followed by a delete flushes as just the delete.
 */
export function enqueueEvent(
  queue: readonly KanbanRealtimeEvent[],
  event: KanbanRealtimeEvent,
): KanbanRealtimeEvent[] {
  return [...queue.filter((held) => held.key !== event.key), event];
}
