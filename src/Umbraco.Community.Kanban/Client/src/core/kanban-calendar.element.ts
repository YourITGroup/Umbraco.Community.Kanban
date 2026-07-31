import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { extractUmbColorVariable } from '@umbraco-cms/backoffice/resources';
import { laneColourStyle } from './lane.model.js';
import type { KanbanDataSource } from '../data/kanban-data-source.js';
import type { KanbanCalendarItemModel, KanbanCalendarModel } from '../data/kanban-calendar.types.js';
import {
  addDays,
  addMonths,
  agendaDays,
  monthGrid,
  monthRange,
  placeByDay,
  weekRange,
  type CalendarWeek,
} from './calendar.model.js';
import type { KanbanCategoryAppearance } from './kanban-month-grid.element.js';
import './kanban-month-grid.element.js';
import './kanban-week-grid.element.js';
import './kanban-agenda.element.js';

export type KanbanCalendarView = 'month' | 'week';

/**
 * What a host needs to start a create from a slot: the slot itself plus the property/editor
 * pair the preset targets and the parent's content type for the allowed-children lookup —
 * all response data this element holds and its host deliberately does not.
 */
export interface KanbanCreateAtDetail {
  date: string;
  time?: string;
  datePropertyAlias: string;
  datePropertyEditorAlias: string;
  parentContentTypeKey: string;
}

/** The view toggle survives navigation and reloads; a calendar is a habit, not a setting. */
const VIEW_STORAGE_KEY = 'kanban-calendar-view';

/** Monday. A future configuration setting; today a constant the model is already generic over. */
const FIRST_DAY_OF_WEEK = 1;

/**
 * Calendar chrome and state: navigation (previous/today/next, month↔week toggle), fetching the
 * visible range through the datasource, and the notes that keep omissions honest (undated count,
 * truncation, fetch errors). Rendering a range is delegated to the grids; card and slot events
 * bubble up unchanged for a host to wire.
 */
@customElement('umb-community-kanban-calendar')
export class UmbCommunityKanbanCalendarElement extends UmbLitElement {
  @property({ attribute: 'parent-id' })
  parentId?: string;

  @property({ attribute: 'config-id' })
  configId?: string;

  @property({ attribute: false })
  culture?: string | null;

  @property({ attribute: false })
  datasource?: KanbanDataSource;

  @state()
  private _view: KanbanCalendarView = 'month';

  /** The month shown in month view; the anchor date's month in week view. */
  @state()
  private _anchor = todayIso();

  @state()
  private _calendar?: KanbanCalendarModel;

  @state()
  private _state: 'loading' | 'ready' | 'error' | 'not-configured' = 'loading';

  /** The inputs the last load ran for, so re-renders are not re-fetches. */
  #loadedFor?: string;

  constructor() {
    super();

    const stored = window.localStorage?.getItem(VIEW_STORAGE_KEY);

    if (stored === 'month' || stored === 'week') {
      this._view = stored;
    }
  }

  override updated() {
    if (!this.parentId || !this.configId || !this.datasource) return;

    const key = [this.parentId, this.configId, this.culture ?? '', this._view, this._anchor].join('|');

    if (key === this.#loadedFor) return;

    this.#loadedFor = key;
    void this.load();
  }

  get #range(): { from: string; to: string } {
    const { year, month } = anchorParts(this._anchor);

    return this._view === 'month'
      ? monthRange(year, month, FIRST_DAY_OF_WEEK)
      : weekRange(this._anchor, FIRST_DAY_OF_WEEK);
  }

  async load() {
    if (!this.parentId || !this.configId || !this.datasource) return;

    this._state = 'loading';

    const { from, to } = this.#range;
    const outcome = await this.datasource.getCalendar({
      parentId: this.parentId,
      configId: this.configId,
      culture: this.culture,
      from,
      to,
    });

    if (outcome.kind === 'success') {
      this._calendar = outcome.calendar;
      this._state = 'ready';
    } else {
      this._calendar = undefined;
      this._state = outcome.kind === 'not-configured' ? 'not-configured' : 'error';
    }
  }

