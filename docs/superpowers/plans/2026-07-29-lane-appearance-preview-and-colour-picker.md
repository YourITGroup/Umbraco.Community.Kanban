# Lane Appearance Preview and Colour Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Lane appearance setting lists the lanes a board would actually show, and each one's colour is chosen with a full picker — palette swatch, hex, or eye dropper — instead of eight fixed swatches.

**Architecture:** Three independent pieces. A colour element shared by the two editors that pick a lane colour. A lane header that takes its colour from a CSS custom property instead of an inline style. And the lane appearance editor consuming the data type workspace context to resolve its own lanes through the existing `POST /lanes/preview`, which nothing currently calls. No server code changes.

**Tech Stack:** TypeScript, Lit 3, `@umbraco-cms/backoffice` 18, Vite, Vitest (`environment: 'node'`).

**Design:** [2026-07-29-lane-appearance-preview-and-colour-picker-design.md](../specs/2026-07-29-lane-appearance-preview-and-colour-picker-design.md)

## Global Constraints

- **All work is client-side.** No changes to any `.cs` file: the endpoint, `EffectiveContentTypeKey` and the resolver already do what is needed. If a task appears to need a server change, stop and report — the design is wrong.
- **Vitest runs `environment: 'node'`**, so there is no DOM and no custom element registry. Element behaviour is **not** unit-testable. Put logic in pure functions in `*.model.ts` / `*.data-source.ts` files and test those; verify elements by hand.
- Every test file is `*.test.ts` beside the file it tests, using `import { describe, it, expect } from 'vitest';` and importing with an explicit `.js` extension (`./lane.model.js`), which is how every existing test imports.
- **`KanbanLanePalette.Cycle` on the server keeps emitting aliases.** Stored aliases from earlier versions must keep rendering; only newly picked colours are hex.
- Run tests with `npm test` from `src/Umbraco.Community.Kanban/Client`. Run `npm run build` before the final commit — it runs `tsc --noEmit` first, which is the only type check.
- Commit after each task. All commits go in `/Users/gandalf/Source/Repos/Umbraco.Community.Kanban`.

## File Structure

Client root is `src/Umbraco.Community.Kanban/Client`. All paths below are relative to it.

| File | Responsibility |
| --- | --- |
| `src/core/lane-colour/lane-colour.model.ts` | **Create.** The lane colour palette: `KANBAN_LANE_PALETTE` **moved here** from `lane-override.model.ts`, plus the hex swatch list derived from it. |
| `src/core/lane-colour/lane-colour.element.ts` | **Create.** `umb-community-kanban-lane-colour` — the picker plus swatches plus clear, shared by both editors. |
| `src/property-editors/lane-overrides/lane-override.model.ts` | **Modify.** Loses `KANBAN_LANE_PALETTE`; keeps `mergeOverridesWithLanes` and the types. |
| `src/core/lane.model.ts` | **Modify.** Correct the theme-awareness comment on `laneColourStyle`. |
| `src/core/kanban-lane.element.ts` | **Modify.** Set `--kanban-lane-colour` instead of an inline `border-top-color`. |
| `src/data/kanban-lane-preview-data-source.ts` | **Create.** `buildLanePreviewRequest` (pure) and `previewLanes` (the HTTP call). |
| `src/property-editors/lane-overrides/lane-overrides.element.ts` | **Modify.** Consume the workspace context, resolve lanes, render four states, use the shared colour element. |
| `src/property-editors/manual-lanes/manual-lanes.element.ts` | **Modify.** Use the shared colour element. |

Both new files live under `core/` rather than under either editor because both editors use them and
neither owns them. `KANBAN_LANE_PALETTE` moves with them: after this work nothing in
`property-editors/` references it, and the manual lanes editor currently reaches across into the lane
overrides folder to import it, which the move removes.

---

### Task 1: The shared lane colour element

The picker itself, plus the hex swatch list and its drift guard. Delivered first because both editors depend on it, and it is the piece with a test that can fail.

**Files:**
- Create: `src/core/lane-colour/lane-colour.model.ts`
- Test: `src/core/lane-colour/lane-colour.model.test.ts`
- Create: `src/core/lane-colour/lane-colour.element.ts`
- Modify: `src/property-editors/lane-overrides/lane-override.model.ts` (remove `KANBAN_LANE_PALETTE`)
- Modify: `src/property-editors/lane-overrides/lane-override.model.test.ts` (its palette test moves)
- Modify: `src/property-editors/manual-lanes/manual-lanes.element.ts:4` (import path only)
- Modify: `src/property-editors/lane-overrides/lane-overrides.element.ts:7` (import path only)

