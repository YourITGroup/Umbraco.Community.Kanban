import { css, customElement, html, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbModalRouteRegistrationController } from '@umbraco-cms/backoffice/router';
import { UMB_WORKSPACE_MODAL } from '@umbraco-cms/backoffice/workspace';
import {
  UMB_DOCUMENT_ENTITY_TYPE,
  UMB_EDIT_DOCUMENT_WORKSPACE_PATH_PATTERN,
} from '@umbraco-cms/backoffice/document';
import { KanbanServerDataSource } from '@/data/kanban-server-data-source.js';
import type { KanbanDataSource } from '@/data/kanban-data-source.js';
import '@/core/kanban-calendar.element.js';

/**
 * The injected calendar host — the calendar sibling of the standalone board element, and like it
 * part of the package's public API. Owns the datasource and the workspace-modal wiring for opening
 * a card's document; there is no actions bar because a read-only calendar has nothing to publish.
 *
 * The contract is attributes: `parent-id` and `config-id` are required, `culture` optional
 * (unset means invariant). Hosts decide where those values come from.
 */
@customElement('umb-community-kanban-standalone-calendar')
export class UmbCommunityKanbanStandaloneCalendarElement extends UmbLitElement {
  /** The calendar's parent document key. Required; a loader renders until it is set. */
  @property({ attribute: 'parent-id' })
  parentId?: string;

  /** The calendar configuration key. Required — there is no data type here to resolve one from. */
  @property({ attribute: 'config-id' })
  configId?: string;

  /** Display culture for variant content; unset loads invariant. */
  @property({ attribute: false })
  culture?: string | null;

  #datasource: KanbanDataSource = new KanbanServerDataSource(this);

  /** See the collection host: open() silently no-ops until the router hands over a builder. */
  #modalReady = false;

  #documentModal: UmbModalRouteRegistrationController<
    typeof UMB_WORKSPACE_MODAL.DATA,
    typeof UMB_WORKSPACE_MODAL.VALUE
  >;

  constructor() {
    super();

    // Own path segment so no two hosts' modal routes collide in a shared routing scope.
    this.#documentModal = new UmbModalRouteRegistrationController(this, UMB_WORKSPACE_MODAL)
      .addAdditionalPath('kanban-standalone-calendar-document')
      .onSetup(() => ({ data: { entityType: UMB_DOCUMENT_ENTITY_TYPE, preset: {} } }))
      .onSubmit(() => {
        // A save in our modal may have changed the very date that places the card — reload.
        this.#calendar?.load();
      })
      .observeRouteBuilder(() => {
        this.#modalReady = true;
      });
  }

  get #calendar() {
    return this.shadowRoot?.querySelector('umb-community-kanban-calendar') ?? undefined;
  }

  #onOpenDocument(event: CustomEvent<{ key: string }>) {
    if (!this.#modalReady) return;

    this.#documentModal.open(
      {},
      UMB_EDIT_DOCUMENT_WORKSPACE_PATH_PATTERN.generateLocal({ unique: event.detail.key }),
    );
  }

  override render() {
    if (!this.parentId || !this.configId) return html`<uui-loader></uui-loader>`;

    return html`
      <umb-community-kanban-calendar
        parent-id=${this.parentId}
        config-id=${this.configId}
        .culture=${this.culture}
        .datasource=${this.#datasource}
        @kanban-open-document=${this.#onOpenDocument}></umb-community-kanban-calendar>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-standalone-calendar': UmbCommunityKanbanStandaloneCalendarElement;
  }
}
