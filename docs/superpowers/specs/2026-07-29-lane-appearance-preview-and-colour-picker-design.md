# Lane appearance: real lanes, and a colour picker

**Date:** 2026-07-29
**Status:** Approved for planning
**Parent design:** [2026-07-28-umbraco-community-kanban-design.md](2026-07-28-umbraco-community-kanban-design.md)
**Builds on:** [2026-07-28-kanban-configuration-pickers-design.md](2026-07-28-kanban-configuration-pickers-design.md)

---

## 1. Problem

Two faults in the **Lane appearance** setting, one functional and one a departure from the original
brief.

**It never shows any lanes.** The editor renders "Choose a lane property first, then lanes will appear
here" whatever the configuration says, so per-lane colour, icon and label cannot be edited at all —
the setting is inert. The cause is a wrong assumption in the element itself, recorded in its own
comment:

> Resolved lanes, set by the host once it has called POST /lanes/preview.

There is no such host. `laneOverrides` is a property editor UI inside the Board configuration editor,
and a property editor UI receives `value` and `config` — nothing can reach in and set `lanes`. The
`POST /lanes/preview` endpoint works and is called by nobody.

**Colour is limited to eight palette swatches.** `uui-color-swatches` over
`KANBAN_LANE_PALETTE` offers only the backoffice's own hues, so a board cannot use a brand colour.
The original brief chose the Umbraco palette deliberately; this design departs from it, at the
editor's request, in favour of a full picker with an eye dropper.

## 2. Scope

**In**

- The lane appearance editor resolves its own lanes through `POST /lanes/preview`.
- `uui-color-swatches` becomes `uui-color-picker`, storing hex.
- Lane colour reaches the lane header as a CSS custom property rather than an inline
  `border-top-color`.

**Out**

- **Any server change.** The endpoint, the request model's `EffectiveContentTypeKey` fallback and the
  resolver all already do what is needed.
- **The server's palette cycle.** `KanbanLanePalette.Cycle` keeps emitting aliases for lanes nobody
  has overridden. It mirrors the backoffice palette by design, and the client renders aliases and hex
  alike, so changing it would be churn.
- **The calendar editor**, which has no lane appearance setting.
- **Reading `UnmatchedOverrides` from the response.** The client already derives orphaned rows itself
  in `mergeOverridesWithLanes`, which is covered by tests; consuming the server's field too would give
  one fact two sources.

## 3. What the palette aliases actually are

Worth recording, because it is the fact that settles the colour question and the codebase currently
states the opposite.

`extractUmbColorVariable` maps the eight aliases to `--uui-palette-*` variables — `blue` to
`--uui-palette-violet-blue`, `light-blue` to `--uui-palette-malibu`. Those live in a single `:root`
block in UUI's `palette.css` with **no theme override**; the `-dark` suffixed variables beside them
(`--uui-palette-violet-blue-dark`) are separate named hues, not dark-mode replacements. So `blue`
resolves to `#283a97` under either theme.

The comment on `laneColourStyle` therefore overstates the case:

> An Umbraco colour alias is preferred because it tracks light and dark mode

It does not, for these eight. Storing hex loses nothing, which is why this design stores hex without
trying to map a picked colour back onto an alias. **The comment is corrected as part of the work.**

## 4. Design

### 4.1 The editor resolves its own lanes

`UmbCommunityKanbanLaneOverridesElement` consumes `UMB_DATA_TYPE_WORKSPACE_CONTEXT` and observes the
sibling configuration values that decide what lanes exist — `laneProperty`, `laneContentTypeKey`,
`useManualLanes`, `manualLanes` and `laneSource` — exactly as the lane property picker already
observes `laneContentTypeKey`. On any change it assembles a configuration and posts it.

The `lanes` property stays, now as an override rather than the only route in: it keeps the element
testable and lets a future host supply lanes it has already fetched. Its comment stops claiming a host
does this today.

Two things make the request work without a document:

- The configuration is the **unsaved** one being edited, read from the workspace, so lanes update as
  the editor changes the lane property rather than only after a save.
- `contentTypeKey` is omitted. The server falls back to the configuration's own `laneContentTypeKey`
  through `EffectiveContentTypeKey` — the reason that field was added.

Requests are debounced, because observing five values means a burst of changes for one edit, and each
resolution can hit the database. Only the last response is applied: an earlier request that lands
later must not overwrite it, or an editor who re-picks quickly sees the previous property's lanes.

Manual boards are fixed by the same change and were equally broken: preview goes through the real
`KanbanLaneResolver`, so a board with **Define lanes manually** on gets its manual lanes back like any
others, and their appearance becomes editable for the first time.

### 4.2 Four states, not one message

The single "Choose a lane property first" message conflates a board that is not configured yet with
one that is configured wrongly. Splitting them is most of this setting's usefulness:

| State | Message |
| --- | --- |
| No lane property and manual lanes off | "Choose a lane property first, then lanes will appear here." (unchanged) |
| Lanes resolved | the rows |
| Configured, but resolved to no lanes | Names the likely cause: the property's editor has no options this package can read, or manual lanes are on with none defined. |
| The request failed | Says so, and that appearance can still be edited once lanes load. Not silence. |