**Interfaces:**
- Consumes: nothing.
- Produces, all from `src/core/lane-colour/lane-colour.model.ts`:
  - `export const KANBAN_LANE_PALETTE: readonly string[]` — **moved** from `lane-override.model.ts`, unchanged: the eight aliases mirroring `KanbanLanePalette.Cycle` on the server.
  - `export const KANBAN_LANE_SWATCH_BY_ALIAS: Readonly<Record<string, string>>` — alias to hex.
  - `export const KANBAN_LANE_SWATCHES: readonly string[]` — the eight hexes, in `KANBAN_LANE_PALETTE` order.
- And the custom element `umb-community-kanban-lane-colour`, class `UmbCommunityKanbanLaneColourElement`, with `@property({ type: String }) value = ''` and `@property({ type: String }) label = 'Colour'`. Dispatches `UmbChangeEvent` on change; the new colour is read from `event.target.value`.

- [ ] **Step 1: Move the palette into its own file, with the failing swatch guard tests**

Create `src/core/lane-colour/lane-colour.model.test.ts`. Its first test is the existing
`it('matches the server palette exactly', ...)` **moved** out of `describe('lane override model')` in
`src/property-editors/lane-overrides/lane-override.model.test.ts` — delete that `it` block there and
drop `KANBAN_LANE_PALETTE` from that file's import, leaving its `mergeOverridesWithLanes` tests alone:

```ts
import { describe, it, expect } from 'vitest';
import {
  KANBAN_LANE_PALETTE,
  KANBAN_LANE_SWATCHES,
  KANBAN_LANE_SWATCH_BY_ALIAS,
} from './lane-colour.model.js';

describe('KANBAN_LANE_PALETTE', () => {
  it('matches the server palette exactly', () => {
    expect(KANBAN_LANE_PALETTE).toEqual([
      'yellow',
      'pink',
      'blue',
      'light-blue',
      'red',
      'green',
      'brown',
      'grey',
    ]);
  });
});

describe('KANBAN_LANE_SWATCHES', () => {
  it('offers one colour per palette alias, in the same order', () => {
    // The picker needs real CSS values, but the palette is the mirror of the server's cycle and
    // stays as aliases. Two lists means they can drift; this is the guard that they do not.
    expect(KANBAN_LANE_SWATCHES).toHaveLength(KANBAN_LANE_PALETTE.length);
    expect(KANBAN_LANE_SWATCHES).toEqual(KANBAN_LANE_PALETTE.map((alias) => KANBAN_LANE_SWATCH_BY_ALIAS[alias]));
  });

  it('maps every alias to a six-digit hex colour', () => {
    for (const alias of KANBAN_LANE_PALETTE) {
      expect(KANBAN_LANE_SWATCH_BY_ALIAS[alias]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('has no entry for an alias the palette does not contain', () => {
    // Guards a copy-paste of the legacy umbracoColors entries, which resolve to duplicate hues.
    expect(Object.keys(KANBAN_LANE_SWATCH_BY_ALIAS).sort()).toEqual([...KANBAN_LANE_PALETTE].sort());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban/src/Umbraco.Community.Kanban/Client && npm test`

Expected: FAIL — `./lane-colour.model.js` does not exist.

- [ ] **Step 3: Create the lane colour model**

Create `src/core/lane-colour/lane-colour.model.ts`. The first declaration is `KANBAN_LANE_PALETTE`, **moved verbatim** (including its comment) out of `src/property-editors/lane-overrides/lane-override.model.ts`, which loses it:

```ts
/** Mirrors KanbanLanePalette.Cycle on the server. Keep the two in step. */
export const KANBAN_LANE_PALETTE = [
  'yellow',
  'pink',
  'blue',
  'light-blue',
  'red',
  'green',
  'brown',
  'grey',
] as const;

/**
 * The palette aliases as concrete colours, because a colour picker's swatches must be real CSS —
 * `light-blue` is not a CSS colour. Taken from the `--uui-palette-*` variables the aliases resolve to
 * through Umbraco's own extractUmbColorVariable, which are declared once in UUI's palette.css with no
 * theme override, so a hex here is exactly what an alias renders as under either theme.
 */
export const KANBAN_LANE_SWATCH_BY_ALIAS: Readonly<Record<string, string>> = {
  yellow: '#fad634', // --uui-palette-sunglow
  pink: '#ffe8e6', // --uui-palette-spanish-pink
  blue: '#283a97', // --uui-palette-violet-blue
  'light-blue': '#3879ff', // --uui-palette-malibu
  red: '#df2a5d', // --uui-palette-maroon-flush
  green: '#2bc37c', // --uui-palette-jungle-green
  brown: '#9d8057', // --uui-palette-chamoisee
  grey: '#9b9b9b', // --uui-palette-dusty-grey
};

/** The swatches a lane colour picker offers, in palette order so it reads like the board's cycle. */
export const KANBAN_LANE_SWATCHES: readonly string[] = KANBAN_LANE_PALETTE.map(
  (alias) => KANBAN_LANE_SWATCH_BY_ALIAS[alias],
);
```

