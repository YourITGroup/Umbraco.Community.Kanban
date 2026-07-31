import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT } from '@umbraco-cms/backoffice/management-api';
import { enqueueEvent, type KanbanRealtimeEvent } from './realtime-queue.model.js';
import type { KanbanCardOutcome, KanbanDataSource } from '../data/kanban-data-source.js';

/**
 * The event source and types Umbraco broadcasts for documents — the same four core's own cache
 * invalidation subscribes to, over the same authorised channel.
 */
const DOCUMENT_EVENT_SOURCE = 'Umbraco:CMS:Document';
const DOCUMENT_EVENT_TYPES = ['Created', 'Updated', 'Deleted', 'Trashed'];
const GONE_EVENT_TYPES = new Set(['Deleted', 'Trashed']);

export interface KanbanRealtimeCallbacks {
  /** One reconciliation answer, ready for the reducer. Called once per event that survives coalescing. */
  onCardOutcome: (key: string, outcome: KanbanCardOutcome) => void;
  /** The hub reconnected after a drop: events were missed, not queued — reload everything. */
  onResync: () => void;
}

export interface KanbanRealtimeQuery {
  parentId: string;
  configId?: string;
  culture?: string | null;
  datasource: KanbanDataSource;
}

/**
 * Subscribes the board to Umbraco's document server events and turns each into at most one small
 * fetch. Everything with behaviour worth testing is delegated: latest-per-key queueing to
 * realtime-queue.model.ts, and what an answer does to the board to realtime.model.ts — this class
 * is plumbing.
 *
 * Unconfigured (before the board's first load) it drops events: there is no board to reconcile.
 */
export class KanbanRealtimeController extends UmbControllerBase {
  #callbacks: KanbanRealtimeCallbacks;
  #query?: KanbanRealtimeQuery;

  /** True while a drag is live — events queue rather than reorganising the board under the pointer. */
  #paused = false;

  #queue: KanbanRealtimeEvent[] = [];

  /**
   * Keys with a fetch already in flight. A second event for one of these is dropped: the pending
   * response is about to land, and a change after that raises another event anyway.
   */
  #inFlight = new Set<string>();

  /**
   * The last isConnected value seen, so a reconnect (false to true) is told apart from the initial
   * connect (undefined to true), which needs no resync.
   */
  #wasConnected?: boolean;

  constructor(host: UmbControllerHost, callbacks: KanbanRealtimeCallbacks) {
    super(host);

    this.#callbacks = callbacks;

    this.consumeContext(UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT, (context) => {
      this.observe(
        context?.byEventSourcesAndEventTypes([DOCUMENT_EVENT_SOURCE], DOCUMENT_EVENT_TYPES),
        (event) => {
          if (event) this.#onEvent(event.eventType, event.key);
        },
        '_kanbanServerEvents',
      );

      this.observe(
        context?.isConnected,
        (connected) => {
          if (connected === undefined) return;

          if (connected && this.#wasConnected === false) this.#callbacks.onResync();

          this.#wasConnected = connected;
        },
        '_kanbanServerEventConnection',
      );
    });
  }

  /**
   * (Re)supplies the board's coordinates. Called from every load, so parent, culture and
   * configuration changes are picked up without a lifecycle of their own.
   */
  configure(query: KanbanRealtimeQuery): void {
    this.#query = query;
  }

  pause(): void {
    this.#paused = true;
  }

  resume(): void {
    this.#paused = false;

    const queued = this.#queue;
    this.#queue = [];

    for (const event of queued) this.#dispatch(event);
  }

  #onEvent(eventType: string, key: string): void {
    if (!this.#query) return;

    // The parent's own lifecycle belongs to the workspace above the board, not to reconciliation.
    if (key.toLowerCase() === this.#query.parentId.toLowerCase()) return;

    const event: KanbanRealtimeEvent = { key, kind: GONE_EVENT_TYPES.has(eventType) ? 'gone' : 'changed' };

    if (this.#paused) {
      this.#queue = enqueueEvent(this.#queue, event);
      return;
    }

    this.#dispatch(event);
  }

  #dispatch(event: KanbanRealtimeEvent): void {
    if (event.kind === 'gone') {
      this.#callbacks.onCardOutcome(event.key, { kind: 'gone' });
      return;
    }

    void this.#fetch(event.key);
  }

  async #fetch(key: string): Promise<void> {
    const query = this.#query;

    if (!query || this.#inFlight.has(key)) return;

    this.#inFlight.add(key);

    try {
      const outcome = await query.datasource.getCard({
        key,
        parentId: query.parentId,
        configId: query.configId,
        culture: query.culture,
      });

      this.#callbacks.onCardOutcome(key, outcome);
    } finally {
      this.#inFlight.delete(key);
    }
  }
}
