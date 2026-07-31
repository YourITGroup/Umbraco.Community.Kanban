import { html, css, customElement, property, state, repeat } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { UMB_ICON_PICKER_MODAL } from '@umbraco-cms/backoffice/icon';
import { UMB_DATA_TYPE_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/data-type';
import { UmbSorterController } from '@umbraco-cms/backoffice/sorter';
import type { UmbPropertyEditorConfigCollection } from '@umbraco-cms/backoffice/property-editor';
import { KANBAN_LANE_CONTENT_TYPE_KEY, KANBAN_LANE_ORDER_KEY } from '@/constants.js';
import '@/core/lane-colour/lane-colour.element.js';
import type { UmbCommunityKanbanLaneColourElement } from '@/core/lane-colour/lane-colour.element.js';
import {
  buildLanePreviewRequest,
  type KanbanLanePreviewInput,
} from '@/data/kanban-lane-preview-data-source.js';
import { previewLanes } from '@/data/kanban-lane-preview-server-data-source.js';
import { orderLaneRows, toLaneOrder } from './lane-order.model.js';
import {
  mergeOverridesWithLanes,
  type KanbanLaneOverrideRow,
  type KanbanLaneOverrideValue,
  type KanbanResolvedLane,
} from './lane-override.model.js';

/**
 * Which sibling settings feed the preview, and what the rows are called. The board's historic
 * aliases are the defaults; the calendar's category appearance passes its own through the
 * setting's config. An empty `useManualAlias` means "manual whenever the manual list has rows"
 * (the calendar has no toggle), and an empty `orderAlias` disables reordering entirely.
 */
interface OverridesShape {
  propertyAlias: string;
  contentTypeKeyAlias: string;
  manualAlias: string;
  useManualAlias: string;
  orderAlias: string;
  subject: string;
}

const BOARD_SHAPE: OverridesShape = {
  propertyAlias: 'laneProperty',
  contentTypeKeyAlias: KANBAN_LANE_CONTENT_TYPE_KEY,
  manualAlias: 'manualLanes',
  useManualAlias: 'useManualLanes',
  orderAlias: KANBAN_LANE_ORDER_KEY,
  subject: 'lane',
};

/**
 * Edits per-lane appearance overrides — and, configured with the calendar's aliases, per-category
 * ones: the resolution, precedence and editing are identical, only which settings feed the
 * preview differs.
 *
 * Lanes come from the server rather than being typed by hand, so the editor
 * cannot mistype a lane value and silently lose the styling.
 */
@customElement('umb-community-kanban-lane-overrides')
export class UmbCommunityKanbanLaneOverridesElement extends UmbLitElement {
  /**
   * The stored overrides. Given a custom setter (matching `lanes` below) because
   * Umbraco's ordinary property-editor sequence often sets `value` after `lanes` -
   * stored values commonly arrive asynchronously - and `_rows` must be recomputed
   * whichever one changes, not only when `lanes` changes.
   */
  @property({ type: Array })
  set value(value: KanbanLaneOverrideValue[]) {
    this._value = value;
    this.#recomputeRows();
  }
  get value(): KanbanLaneOverrideValue[] {
    return this._value;
  }
  private _value: KanbanLaneOverrideValue[] = [];

  @state()
  private _rows: KanbanLaneOverrideRow[] = [];

  /** Distinguishes "not configured" from "configured but resolves to nothing" and from a failure. */
  @state()
  private _laneStatus: 'unconfigured' | 'resolved' | 'empty' | 'error' = 'unconfigured';

  #workspace?: typeof UMB_DATA_TYPE_WORKSPACE_CONTEXT.TYPE;
  #observed: KanbanLanePreviewInput = {};
  #debounce?: ReturnType<typeof setTimeout>;

  /**
   * Umbraco's own drag helper, the one its List View column configuration uses, so lanes reorder the
   * way everything else in the backoffice does. The element implements no dragging itself.
   *
   * The unique comes from a data attribute rather than `id`, which is what core's column editor uses:
   * a lane value is editor-authored and may contain spaces, which an id may not.
   */
  #sorter = new UmbSorterController<KanbanLaneOverrideRow, HTMLElement>(this, {
    getUniqueOfElement: (element) => element.dataset.laneValue,
    getUniqueOfModel: (row) => row.value,
    identifier: 'Umb.Community.Kanban.LaneOrder',
    itemSelector: '.row',
    containerSelector: '#lane-wrapper',
    handleSelector: '.drag-handle',
    onChange: ({ model }) => this.#onSorted(model),
  });

  /**
   * Only the newest request may apply its result. Five observed values means one edit can produce a
   * burst of requests, and a slower earlier one landing last would show the previous property's lanes.
   */
  #requestId = 0;

  #shape: OverridesShape = BOARD_SHAPE;

  /** Per-usage settings config selecting the shape; see OverridesShape. */
  @property({ attribute: false })
  set config(config: UmbPropertyEditorConfigCollection | undefined) {
    const read = (alias: string, fallback: string) => {
      const value = config?.getValueByAlias<string>(alias);
      return value === undefined ? fallback : value;
    };

    this.#shape = {
      propertyAlias: read('propertyAlias', BOARD_SHAPE.propertyAlias),
      contentTypeKeyAlias: read('contentTypeKeyAlias', BOARD_SHAPE.contentTypeKeyAlias),
      manualAlias: read('manualAlias', BOARD_SHAPE.manualAlias),
      useManualAlias: read('useManualAlias', BOARD_SHAPE.useManualAlias),
      orderAlias: read('orderAlias', BOARD_SHAPE.orderAlias),
      subject: read('subject', BOARD_SHAPE.subject),
    };
    void this.#setupObservations();
  }

  constructor() {
    super();

    this.consumeContext(UMB_DATA_TYPE_WORKSPACE_CONTEXT, (context) => {
      this.#workspace = context;
      void this.#setupObservations();
    });
  }

  /**
   * (Re)observes the shape's aliases. Runs from both the context callback and the config setter —
   * they arrive in no guaranteed order — with role-keyed observers so a re-run replaces the
   * previous observation rather than stacking a stale one.
   */
  async #setupObservations() {
    if (!this.#workspace) return;

    // Observed rather than read once: stored configuration arrives asynchronously, and every one
    // of these can change while this editor is on screen.
    await this.#observeValue<string>('property', this.#shape.propertyAlias, (value) => {
      this.#observed.laneProperty = value;
    });
    await this.#observeValue<string>('contentTypeKey', this.#shape.contentTypeKeyAlias, (value) => {
      this.#observed.laneContentTypeKey = value;
    });
    await this.#observeValue<boolean>('useManual', this.#shape.useManualAlias, (value) => {
      this.#observed.useManualLanes = value;
    });
    await this.#observeValue<unknown[]>('manual', this.#shape.manualAlias, (value) => {
      this.#observed.manualLanes = value;

      // With no toggle setting (the calendar), a non-empty manual list IS the toggle.
      if (!this.#shape.useManualAlias) {
        this.#observed.useManualLanes = (value?.length ?? 0) > 0;
      }
    });
    await this.#observeValue<string>('source', 'laneSource', (value) => (this.#observed.laneSource = value));

    // Also recomputes the rows directly: unlike the values above, the order changes what the editor
    // shows without changing which lanes exist, so it must not wait for a round trip to take effect.
    await this.#observeValue<string[]>('order', this.#shape.orderAlias, (value) => {
      this.#observed.laneOrder = value;
      this.#recomputeRows();
    });
  }

  async #observeValue<T>(role: string, alias: string, apply: (value: T | undefined) => void) {
    // An empty alias means this shape has no such setting; make sure nothing stale survives.
    if (!alias) {
      this.observe(undefined, () => {}, `_kanbanLanePreview_${role}`);
      return;
    }

    const observable = await this.#workspace!.propertyValueByAlias<T>(alias);

    this.observe(
      observable,
      (value) => {
        apply(value);
        this.#scheduleReload();
      },
      `_kanbanLanePreview_${role}`,
    );
  }

  /**
   * Debounced because the observers above fire in a burst — Umbraco sets stored values one at a time
   * — and each resolution can hit the database.
   */
  #scheduleReload() {
    clearTimeout(this.#debounce);
    this.#debounce = setTimeout(() => this.#reloadLanes(), 250);
  }

  async #reloadLanes() {
    const request = buildLanePreviewRequest(this.#observed);

    if (!request) {
      this._laneStatus = 'unconfigured';
      this.lanes = [];
      return;
    }

    const id = ++this.#requestId;
    const lanes = await previewLanes(this, request);

    if (id !== this.#requestId) return;

    if (lanes === undefined) {
      this._laneStatus = 'error';
      this.lanes = [];
      return;
    }

    this.lanes = lanes;
    // mergeOverridesWithLanes drops the unassigned lane, whose appearance is not configurable, so a
    // board resolving only that one has nothing to show here.
    this._laneStatus = this._rows.length > 0 ? 'resolved' : 'empty';
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this.#debounce);
  }

  /**
   * Resolved lanes. Normally fetched by this element from POST /lanes/preview; settable so a future
   * host that has already resolved them can supply them, and so the merge is testable in isolation.
   */
  @property({ type: Array, attribute: false })
  set lanes(lanes: KanbanResolvedLane[]) {
    this._lanes = lanes;
    this.#recomputeRows();
  }
  get lanes(): KanbanResolvedLane[] {
    return this._lanes;
  }
  private _lanes: KanbanResolvedLane[] = [];

  /**
   * The one place rows are built, because three inputs feed them — the resolved lanes, the stored
   * overrides and the stored order — and any of the three can arrive last.
   */
  #recomputeRows() {
    this._rows = orderLaneRows(
      mergeOverridesWithLanes(this._lanes, this._value ?? []),
      this.#observed.laneOrder,
    );

    // The sorter reorders the array it was given, so it needs the current one on every rebuild.
    this.#sorter.setModel(this._rows);
  }

  /**
   * Writes one field of one lane's override, dropping the override entirely once
   * every field is empty so an untouched lane leaves no residue in the stored value.
   */
  #onFieldChange(row: KanbanLaneOverrideRow, field: 'colour' | 'icon' | 'label', fieldValue: string) {
    const rest = (this.value ?? []).filter((o) => o.value.toLowerCase() !== row.value.toLowerCase());
    const updated: KanbanLaneOverrideValue = {
      ...row.override,
      value: row.value,
      [field]: fieldValue || undefined,
    };

    const isEmpty = !updated.colour && !updated.icon && !updated.label;
    const next = isEmpty ? rest : [...rest, updated];

    this.value = next;
    this.dispatchEvent(new UmbChangeEvent());
  }

  /**
   * Opens Umbraco's own icon picker. The modal returns a colour too, which is ignored —
   * lane colour is chosen by the swatches beside this button, so honouring both would
   * give one lane two competing colours.
   */
  async #pickIcon(row: KanbanLaneOverrideRow) {
    const result = await umbOpenModal(this, UMB_ICON_PICKER_MODAL, {
      value: { icon: row.override?.icon ?? '', color: '' },
      data: { showEmptyOption: true, hideColors: true },
    }).catch(() => undefined);

    if (result === undefined) return;

    this.#onFieldChange(row, 'icon', (result.icon as string) ?? '');
  }

  /**
   * Stores the dragged order. The sorter hands back the whole reordered model, so there is no index
   * arithmetic here — which is why `moveItem` is no longer used for lanes.
   */
  async #onSorted(rows: KanbanLaneOverrideRow[]) {
    if (!this.#shape.orderAlias) return;

    this._rows = rows;

    // Awaited before the change event for the same reason the lane property picker awaits its sibling
    // write: the order and the overrides land in the same configuration value list, and overlapping
    // them lets one read the list as it was before the other.
    this.#observed.laneOrder = toLaneOrder(rows);
    await this.#workspace?.setPropertyValue(this.#shape.orderAlias, this.#observed.laneOrder);

    this.dispatchEvent(new UmbChangeEvent());
  }

  override render() {
    // _rows is checked first so an orphaned override still renders its row when the configuration
    // currently resolves nothing — that row is the only way to remove it.
    if (this._rows.length > 0) {
      return html`<div id="lane-wrapper">
        ${repeat(
          this._rows,
          (row) => row.value,
          (row) => this.#renderRow(row),
        )}
      </div>`;
    }

    return html`<uui-box><p>${this.#emptyMessage()}</p></uui-box>`;
  }

  #emptyMessage() {
    const subject = this.#shape.subject;

    switch (this._laneStatus) {
      case 'empty':
        return `This configuration resolves no ${subject}s. The ${subject} property's editor may have no
          options this package can read, or the manual ${subject} list is in use but still empty.`;
      case 'error':
        return `The ${subject}s could not be loaded. Appearance can be edited once they load.`;
      default:
        return `Choose a ${subject} property first, then ${subject}s will appear here.`;
    }
  }

  #renderRow(row: KanbanLaneOverrideRow) {
    return html`
      <div class="row" data-lane-value=${row.value} ?data-orphaned=${row.orphaned}>
        ${this.#shape.orderAlias
          ? html`<uui-icon class="drag-handle" name="icon-grip" title="Drag to reorder"></uui-icon>`
          : ''}
        <span class="name">
          ${row.name}
          ${row.orphaned
            ? html`<uui-tag color="warning" look="secondary">no longer resolves</uui-tag>`
            : ''}
        </span>
        <uui-input
          label="Label"
          placeholder=${row.name}
          .value=${row.override?.label ?? ''}
          @change=${(e: Event) =>
            this.#onFieldChange(row, 'label', (e.target as HTMLInputElement).value)}></uui-input>
        <uui-button
          compact
          look="outline"
          label="Choose icon"
          @click=${() => this.#pickIcon(row)}>
          ${row.override?.icon
            ? html`<uui-icon name=${row.override.icon}></uui-icon>`
            : html`<uui-icon name="icon-add" style="opacity:.35"></uui-icon>`}
        </uui-button>
        <umb-community-kanban-lane-colour
          .value=${row.override?.colour ?? ''}
          label=${`Colour for ${row.name}`}
          @change=${(e: Event) =>
            this.#onFieldChange(
              row,
              'colour',
              (e.target as UmbCommunityKanbanLaneColourElement).value,
            )}></umb-community-kanban-lane-colour>
      </div>
    `;
  }

  static override styles = [
    css`
      .row {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-4);
        padding: var(--uui-size-space-2) 0;
        border-bottom: 1px solid var(--uui-color-divider);
      }
      .drag-handle {
        cursor: grab;
        color: var(--uui-color-text-alt);
      }
      .row[data-orphaned] .name {
        color: var(--uui-color-warning-emphasis);
      }
      .name {
        flex: 1;
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
      }
    `,
  ];
}

export { UmbCommunityKanbanLaneOverridesElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-lane-overrides': UmbCommunityKanbanLaneOverridesElement;
  }
}