Then repoint the two files that imported the palette from its old home, so the build stays green — they
stop using it in Task 4, but must compile now:

- `src/property-editors/lane-overrides/lane-overrides.element.ts:7` — remove `KANBAN_LANE_PALETTE` from the `./lane-override.model.js` import and add `import { KANBAN_LANE_PALETTE } from '@/core/lane-colour/lane-colour.model.js';`
- `src/property-editors/manual-lanes/manual-lanes.element.ts:4` — change `from '../lane-overrides/lane-override.model.js'` to `from '@/core/lane-colour/lane-colour.model.js'`

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban/src/Umbraco.Community.Kanban/Client && npm test`

Expected: PASS, all files.

- [ ] **Step 5: Write the shared colour element**

Create `src/core/lane-colour/lane-colour.element.ts`:

```ts
import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';
import { KANBAN_LANE_SWATCHES } from './lane-colour.model.js';

/**
 * Picks a lane colour: one of the board palette's colours, any other colour, or — on Chromium — one
 * taken off the screen with the eye dropper. UUI's picker renders that button itself behind an
 * `'EyeDropper' in window` check, so Firefox and Safari get the rest of the picker without it and
 * nothing here needs to know the difference.
 *
 * Shared by the lane appearance and manual lanes editors, which both choose the same kind of value.
 * It knows nothing about lanes, overrides or configuration — it takes a colour and reports a colour —
 * which is what makes it shareable rather than merely duplicated.
 */
@customElement('umb-community-kanban-lane-colour')
export class UmbCommunityKanbanLaneColourElement extends UmbLitElement {
  /**
   * A hex colour for anything picked here. May also be an Umbraco colour alias for a value stored
   * before this control existed: the picker cannot show one, but it must not destroy one either, so
   * an alias reaches the picker as an empty value and survives until the editor picks something.
   */
  @property({ type: String })
  value = '';

  @property({ type: String })
  label = 'Colour';

  get #pickerValue(): string {
    return this.value.startsWith('#') ? this.value : '';
  }

  #onChange(event: Event) {
    event.stopPropagation();

    const picked = (event.target as HTMLInputElement).value ?? '';

    if (picked === this.value) return;

    this.value = picked;
    this.dispatchEvent(new UmbChangeEvent());
  }

  /**
   * Clearing is an explicit action because a picker has no "deselect" the way a swatch row did.
   * Without it a lane could be coloured but never returned to the board's palette cycle.
   */
  #onClear() {
    if (!this.value) return;

    this.value = '';
    this.dispatchEvent(new UmbChangeEvent());
  }

  override render() {
    return html`
      <uui-color-picker
        .value=${this.#pickerValue}
        .swatches=${[...KANBAN_LANE_SWATCHES]}
        label=${this.label}
        @change=${this.#onChange}></uui-color-picker>
      ${this.value
        ? html`<uui-button
            compact
            look="secondary"
            label="Clear colour"
            title="Clear colour"
            @click=${this.#onClear}>
            <uui-icon name="icon-trash"></uui-icon>
          </uui-button>`
        : nothing}
    `;
  }

  static override styles = [
    css`
      :host {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
      }
    `,
  ];
}

export { UmbCommunityKanbanLaneColourElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-lane-colour': UmbCommunityKanbanLaneColourElement;
  }
}
```

Note the `@/` import prefix — the project's Vite alias for `src/`, used the same way in `lane-property.element.ts`.

- [ ] **Step 6: Type-check**

Run: `cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban/src/Umbraco.Community.Kanban/Client && npm run build`

Expected: succeeds. If `uui-color-picker` is not a known element, add `import '@umbraco-cms/backoffice/external/uui';` at the top of the element — the same import the backoffice uses to register UUI elements. If `.swatches` is rejected as a property, it is because the element type has not been imported; the same import fixes it.

- [ ] **Step 7: Commit**

```bash
cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban
git add src/Umbraco.Community.Kanban/Client/src
git commit -m "feat: a shared lane colour picker with palette swatches and an eye dropper"
```

---

### Task 2: Lane colour reaches the header as a variable

Independent of the picker: it makes hex colours render, and rewires how any colour is applied. Small, and worth its own gate because it touches the board rather than the configuration editor.

**Files:**
- Modify: `src/core/kanban-lane.element.ts:33-37` (the render) and its `.header` style rule
- Modify: `src/core/lane.model.ts:1-8` (the comment)
- Test: `src/core/lane.model.test.ts`

**Interfaces:**
- Consumes: `laneColourStyle(colour, toVariable)` (existing, unchanged signature).
- Produces: the CSS custom property `--kanban-lane-colour` on the lane header element. No new exports.

- [ ] **Step 1: Write the failing test**

Add to the existing `describe('laneColourStyle', ...)` in `src/core/lane.model.test.ts`:

```ts
  it('passes a hex colour through, which is now the common case rather than the exception', () => {
    // Colours picked in the configuration editor are stored as hex; only boards configured before
    // the picker existed store aliases.
    expect(laneColourStyle('#283a97', known)).toBe('#283a97');
    expect(laneColourStyle('#FAD634', known)).toBe('#FAD634');
  });
```

- [ ] **Step 2: Run the test**

Run: `cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban/src/Umbraco.Community.Kanban/Client && npm test`

Expected: PASS immediately. `laneColourStyle` already passes unrecognised values through, so this test documents and locks behaviour the change depends on rather than driving new code. **Do not add code to make it pass.** If it fails, `laneColourStyle` is not what this task assumes and the header change must not proceed.

- [ ] **Step 3: Correct the comment on `laneColourStyle`**

In `src/core/lane.model.ts`, replace the doc comment's third and fourth lines — currently claiming aliases track the theme — so the whole comment reads:

```ts
/**
 * The CSS colour for a lane header.
 *
 * `toVariable` is injected rather than imported so this stays testable in the Node test
 * environment; the element passes Umbraco's own extractUmbColorVariable. An alias is resolved to its
 * `--uui-palette-*` variable and anything else is passed through as a raw CSS colour. The two are
 * equivalent in practice: those variables are declared once in UUI's palette.css with no theme
 * override, so an alias does not track light and dark mode — a claim this comment used to make.
 * Colours picked in the configuration editor are stored as hex; aliases come from boards configured
 * before that control existed, and from the server's own palette cycle.
 */
```

- [ ] **Step 4: Set the variable instead of the inline colour**

In `src/core/kanban-lane.element.ts`, replace the header line in `render()`:

```ts
        <div class="header" style=${colour ? `border-top-color: ${colour}` : ''}>
```

with:

```ts
        <div class="header" style=${colour ? `--kanban-lane-colour: ${colour}` : ''}>
```

- [ ] **Step 5: Consume the variable in the stylesheet**

In the same file's `.header` rule, replace:

```css
        border-top: 3px solid var(--uui-color-border);
```

with:

```css
        /* The fallback replaces the conditional the render used to carry: a lane with no colour
           simply does not set the variable. Anything else wanting to follow the lane's colour — a
           tinted background, a coloured badge — can read the same variable rather than having the
           value threaded through again. */
        border-top: 3px solid var(--kanban-lane-colour, var(--uui-color-border));
```

- [ ] **Step 6: Verify**

Run: `cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban/src/Umbraco.Community.Kanban/Client && npm test && npm run build`

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban
git add src/Umbraco.Community.Kanban/Client/src/core
git commit -m "refactor: apply lane colour through a CSS variable on the header"
```

---

### Task 3: The lane preview request

The data layer for `POST /lanes/preview`: a pure request builder with tests, and the thin HTTP call. Separated from Task 4 because the builder holds every decision worth testing, and the element that consumes it holds none.

**Files:**
- Create: `src/data/kanban-lane-preview-data-source.ts`
- Test: `src/data/kanban-lane-preview-data-source.test.ts`
- Modify: `src/constants.ts` (add the endpoint)
- Test: `src/constants.test.ts` (pin it)

**Interfaces:**
- Consumes: `KANBAN_API_PATH` (existing, in `constants.ts`).
- Produces:
  - `export const KANBAN_LANES_PREVIEW_ENDPOINT: string` in `constants.ts`.
  - `export interface KanbanLanePreviewInput { laneProperty?: string; laneContentTypeKey?: string; useManualLanes?: boolean; manualLanes?: unknown[]; laneSource?: string; laneOverrides?: unknown[]; }`
  - `export interface KanbanLanePreviewRequest { configuration: Record<string, unknown>; }`
  - `export function buildLanePreviewRequest(input: KanbanLanePreviewInput): KanbanLanePreviewRequest | undefined`
  - `export async function previewLanes(host: UmbControllerHost, request: KanbanLanePreviewRequest): Promise<KanbanResolvedLane[] | undefined>` — `undefined` means the request failed, an empty array means it resolved no lanes. The two are different states in the editor, so they must be distinguishable here.

