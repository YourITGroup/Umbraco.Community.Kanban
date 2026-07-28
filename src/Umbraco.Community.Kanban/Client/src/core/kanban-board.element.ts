import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { mergeLanePage, toBoardState, type KanbanBoardState } from './board.model.js';
import './kanban-lane.element.js';
import type { KanbanBoardQuery, KanbanDataSource } from '../data/kanban-data-source.js';

type KanbanBoardStatus = 'idle' | 'loading' | 'ready' | 'not-configured' | 'error';

/**
 * The board. Host-agnostic by design: it knows a parent, a culture and a data source, and
 * nothing about collections, workspaces or data types. Every host is an adapter that
 * supplies those three and renders this.
 */
@customElement('umb-community-kanban-board')
export class UmbCommunityKanbanBoardElement extends UmbLitElement {
  @property({ type: String, attribute: 'parent-id' })
  parentId?: string;

  @property({ type: String, attribute: 'config-id' })
  configId?: string;

  @property({ type: String })
  culture?: string | null;

  /** Fixed true for this milestone; drag arrives in milestone 3. */
  @property({ type: Boolean })
  readonly = true;

  @property({ attribute: false })
  datasource?: KanbanDataSource;

  @state()
  private _status: KanbanBoardStatus = 'idle';

  @state()
  private _board?: KanbanBoardState;

  /** Reloads the whole board. Hosts call this when their own data changes. */
  async load() {
    if (!this.parentId || !this.datasource) return;

    this._status = 'loading';

    const outcome = await this.datasource.getBoard(this.#query());

    if (outcome.kind === 'success') {
      this._board = toBoardState(outcome.board);
      this._status = 'ready';
      return;
    }

    this._board = undefined;
    this._status = outcome.kind === 'not-configured' ? 'not-configured' : 'error';
  }

  #query(extra?: Partial<KanbanBoardQuery>): KanbanBoardQuery {
    return {
      parentId: this.parentId!,
      configId: this.configId,
      culture: this.culture,
      ...extra,
    };
  }

  async #onLoadMore(event: CustomEvent<{ lane: string; skip: number }>) {
    if (!this.datasource || !this._board) return;

    const outcome = await this.datasource.getBoard(
      this.#query({ lane: event.detail.lane, skip: event.detail.skip }),
    );

    if (outcome.kind === 'success') {
      this._board = mergeLanePage(this._board, outcome.board);
    }
  }

  override render() {
    switch (this._status) {
      case 'idle':
      case 'loading':
        return html`<uui-loader></uui-loader>`;
      case 'not-configured':
        return this.#renderMessage(
          'This collection has no Kanban configuration yet. Open its data type and choose one on the Kanban tab.',
        );
      case 'error':
        return this.#renderMessage('The board could not be loaded.');
      default:
        return this.#renderBoard();
    }
  }

  #renderMessage(message: string) {
    return html`<div class="message">${message}</div>`;
  }

  #renderBoard() {
    if (!this._board) return nothing;

    return html`
      ${this._board.truncated
        ? this.#renderMessage(
            `Showing the first cards of ${this._board.childCount} children. Lane counts are lower bounds.`,
          )
        : nothing}
      <div class="lanes" @kanban-load-more=${this.#onLoadMore}>
        ${this._board.lanes.map(
          (lane) => html`<umb-community-kanban-lane
            .lane=${lane}
            ?readonly=${this.readonly}></umb-community-kanban-lane>`,
        )}
      </div>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
        padding: var(--uui-size-layout-1);
      }

      .lanes {
        display: flex;
        gap: var(--uui-size-space-4);
        align-items: flex-start;
        overflow-x: auto;
        padding-bottom: var(--uui-size-space-3);
      }

      .message {
        padding: var(--uui-size-space-4);
        color: var(--uui-color-text-alt);
      }
    `,
  ];
}

export { UmbCommunityKanbanBoardElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-board': UmbCommunityKanbanBoardElement;
  }
}
