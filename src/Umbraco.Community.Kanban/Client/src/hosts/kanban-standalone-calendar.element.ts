import { css, customElement, html, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbModalRouteRegistrationController } from '@umbraco-cms/backoffice/router';
import { UMB_WORKSPACE_MODAL } from '@umbraco-cms/backoffice/workspace';
import {
  UMB_CREATE_DOCUMENT_WORKSPACE_PATH_PATTERN,
  UMB_CREATE_FROM_BLUEPRINT_DOCUMENT_WORKSPACE_PATH_PATTERN,
  UMB_DOCUMENT_ENTITY_TYPE,
  UMB_EDIT_DOCUMENT_WORKSPACE_PATH_PATTERN,
} from '@umbraco-cms/backoffice/document';
import { UmbDocumentTypeStructureRepository } from '@umbraco-cms/backoffice/document-type';
import { UmbDocumentBlueprintItemRepository } from '@umbraco-cms/backoffice/document-blueprint';
import { umbOpenModal, UMB_ITEM_PICKER_MODAL } from '@umbraco-cms/backoffice/modal';
import { KanbanServerDataSource } from '@/data/kanban-server-data-source.js';
import type { KanbanDataSource } from '@/data/kanban-data-source.js';
import { datePresetValue } from '@/core/date-preset.model.js';
import type { KanbanCreateAtDetail } from '@/core/kanban-calendar.element.js';
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

  /**
   * The calendar configuration key. Optional: when unset the server resolves the configuration
   * from the parent's collection data type (`kanban.calendarConfigId`) — which is exactly what
   * the collection-view host relies on. Third-party hosts with no data type pass it explicitly.
   */
  @property({ attribute: 'config-id' })
  configId?: string;

  /** Display culture for variant content; unset loads invariant. */
  @property({ attribute: false })
  culture?: string | null;

  #datasource: KanbanDataSource = new KanbanServerDataSource(this);

  /**
   * Core's own repositories, so which types may be created under the parent — including rules that
   * depend on the parent document — stays core's answer. The same pair the card-children element uses.
   */
  #documentTypes = new UmbDocumentTypeStructureRepository(this);
  #blueprints = new UmbDocumentBlueprintItemRepository(this);

  /**
   * The values the next created document starts from. Set right before the create modal opens and
   * read by the registration's onSetup — the registration is constructed once, the preset per slot.
   */
  #pendingPreset: object = {};

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
      .onSetup(() => ({ data: { entityType: UMB_DOCUMENT_ENTITY_TYPE, preset: this.#pendingPreset } }))
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

    // Opening an existing document must not inherit a stale slot preset.
    this.#pendingPreset = {};
    this.#documentModal.open(
      {},
      UMB_EDIT_DOCUMENT_WORKSPACE_PATH_PATTERN.generateLocal({ unique: event.detail.key }),
    );
  }

  /**
   * A slot click becomes core's own create flow with the date pre-filled: allowed child type
   * (picked when the parent allows several), optional blueprint, then the create modal with a
   * preset patching the date property's editor value. Cancelling any picker simply stops.
   */
  async #onCreateAt(event: CustomEvent<KanbanCreateAtDetail>) {
    if (!this.#modalReady || !this.parentId) return;

    const { date, time, datePropertyAlias, datePropertyEditorAlias, parentContentTypeKey } = event.detail;
    const value = datePresetValue(datePropertyEditorAlias, { date, time });

    if (value === undefined) return;

    const { data } = await this.#documentTypes.requestAllowedChildrenOf(parentContentTypeKey, this.parentId);
    // A document type without a unique cannot be created against; none exist in practice.
    const types = (data?.items ?? []).filter((type) => !!type.unique);

    if (types.length === 0) return;

    let documentTypeUnique = types[0].unique as string;

    if (types.length > 1) {
      const picked = await umbOpenModal(this, UMB_ITEM_PICKER_MODAL, {
        data: {
          headline: 'Create',
          items: types.map((type) => ({
            label: type.name,
            value: type.unique as string,
            icon: type.icon ?? undefined,
            description: type.description ?? undefined,
          })),
        },
      }).catch(() => undefined);

      if (!picked?.value) return;

      documentTypeUnique = picked.value;
    }

    const { data: blueprints } = await this.#blueprints.requestItemsByDocumentType(documentTypeUnique);
    let blueprintUnique: string | undefined;

    if (blueprints && blueprints.length > 0) {
      const picked = await umbOpenModal(this, UMB_ITEM_PICKER_MODAL, {
        data: {
          headline: 'Start from',
          items: [
            { label: 'Blank', value: '', icon: 'icon-document' },
            ...blueprints.map((blueprint) => ({
              label: blueprint.name,
              value: blueprint.unique,
              icon: 'icon-blueprint',
            })),
          ],
        },
      }).catch(() => undefined);

      if (picked === undefined) return;

      blueprintUnique = picked.value || undefined;
    }

    const path = blueprintUnique
      ? UMB_CREATE_FROM_BLUEPRINT_DOCUMENT_WORKSPACE_PATH_PATTERN.generateLocal({
          parentEntityType: UMB_DOCUMENT_ENTITY_TYPE,
          parentUnique: this.parentId,
          documentTypeUnique,
          blueprintUnique,
        })
      : UMB_CREATE_DOCUMENT_WORKSPACE_PATH_PATTERN.generateLocal({
          parentEntityType: UMB_DOCUMENT_ENTITY_TYPE,
          parentUnique: this.parentId,
          documentTypeUnique,
        });

    this.#pendingPreset = {
      values: [{ alias: datePropertyAlias, culture: this.culture ?? null, segment: null, value }],
    };
    this.#documentModal.open({}, path);
  }

  override render() {
    if (!this.parentId) return html`<uui-loader></uui-loader>`;

    return html`
      <umb-community-kanban-calendar
        parent-id=${this.parentId}
        config-id=${this.configId ?? ''}
        .culture=${this.culture}
        .datasource=${this.#datasource}
        @kanban-open-document=${this.#onOpenDocument}
        @kanban-create-at=${this.#onCreateAt}></umb-community-kanban-calendar>
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