- [ ] **Step 1: Write the failing tests**

Create `src/data/kanban-lane-preview-data-source.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildLanePreviewRequest } from './kanban-lane-preview-data-source.js';

describe('buildLanePreviewRequest', () => {
  it('sends the lane property, which is all an automatic board needs', () => {
    expect(buildLanePreviewRequest({ laneProperty: 'status' })).toEqual({
      configuration: { laneProperty: 'status' },
    });
  });

  it('sends the content type the property was picked from, which the server resolves against', () => {
    // The configuration editor has no document, so laneContentTypeKey is the only content type the
    // server can use — it stands in through KanbanLanePreviewRequestModel.EffectiveContentTypeKey.
    const request = buildLanePreviewRequest({
      laneProperty: 'status',
      laneContentTypeKey: '8f6f5f4e-0000-4000-8000-000000000001',
    });

    expect(request?.configuration.laneContentTypeKey).toBe('8f6f5f4e-0000-4000-8000-000000000001');
  });

  it('never sends a contentTypeKey of its own', () => {
    // Sending Guid.Empty would be honoured as a real request rather than falling back.
    const request = buildLanePreviewRequest({ laneProperty: 'status' });

    expect(request && 'contentTypeKey' in request).toBe(false);
  });

  it('previews a manual board, which needs no lane property at all', () => {
    const request = buildLanePreviewRequest({
      useManualLanes: true,
      manualLanes: [{ value: 'todo', label: 'To do' }],
    });

    expect(request).toEqual({
      configuration: { useManualLanes: true, manualLanes: [{ value: 'todo', label: 'To do' }] },
    });
  });

  it('carries a pinned lane source, so a hand-configured board previews as it will resolve', () => {
    const request = buildLanePreviewRequest({ laneProperty: 'status', laneSource: 'contentment-data-list' });

    expect(request?.configuration.laneSource).toBe('contentment-data-list');
  });

  it('omits everything that was not supplied, rather than sending empty values', () => {
    const request = buildLanePreviewRequest({ laneProperty: 'status' });

    expect(Object.keys(request!.configuration)).toEqual(['laneProperty']);
  });

  it('has nothing to preview when there is no lane property and lanes are not manual', () => {
    // The editor shows "choose a lane property first" instead of asking the server to resolve an
    // empty configuration.
    expect(buildLanePreviewRequest({})).toBeUndefined();
    expect(buildLanePreviewRequest({ laneProperty: '' })).toBeUndefined();
    expect(buildLanePreviewRequest({ laneProperty: '   ' })).toBeUndefined();
    expect(buildLanePreviewRequest({ useManualLanes: false })).toBeUndefined();
  });

  it('previews manual lanes even before any have been defined', () => {
    // The toggle alone changes what lanes exist, so the editor should stop saying "choose a
    // property first" the moment it is switched on.
    expect(buildLanePreviewRequest({ useManualLanes: true })).toEqual({
      configuration: { useManualLanes: true },
    });
  });

  it('does not send the overrides being edited, which cannot change which lanes exist', () => {
    const request = buildLanePreviewRequest({
      laneProperty: 'status',
      laneOverrides: [{ value: 'todo', colour: '#283a97' }],
    });

    expect('laneOverrides' in request!.configuration).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban/src/Umbraco.Community.Kanban/Client && npm test`

Expected: FAIL — `./kanban-lane-preview-data-source.js` does not exist.

- [ ] **Step 3: Add the endpoint constant**

In `src/constants.ts`, below `KANBAN_CONFIGURATIONS_ENDPOINT`:

```ts
export const KANBAN_LANES_PREVIEW_ENDPOINT = `${KANBAN_API_PATH}/lanes/preview`;
```

- [ ] **Step 4: Pin the endpoint in the constants test**

In `src/constants.test.ts`, add `KANBAN_LANES_PREVIEW_ENDPOINT` to the import from `./constants.js` and add this test inside the existing `describe('constants', ...)`:

```ts
  it('addresses the lane preview endpoint the LanesController exposes', () => {
    expect(KANBAN_LANES_PREVIEW_ENDPOINT).toBe('/umbraco/kanban/api/v1/lanes/preview');
  });
```