A resolved board whose only lane is the unassigned one counts as "no lanes": `mergeOverridesWithLanes`
already filters it out, since an unassigned lane's appearance is not configurable.

### 4.3 The colour control

`uui-color-picker`, with the eight palette colours as its `swatches`. Swatch values must be real CSS
for the picker to render them, so the aliases are replaced by their hex equivalents — a new
`KANBAN_LANE_SWATCHES` list beside `KANBAN_LANE_PALETTE`, which stays as the mirror of the server's
cycle.

The eye dropper needs no work: UUI's picker already renders the button behind `'EyeDropper' in window`,
so Chromium gets it and Firefox and Safari get the rest of the picker without it. Building anything
bespoke would only duplicate that.

Everything the picker produces is stored as hex. Values stored by earlier versions are aliases and
keep working — §4.4 is what makes both render — so no migration is needed, and a board configured
before this change is untouched until someone edits a colour.

The picker needs an explicit **clear** affordance, which swatches gave for free by deselecting:
without one, a colour can be set but never unset, and an override with a colour never falls back to the
palette cycle again. A small compact button beside the picker, shown only while that lane has a colour,
writing an empty string — `#onFieldChange` already drops an override once all three of its fields are
empty, so an empty string is what restores the cycle, and a hex that merely looks neutral would not.

### 4.4 Colour reaches the header as a variable

Today the lane header carries `style="border-top-color: ${colour}"`, built conditionally. Instead the
element sets a custom property, `--kanban-lane-colour`, and the stylesheet consumes it with the
existing default as the fallback:

```css
border-top: 3px solid var(--kanban-lane-colour, var(--uui-color-border));
```

The fallback replaces the conditional: an uncoloured lane simply does not set the variable. The
variable holds whatever `laneColourStyle` resolved — a hex for a picked colour, or
`var(--uui-palette-violet-blue)` for a stored alias — so one code path serves both, and future styling
(a tinted background, a coloured badge) can read the same variable instead of threading the value
through again.

`laneColourStyle` keeps its signature and its injected `toVariable`, which is what makes it testable
in the Node environment.

## 5. Testing

Vitest runs `environment: 'node'`, so element behaviour is not unit-testable here — the same
constraint as the pickers. Logic is extracted to pure functions and tested there; the rest is verified
by hand.

- **`buildLanePreviewRequest`** — the observed values in, a request body or nothing out: a lane
  property alone is enough; manual lanes on with no property is enough (a manual board needs no
  property); neither yields nothing, so the element can skip the request rather than ask the server to
  resolve an empty configuration; `laneSource` and `manualLanes` are carried through; `contentTypeKey`
  is never sent.
- **`KANBAN_LANE_SWATCHES`** — a guard that it covers exactly `KANBAN_LANE_PALETTE`, one hex each, so
  the two lists cannot drift as the palette changes.
- **`laneColourStyle`** — already covered; extended to assert a hex passes through untouched, which is
  now the common case rather than the exception.
- **`mergeOverridesWithLanes`** — already covered, unchanged.

**Manual verification** (needs a running site): pick a lane property whose editor has options and
confirm its lanes appear as rows without saving; change the property and confirm the rows follow;
switch **Define lanes manually** on and confirm the manual lanes appear instead; set a colour from a
swatch, from a hex value and from the eye dropper, save, and confirm each renders on the board; clear
a colour and confirm the lane returns to its cycle colour; and confirm a board configured before this
change still renders its alias colours.

## 6. What could go wrong

- **The picker is a bigger control than a swatch row.** Eight swatches were compact; a picker with a
  trigger and popover in a flex row of label, icon and colour may crowd the row. Worth looking at
  rather than assuming, and the row's layout may need to change with it.
- **Debounce hides a slow resolution.** A lane property backed by a slow data source — a Contentment
  SQL source, say — makes the rows appear late with no indication anything is happening. A loading
  state is deliberately not specified: it is cheap to add once the real latency is known, and easy to
  get wrong by flashing on every keystroke.
- **Preview needs Settings access.** The endpoint is `AuthorizationPolicies.SectionAccessSettings`,
  which everyone reaching the data type editor already has. It becomes a real constraint only if lane
  appearance is ever edited from somewhere else.
- **Storing hex loses nothing today, but only because the palette is theme-invariant.** If Umbraco
  ever gives `--uui-palette-*` a dark-mode override, boards coloured after this change stay fixed
  while ones coloured before it follow the theme. That is the accepted cost of the departure from the
  original brief, recorded here so it is not rediscovered as a bug.

## 7. Definition of done

Every lane a board would show is listed under **Lane appearance** as soon as its lane property is
chosen — before any save, and for manual boards too — and each one's colour can be set from the
palette, from a hex value or with the eye dropper, cleared back to the palette cycle, and reaches the
lane header through a single CSS variable.
