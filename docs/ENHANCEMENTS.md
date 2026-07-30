# Enhancements backlog

Agreed but not built. Each entry records enough of the *why* and the *where* to be picked up cold.
Design decisions live in `docs/superpowers/specs/`; this file only tracks intent and priority.

---

## Done: Contentment lane source (milestone 6, built ahead of 3)

**Built 2026-07-29**, from
[its design](superpowers/specs/2026-07-28-contentment-lane-source-design.md). The
`Umbraco.Community.Kanban.Contentment` package resolves lanes from any Data List data source through
Contentment's `IContentmentDataSource`, so a board can group by a booking's `status` without the
"Define lanes manually" toggle duplicating the enum by hand.

One limitation carried forward and documented in the package README: data sources that resolve
relative to the current node (*Umbraco Content Property Value*, the XPath source) produce no lanes,
because Contentment's own editor endpoint sets a content context that lane resolution has none of.
Wiring `IContentmentContentContext` in is possible — it is public — and remains backlog.

---

## 1, 4, 5 & 6. Cards open, list their children, and create them — **done 2026-07-29**

Built from
[their design](superpowers/specs/2026-07-29-card-workspace-modal-and-child-items-design.md). A card's
title opens its document in the workspace modal; each card lists its children with an edit button that
opens the same modal; an **Add** button creates a child there too, replicating the create action's own
type-then-blueprint choice; and the package's icon is `icon-columns` everywhere.

Items 1, 5 and 6 turned out to be one feature: all three end in the same modal, opened from one
`UmbModalRouteRegistrationController` on the board host, and item 5's create control lives inside item
6's child list.

Three things these entries recorded turned out to be wrong or undecided, and are settled in the design:

- Item 1 hoped a save might refresh the card "for free" through the collection's `items` observable. It
  does not — the collection context is never told a document was saved in our modal — so the host
  reloads the board from the modal's `onSubmit`.
- Item 6's three open questions are answered: children come from **one** level-filtered
  `GetPagedDescendants` per board rather than a per-card fetch, all child types are listed, and the
  whole section is gated on a `showChildItems` board setting — with a configurable sort property
  (sort order, name, last edited, created) and direction.
- Item 5 was right that v18 ships no document workspace modal token and that `UMB_WORKSPACE_MODAL`
  serves it. Blueprints proved reachable as well, through
  `UMB_CREATE_FROM_BLUEPRINT_DOCUMENT_WORKSPACE_PATH_PATTERN`, so they are supported rather than
  skipped. Core's own `UMB_DOCUMENT_CREATE_OPTIONS_MODAL` is not used: it finishes by navigating to the
  absolute workspace path, which is the behaviour item 5 existed to avoid.

## 2 & 3. Card properties as List View columns — **done 2026-07-29**

Both items are built, from
[their design](superpowers/specs/2026-07-29-card-properties-columns-design.md): card properties now
store alias, header, label template and a system flag, are edited with the List View's own column
control, drag to reorder, render label templates through `umb-ufm-render`, and default a new board to
the created and updated dates.

Two things recorded here turned out to be wrong and are corrected in the design:

- Item 2 said core's element "is not a public export ... under `dist-cms`". The *property editor* is
  not, but every part it is built from is: `UmbSorterController`, `umb-ufm-render` and
  `UmbCollectionColumnConfiguration` are all public.
- Item 3 called itself "blocked on system property support". It was — that support is what this work
  added, reading the five fields off `IContent` rather than through `IKanbanPropertyDataTypeLookup`,
  which is deliberately not involved.

---

## Done: drag write-back, pending state, publish-all (milestone 3)

**Built 2026-07-30**, from
[its design](superpowers/specs/2026-07-30-milestone-3-drag-write-back-design.md). Dragging a card
between lanes writes the board's lane property through `PUT /card/{key}/lane` — **save only**, so the
move stays reversible — the moved card's badge flips to pending immediately and then reconciles to
whatever the server persisted, and a board-level "Publish pending changes" action publishes them all in
one confirmed step.

Two scope lines worth keeping in view, both deliberate rather than discovered:

- **Publishing has no server endpoint.** It loops Umbraco's own `UmbDocumentPublishingRepository`
  client-side, one call per card, because core's document list-view bulk publish does exactly that and
  has no bulk endpoint behind it either.
- **"Pending" means loaded.** `pendingCards` filters what the board is holding in memory, the same way
  core's bulk action is scoped to its own selection. A card in an unpaged lane page, or beyond the
  board's truncation cap, does not count until it is paged in.

---

## Done: board canvas, equal-height lanes, drag ghost (milestone 4)

**Built 2026-07-31**, from
[its design](superpowers/specs/2026-07-31-milestone-4-canvas-and-drag-ghost-design.md). The board now owns
a bounded `.viewport` wrapping a content-height `.canvas`, so every lane is as tall as the fullest one and
a drop target is a whole column instead of the 82px stub an empty lane used to report. The dragged card
follows the cursor as a full-fidelity ghost, holding a canvas edge auto-scrolls, and Escape abandons a
drag.

What this fixed, and what it cost:

- **The real milestone-3 bug was geometry, not logic.** Hand-verification found an empty lane reporting a
  rect of 82px against a full lane's 8032px. `laneAtPoint` was correct all along and is unchanged; the
  rects it was given were the problem.
- **Two elements, not one.** `align-items: stretch` on a *bounded* container stretches items to the
  visible height and clips the fullest lane. Equal heights measured against the tallest lane need the
  flex container to be content-height, nested inside the bounded scroller — so `.viewport` and `.canvas`
  cannot be the same element.