- [ ] **Step 5: Write the data source**

Create `src/data/kanban-lane-preview-data-source.ts`:

```ts
import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { KANBAN_LANES_PREVIEW_ENDPOINT } from '@/constants.js';
import type { KanbanResolvedLane } from '@/property-editors/lane-overrides/lane-override.model.js';

/** The board configuration values that decide which lanes exist, as the editor currently holds them. */
export interface KanbanLanePreviewInput {
  laneProperty?: string;
  laneContentTypeKey?: string;
  useManualLanes?: boolean;
  manualLanes?: unknown[];
  laneSource?: string;

  /**
   * Accepted and deliberately ignored, so a caller holding a whole board configuration can pass it
   * straight in. Overrides restyle lanes; they cannot change which lanes exist.
   */
  laneOverrides?: unknown[];
}

/** Mirrors KanbanLanePreviewRequestModel, minus contentTypeKey — see below. */
export interface KanbanLanePreviewRequest {
  configuration: Record<string, unknown>;
}

interface KanbanLanePreviewResponse {
  lanes: KanbanResolvedLane[];
}

/**
 * Assembles a preview request, or reports that there is nothing to preview.
 *
 * `contentTypeKey` is deliberately never sent. The configuration editor has no document and so no
 * content type of its own; omitting it lets the server fall back to the configuration's own
 * `laneContentTypeKey` through `EffectiveContentTypeKey`, which is the only content type available
 * here. Sending an empty GUID instead would be treated as a real answer and resolve nothing.
 *
 * The overrides being edited are not sent either: they restyle lanes, they cannot change which
 * lanes exist, so including them would make the request change on every keystroke for no effect.
 */
export function buildLanePreviewRequest(input: KanbanLanePreviewInput): KanbanLanePreviewRequest | undefined {
  const laneProperty = input.laneProperty?.trim() ?? '';
  const useManualLanes = input.useManualLanes === true;

  // A manual board resolves lanes with no property at all, so either one alone is enough.
  if (!laneProperty && !useManualLanes) return undefined;

  const configuration: Record<string, unknown> = {};

  if (laneProperty) configuration.laneProperty = laneProperty;
  if (input.laneContentTypeKey) configuration.laneContentTypeKey = input.laneContentTypeKey;
  if (useManualLanes) configuration.useManualLanes = true;
  if (input.manualLanes?.length) configuration.manualLanes = input.manualLanes;
  if (input.laneSource) configuration.laneSource = input.laneSource;

  return { configuration };
}

/**
 * Resolves the lanes a configuration would produce, without it having been saved.
 *
 * Returns undefined when the request failed and an empty array when it succeeded but produced no
 * lanes: the editor says different things about the two, so they must not collapse into one value.
 * Notifications are disabled because a failure here is shown inline beside the setting.
 */
export async function previewLanes(
  host: UmbControllerHost,
  request: KanbanLanePreviewRequest,
): Promise<KanbanResolvedLane[] | undefined> {
  const { data, error } = await tryExecute(
    host,
    umbHttpClient.post<KanbanLanePreviewResponse>({
      url: KANBAN_LANES_PREVIEW_ENDPOINT,
      body: request,
      security: [{ type: 'http', scheme: 'bearer' }],
    }),
    { disableNotifications: true },
  );

  if (error || !data) return undefined;

  return data.lanes ?? [];
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban/src/Umbraco.Community.Kanban/Client && npm test && npm run build`

Expected: both pass. If `umbHttpClient.post` rejects the `body` property, check how it is named in the installed client's types — `getBoard` in `kanban-server-data-source.ts` is the reference for the call shape, and only the body is new here.

- [ ] **Step 7: Commit**

```bash
cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban
git add src/Umbraco.Community.Kanban/Client/src
git commit -m "feat: build and send lane preview requests"
```

---

### Task 4: The lane appearance editor resolves its own lanes

Wires Task 3's data source into the editor and swaps in Task 1's colour element, which together make the setting work at all. Both changes land in one file, and neither is verifiable without the other.

**Files:**
- Modify: `src/property-editors/lane-overrides/lane-overrides.element.ts`
- Modify: `src/property-editors/manual-lanes/manual-lanes.element.ts:65-72`

**Interfaces:**
- Consumes: `buildLanePreviewRequest`, `previewLanes`, `KanbanLanePreviewInput` (Task 3); `umb-community-kanban-lane-colour` (Task 1); `mergeOverridesWithLanes`, `KanbanResolvedLane`, `KanbanLaneOverrideRow`, `KanbanLaneOverrideValue` (existing).
- Produces: no new exports.