  #setView(view: KanbanCalendarView) {
    this._view = view;
    window.localStorage?.setItem(VIEW_STORAGE_KEY, view);
  }

  #navigate(delta: -1 | 1) {
    if (this._view === 'month') {
      const { year, month } = anchorParts(this._anchor);
      const moved = addMonths(year, month, delta);

      this._anchor = `${moved.year.toString().padStart(4, '0')}-${moved.month.toString().padStart(2, '0')}-01`;
    } else {
      this._anchor = addDays(this._anchor, delta * 7);
    }
  }

  #today() {
    this._anchor = todayIso();
  }

  get #title(): string {
    const { year, month } = anchorParts(this._anchor);

    if (this._view === 'month') {
      return `${MONTH_NAMES[month - 1]} ${year}`;
    }

    const { from, to } = this.#range;

    return `${from} – ${to}`;
  }

  get #itemsByDay(): Map<string, KanbanCalendarItemModel[]> {
    return placeByDay(this._calendar?.items ?? []);
  }

  get #weeks(): CalendarWeek[] {
    const { year, month } = anchorParts(this._anchor);

    return monthGrid(year, month, FIRST_DAY_OF_WEEK, todayIso());
  }

  /**
   * Category value → accent. Categories arrive fully resolved from the server — the lane pipeline
   * has already applied source, overrides and the colour cycle — so this only maps values and
   * turns a palette alias into CSS the way lanes do. Unknown or absent categories get no accent.
   */
  get #appearanceFor(): (category: string | null | undefined) => KanbanCategoryAppearance {
    const byValue = new Map(
      (this._calendar?.categories ?? []).map((category) => [
        category.value,
        {
          colour: laneColourStyle(category.colour, extractUmbColorVariable),
          icon: category.icon ?? undefined,
        },
      ]),
    );

    return (category) => (category ? (byValue.get(category) ?? {}) : {});
  }

  /**
   * The grids only know the slot; the response data a create needs lives here. Their event is
   * swallowed and re-raised enriched, so hosts see exactly one create-at shape.
   */
  #onGridCreateAt(event: CustomEvent<{ date: string; time?: string }>) {
    event.stopPropagation();

    if (!this._calendar?.datePropertyEditorAlias) return;

    const detail: KanbanCreateAtDetail = {
      ...event.detail,
      datePropertyAlias: this._calendar.datePropertyAlias,
      datePropertyEditorAlias: this._calendar.datePropertyEditorAlias,
      parentContentTypeKey: this._calendar.parentContentTypeKey,
    };

    this.dispatchEvent(new CustomEvent('kanban-create-at', { detail, bubbles: true, composed: true }));
  }

  #renderNotes() {
    if (!this._calendar) return nothing;

    return html`
      ${this._calendar.truncated
        ? html`<div class="note">Not everything is shown — this range holds more items than the calendar reads.</div>`
        : nothing}
      ${this._calendar.undatedCount > 0
        ? html`<div class="note subtle">
            ${this._calendar.undatedCount} item${this._calendar.undatedCount === 1 ? ' has' : 's have'} no date.
          </div>`
        : nothing}
    `;
  }

  #renderBody() {
    if (this._state === 'loading') return html`<uui-loader></uui-loader>`;

    if (this._state === 'not-configured') {
      return html`<div class="note">This view has no Kanban calendar configuration.</div>`;
    }

    if (this._state === 'error') {
      return html`<div class="note">The calendar could not load. Navigate to retry.</div>`;
    }

    const grid =
      this._view === 'month'
        ? html`
            <umb-community-kanban-month-grid
              .weeks=${this.#weeks}
              .itemsByDay=${this.#itemsByDay}
              .appearanceFor=${this.#appearanceFor}
              ?disable-create=${!this._calendar?.datePropertyEditorAlias}
              @kanban-create-at=${this.#onGridCreateAt}></umb-community-kanban-month-grid>
          `
        : html`
            <umb-community-kanban-week-grid
              .days=${this.#weekDays}
              .itemsByDay=${this.#itemsByDay}
              .appearanceFor=${this.#appearanceFor}
              ?disable-create=${!this._calendar?.datePropertyEditorAlias}
              @kanban-create-at=${this.#onGridCreateAt}></umb-community-kanban-week-grid>
          `;

    return html`
      ${grid}
      ${this._calendar?.showAgenda
        ? html`<umb-community-kanban-agenda
            .days=${agendaDays(this._calendar?.items ?? [])}
            .appearanceFor=${this.#appearanceFor}></umb-community-kanban-agenda>`
        : nothing}
    `;
  }

  /** The 7 dates of the visible week, in order. */
  get #weekDays(): string[] {
    const { from } = weekRange(this._anchor, FIRST_DAY_OF_WEEK);

    return Array.from({ length: 7 }, (_, offset) => addDays(from, offset));
  }

  override render() {
    return html`
      <div class="toolbar">
        <uui-button-group>
          <uui-button label="Previous" compact @click=${() => this.#navigate(-1)}>
            <uui-symbol-expand open></uui-symbol-expand>‹
          </uui-button>
          <uui-button label="Today" compact @click=${this.#today}>Today</uui-button>
          <uui-button label="Next" compact @click=${() => this.#navigate(1)}>›</uui-button>
        </uui-button-group>
        <span class="title">${this.#title}</span>
        <uui-button-group>
          <uui-button
            label="Month view"
            compact
            look=${this._view === 'month' ? 'outline' : 'default'}
            @click=${() => this.#setView('month')}>
            Month
          </uui-button>
          <uui-button
            label="Week view"
            compact
            look=${this._view === 'week' ? 'outline' : 'default'}
            @click=${() => this.#setView('week')}>
            Week
          </uui-button>
        </uui-button-group>
      </div>
      ${this.#renderBody()} ${this.#renderNotes()}
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
      }

      .toolbar {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-4);
        margin-bottom: var(--uui-size-space-3);
      }

      .title {
        font-weight: 600;
        flex: 1;
      }

      .note {
        margin-top: var(--uui-size-space-3);
        font-size: var(--uui-type-small-size);
      }

      .note.subtle {
        color: var(--uui-color-text-alt);
      }
    `,
  ];
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function todayIso(): string {
  const now = new Date();

  return `${now.getFullYear().toString().padStart(4, '0')}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
}

function anchorParts(anchor: string): { year: number; month: number } {
  const [year, month] = anchor.split('-').map(Number);

  return { year, month };
}

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-calendar': UmbCommunityKanbanCalendarElement;
  }
}