- **The drop target is computed per frame, not per pointer event.** Auto-scroll moves lane rects while the
  pointer holds still, so a move-driven hit-test would go stale mid-gesture.
- **The board is sized to its container, not the window.** The workspace footer holding Save sits below
  the collection's container, so measuring `window.innerHeight` overhung it — 54px in a real layout — and
  grew a second scrollbar. The container is found by climbing ancestors and ignoring the boxless
  `router-slot` wrappers, whose percentage heights are the same broken chain that stops CSS sizing.
- **A lane must fill its stretched host.** `align-items: stretch` sizes the lane *host*; the `.lane` box
  inside its shadow root kept its own content height, so an empty lane's sticky header had only 82px to
  stick within. Full lanes hid the bug by being tall anyway.

**One change reaches beyond the board:** the document collection's manifest is re-registered at startup
with its `element` swapped for `umb-community-kanban-document-collection`, so a Kanban view can hide the
list view's pager and selection-action bar — neither can act on anything a board shows. The swap keeps
core's own `api` and `meta` references untouched, because that `api` is the non-public
`UmbDocumentCollectionContext` and it carries real behaviour (display-culture sequencing, and
`requestItemHref` for item links). Every other view sees identical behaviour: the suppression is gated on
the showing view's alias via `isChromelessCollectionView`, which is where the calendar view opts in later.
There was no narrower seam — the collection layout is chosen per entity type from a fixed alias, so
neither a collection view nor a data type's configuration can influence it.

## 7. Board configuration picker: match core's picker styling

The picker built on 2026-07-28 stacks its buttons in a column, which does not look like anything else
in the backoffice. It should read like the Collection and "Allowed child node types" fields do:

- **Chosen:** a ref row with the name and editor alias, actions (**Choose**, **Remove**) at the right.
- **Empty:** a **full-width** dashed placeholder **Choose** button, with **Create** appended to its
  end as a sub-button — one control, not two stacked ones.

`uui-button-group` is the mechanism for the split; the current `.editor` column flex and its
`--uui-size-space-3` gap go away.

Worth weighing while doing it: `UMB_DATA_TYPE_PICKER_MODAL` accepts a `createAction`
(`UmbTreePickerModalCreateActionData`) — core's own way of offering *create* from **inside** a picker,
which the document type picker token uses. That would move the create action into the modal instead of
appending it to the Choose button. It is more conventional, and it is not what was asked for; whoever
builds this should pick deliberately rather than discover the option late.

## 8. Add a card from the top of a lane

*Nice to have.* An add panel at the head of each lane, creating a content item with the lane property
already set to that lane's value — so "add to Confirmed" is one action rather than create-then-edit.

Builds on item 5 (create in the workspace modal) and on milestone 3's drag, both now done, so nothing
blocks it structurally. One thing still needs verifying first: whether a document's property values can
be preset. `UMB_WORKSPACE_MODAL` takes a `preset`, and `entity-detail-workspace-base` applies it as
`{...scaffold, ...preset}` — a **top-level spread**, so a preset `values` array replaces the scaffolded
one outright rather than merging into it. Presetting one property therefore means constructing the whole
`values` array, and the culture/segment of the entry has to be right for a varying document. Prove that
on a real document type before designing the panel.

Also unsettled: the unassigned lane has no value to preset, and a manual lane's value may not be a
legal value for the property at all (nothing validates manual lanes against the editor's options), so
this needs to degrade to a plain create rather than write something the property will reject.

## 9. Grab the board to pan it sideways

**Built 2026-07-29**, from
[its design](superpowers/specs/2026-07-29-board-pan-to-scroll-design.md). Dragging the board's own
background — never a card, never a lane — scrolls it sideways with the pointer, via a single
`event.target === event.currentTarget` check on `.lanes` and Pointer Capture retargeting. Touch is
untouched: `.lanes` already swipe-scrolls natively, with momentum, so the custom pan applies only to
mouse and pen pointer types.

The enhancement anticipated needing a movement threshold to avoid swallowing a card's or a lane
header's click. That did not turn out to be necessary: nothing is ever bound to a background click, so
there was never a click to protect, and nothing in `kanban-lane.element.ts` or `kanban-card.element.ts`
changed for this at all.

An attempt the same day to also pan vertically, from
[a follow-up design](superpowers/specs/2026-07-29-board-pan-vertical-design.md), did not work and was
reverted: it walked up through parent elements to find whatever ancestor already owned vertical
scrolling, but in the real Collection View host that ancestor is a plain `#main` div sealed inside
`umb-body-layout`'s own shadow root — reachable by climbing *past* that component as a host element,
never by looking *into* its shadow content, so the walk always found nothing and the drag silently
stayed horizontal-only. Same shadow-encapsulation problem the design meant to solve, one layer further
in.

**Closed by milestone 4.** The fix was the one this backlog note predicted: the board owns its own
vertical scrolling instead of borrowing an ancestor's. `.viewport` has `overflow: auto` and an explicit
pixel height measured from the window (`window.innerHeight - rectTop - gutter`, recomputed on resize),
because no ancestor CSS can supply one — `#router` has no height of its own and is shadow-sealed. Pan now
drives `scrollTop` alongside `scrollLeft`; `panScrollOffset` needed no change, having been written
axis-agnostic for exactly this.

Of the two open questions this note left, one is answered and one is not. The simpler self-scrolling box
was chosen over a **fixed-transform 2D canvas**, so zoom is still unbuilt — and now costs more, since the
ghost, the hit-test and the auto-scroll all work in viewport coordinates that a canvas transform would
invalidate. Whether controls rendering below the board need a reserved buffer has not come up in practice;
the measured gutter handles the padding, and nothing else renders in that region today.