- [ ] **Step 1: Replace the colour control in the lane appearance editor**

In `src/property-editors/lane-overrides/lane-overrides.element.ts`, in `#renderRow`, replace the whole `<uui-color-swatches>` block:

```ts
        <uui-color-swatches
          .value=${row.override?.colour ?? ''}
          @change=${(e: Event) =>
            this.#onFieldChange(row, 'colour', (e.target as HTMLInputElement).value)}>
          ${KANBAN_LANE_PALETTE.map(
            (colour) => html`<uui-color-swatch label=${colour} value=${colour}></uui-color-swatch>`,
          )}
        </uui-color-swatches>
```

with:

```ts
        <umb-community-kanban-lane-colour
          .value=${row.override?.colour ?? ''}
          label=${`Colour for ${row.name}`}
          @change=${(e: Event) =>
            this.#onFieldChange(
              row,
              'colour',
              (e.target as UmbCommunityKanbanLaneColourElement).value,
            )}></umb-community-kanban-lane-colour>
```

Then fix the imports at the top of the file: delete the whole `@/core/lane-colour/lane-colour.model.js` import Task 1 added — `KANBAN_LANE_PALETTE` was its only member and nothing here uses it now — and add:

```ts
import '@/core/lane-colour/lane-colour.element.js';
import type { UmbCommunityKanbanLaneColourElement } from '@/core/lane-colour/lane-colour.element.js';
```

The side-effect import registers the custom element; without it the tag renders as an unknown element and silently does nothing.

- [ ] **Step 2: Do the same in the manual lanes editor**

In `src/property-editors/manual-lanes/manual-lanes.element.ts`, replace its `<uui-color-swatches>` block (lines 65-72) with:

```ts
        <umb-community-kanban-lane-colour
          .value=${lane.colour ?? ''}
          label=${`Colour for ${lane.label || lane.value || 'this lane'}`}
          @change=${(e: Event) =>
            this.#onFieldChange(
              index,
              'colour',
              (e.target as UmbCommunityKanbanLaneColourElement).value,
            )}></umb-community-kanban-lane-colour>
```

and add the same two imports, again deleting its now-unused `KANBAN_LANE_PALETTE` import. After this
step nothing in `src/property-editors/` imports the palette — `grep -rn KANBAN_LANE_PALETTE src` should
match only `src/core/lane-colour/`.

- [ ] **Step 3: Resolve lanes from the workspace context**

In `src/property-editors/lane-overrides/lane-overrides.element.ts`, add to the imports:

```ts
import { UMB_DATA_TYPE_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/data-type';
import { KANBAN_LANE_CONTENT_TYPE_KEY } from '@/constants.js';
import {
  buildLanePreviewRequest,
  previewLanes,
  type KanbanLanePreviewInput,
} from '@/data/kanban-lane-preview-data-source.js';
```

Change the `lanes` property's doc comment, which currently claims a host supplies them, to:

```ts
  /**
   * Resolved lanes. Normally fetched by this element from POST /lanes/preview; settable so a future
   * host that has already resolved them can supply them, and so the merge is testable in isolation.
   */
```

Add these members to the class, after the `_rows` state:

```ts
  /** Distinguishes "not configured" from "configured but resolves to nothing" and from a failure. */
  @state()
  private _laneStatus: 'unconfigured' | 'resolved' | 'empty' | 'error' = 'unconfigured';

  #workspace?: typeof UMB_DATA_TYPE_WORKSPACE_CONTEXT.TYPE;
  #observed: KanbanLanePreviewInput = {};
  #debounce?: ReturnType<typeof setTimeout>;

  /**
   * Only the newest request may apply its result. Five observed values means one edit can produce a
   * burst of requests, and a slower earlier one landing last would show the previous property's lanes.
   */
  #requestId = 0;
```

Add a constructor that observes each value that decides which lanes exist:

```ts
  constructor() {
    super();

    this.consumeContext(UMB_DATA_TYPE_WORKSPACE_CONTEXT, async (context) => {
      this.#workspace = context;

      if (!context) return;

      // Observed rather than read once: stored configuration arrives asynchronously, and every one
      // of these can change while this editor is on screen.
      await this.#observeValue<string>('laneProperty', (value) => (this.#observed.laneProperty = value));
      await this.#observeValue<string>(
        KANBAN_LANE_CONTENT_TYPE_KEY,
        (value) => (this.#observed.laneContentTypeKey = value),
      );
      await this.#observeValue<boolean>('useManualLanes', (value) => (this.#observed.useManualLanes = value));
      await this.#observeValue<unknown[]>('manualLanes', (value) => (this.#observed.manualLanes = value));
      await this.#observeValue<string>('laneSource', (value) => (this.#observed.laneSource = value));
    });
  }

  async #observeValue<T>(alias: string, apply: (value: T | undefined) => void) {
    const observable = await this.#workspace!.propertyValueByAlias<T>(alias);

    this.observe(
      observable,
      (value) => {
        apply(value);
        this.#scheduleReload();
      },
      `_kanbanLanePreview_${alias}`,
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
```

`this.lanes = lanes` is what recomputes `_rows`, through the existing setter — which is why `_laneStatus` is decided from `_rows` after the assignment rather than from `lanes`.

- [ ] **Step 4: Render the four states**

Replace `render()` in the same file:

```ts
  override render() {
    if (this._rows.length > 0) {
      return html`${repeat(
        this._rows,
        (row) => row.value,
        (row) => this.#renderRow(row),
      )}`;
    }

    return html`<uui-box><p>${this.#emptyMessage()}</p></uui-box>`;
  }

  #emptyMessage() {
    switch (this._laneStatus) {
      case 'empty':
        return `This configuration resolves no lanes. The lane property's editor may have no options
          this package can read, or "Define lanes manually" is on with no lanes defined yet.`;
      case 'error':
        return 'The lanes could not be loaded. Appearance can be edited once they load.';
      default:
        return 'Choose a lane property first, then lanes will appear here.';
    }
  }
```

`_rows` is checked first rather than `_laneStatus`, so an orphaned override still renders its row when the configuration currently resolves nothing — that row is the only way to remove it.

- [ ] **Step 5: Verify**

Run: `cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban/src/Umbraco.Community.Kanban/Client && npm test && npm run build`

Expected: both pass, 17 test files — the 15 that exist today plus `lane-colour.model.test.ts` and `kanban-lane-preview-data-source.test.ts`. No test covers the element itself — Vitest has no DOM here — so a green run means only that nothing else broke.

- [ ] **Step 6: Commit**

```bash
cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban
git add src/Umbraco.Community.Kanban/Client/src
git commit -m "feat: resolve lanes in the lane appearance editor and pick colours with a picker"
```

- [ ] **Step 7: Mark the design implemented**

In `docs/superpowers/specs/2026-07-29-lane-appearance-preview-and-colour-picker-design.md`, change `**Status:** Approved for planning` to `**Status:** Implemented`.

```bash
cd /Users/gandalf/Source/Repos/Umbraco.Community.Kanban
git add docs
git commit -m "docs: mark the lane appearance design implemented"
```

- [ ] **Step 8: Report**

State that the client builds and tests pass, and hand over the manual verification, which needs a running site and which nothing in this plan can substitute for:

- Pick a lane property whose editor has options; its lanes appear as rows **without saving**.
- Change the property; the rows follow.
- Switch **Define lanes manually** on; the manual lanes appear instead.
- Set a colour from a swatch, from a typed hex, and with the eye dropper (Chromium only); save; each renders on the board.
- Clear a colour; the lane returns to its palette cycle colour.
- A board configured before this change still renders its alias colours.
- The row layout still reads well with a picker in it — §6 of the design flags crowding as a real risk.

Do not kill or restart the Umbraco site to do this.

---

## Notes for the implementer

- **`KANBAN_LANE_PALETTE` moves but does not go away.** It mirrors `KanbanLanePalette.Cycle` on the server and is what `KANBAN_LANE_SWATCHES` is derived from. Deleting it breaks the drift guard test, which is the point of having both.
- **The lane appearance editor keeps deriving orphaned rows itself.** `POST /lanes/preview` also returns `unmatchedOverrides`, which this plan deliberately ignores: `mergeOverridesWithLanes` already computes them and is tested, so consuming both would give one fact two sources.
- **Do not send `laneOverrides` in the preview request.** It is the value this editor is editing; including it would re-request on every keystroke and cannot change which lanes exist.
- **Do not add a loading state.** Deliberately out of scope in §6 of the design: it is easy to make it flash on every keystroke, and cheap to add once real latency is known.
- **An alias in a stored colour must survive an untouched row.** The picker cannot display `blue`, so `#pickerValue` hides it, but `value` keeps it and no change event fires until the editor picks something. Do not "normalise" a stored alias to hex on load — that would dirty every board configured before this change, on open.
- **If a test needs a DOM**, stop. Vitest is `environment: 'node'` here; that is why the logic worth testing lives in `buildLanePreviewRequest` and the swatch guard.
