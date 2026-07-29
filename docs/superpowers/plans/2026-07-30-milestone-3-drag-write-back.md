# Milestone 3 — Drag write-back, pending state, publish-all — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an editor drag a card between lanes — writing the lane property back, save only — see the moved card go pending immediately, and publish every pending card on the board from one confirmed toolbar action.

**Architecture:** A new `PUT /card/{key}/lane` endpoint, a thin `CardController` over a new `KanbanCardService` in the shape `BoardController`/`KanbanBoardService` already established, writing through a narrow `IKanbanContentWriter` wrapper over `IContentService` so the service is testable against a fake. `AllowDrag` is threaded from the board configuration to the client, retiring the board element's hardcoded `readonly`. On the client, cards raise pointer events, the board hit-tests its own lane rects (only it can see every lane at once), moves the card optimistically through pure `board.model.ts` reducers, and snaps it back on failure. Publishing reuses Umbraco's own `UmbDocumentPublishingRepository` client-side, one call per pending card — the same shape as core's `publish.bulk-action.js` — so there is no new server endpoint for publishing.

**Tech Stack:** .NET 10, Umbraco CMS 18.0.2, xUnit + FluentAssertions (no mocking framework — hand-written fakes), TypeScript, Lit 3, Vite, Vitest.

**Spec:** [docs/superpowers/specs/2026-07-30-milestone-3-drag-write-back-design.md](../specs/2026-07-30-milestone-3-drag-write-back-design.md)

## Global Constraints

- Repo root for every path below: `/Users/gandalf/Source/Repos/Umbraco.Community.Kanban`
- Target Umbraco CMS **18.0.2** and .NET **10**. Every Umbraco API named in this plan has been verified against the installed packages — do not substitute a differently-named member because it looks more familiar from an older version.
- **File-scoped namespaces**, **primary constructors**, and **no underscore prefix on private fields** — the repo's .NET style, no exceptions.
- **Every new public C# member gets an XML doc comment** explaining *why*, not what — the existing files are the tone to match.
- Nullable reference types are enabled; honour it.
- **No mocking framework.** Server tests use hand-written fakes. Shared fakes live in `tests/Umbraco.Community.Kanban.Tests/Fakes/` as `internal sealed`, namespace `Umbraco.Community.Kanban.Tests.Fakes`.
- **Server test naming:** `Sentence_case_with_underscores` for service tests, `Member_DescribesBehaviour` for model tests. Follow the file you are editing.
- **Private members on Lit elements use `#name`** (native private); `@state()` fields use a leading underscore (`_status`) — match the existing elements exactly.
- **Never import from `@umbraco-cms/backoffice/dist-cms/...`** — only public subpath exports (`/document`, `/modal`, `/notification`, `/variant`, `/lit-element`, `/external/lit`, `/resources`, `/http-client`, `/controller-api`).
- Client Vitest runs in a **Node environment with no custom-elements registry** (`vitest.config.ts`: `environment: 'node'`). Lit elements are therefore NOT DOM-tested. Only pure model/logic modules get unit tests; elements are verified by `tsc --noEmit` and `npm run build`. Do not add a browser test runner.
- API paths and aliases are constants in `src/Umbraco.Community.Kanban/Constants.cs` (server) and `Client/src/constants.ts` (client). Never inline them as magic strings.
- Server test command: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj`
- Client test command: `cd src/Umbraco.Community.Kanban/Client && npm run test`
- Client type-check + build: `cd src/Umbraco.Community.Kanban/Client && npm run build`
- **Save, never publish.** The write path calls `IContentService.Save` only. No `SaveAndPublish`, no publish call anywhere on the server side of this milestone. The whole point is that a drag is reversible before it goes live.
- Everything on the spec's §1 "Out" list is out. In particular: **no calendar drag** (milestone 4), **no real-time reconciliation** (milestone 5), **no validation of a dropped lane value against the property's legal options**, and **no server-side discovery of pending cards** beyond what the board already holds in memory.

**Verified API facts this plan depends on** (do not re-derive):

- `OperationResult IContentService.Save(IContent content, int? userId = null, ContentScheduleCollection? contentSchedule = null)` — returns a plain `OperationResult` (namespace `Umbraco.Cms.Core.Services.OperationStatus`… the type itself is `Umbraco.Cms.Core.Services.OperationResult`), exposing `bool Success`. It is **not** wrapped in `Attempt<>` in Umbraco 18.
- `IContent? IContentService.GetById(int id)` exists alongside `GetById(Guid key)`, and is synchronous.
- `IContentBase.SetValue(string propertyTypeAlias, object? value, string? culture = null, string? segment = null)`.
- `IContentPermissionAuthorizer.IsDeniedAsync(IUser, IEnumerable<Guid>, ISet<string>)` → `Task<bool>`. `ActionUpdate.ActionLetter == "Umb.Document.Update"` (`public const string` in `Umbraco.Cms.Core.Actions`).
- `ManagementApiControllerBase` exposes `protected static IUser CurrentUser(IBackOfficeSecurityAccessor)` and a `Forbidden()` helper. `ProblemDetailsBuilder` lives in `Umbraco.Cms.Api.Common.Builders` with `WithTitle`/`WithDetail`/`Build`.
- Client: `UmbDocumentPublishingRepository` is exported from `@umbraco-cms/backoffice/document`. Its signature is `publish(unique: string, variants: Array<UmbDocumentVariantPublishModel>)`, where `UmbDocumentVariantPublishModel` is `{ variantId: UmbVariantId; schedule?: ScheduleRequestModel | null }`. It returns `{ error }` — a truthy `error` means that one document failed.
- Client: `UmbVariantId` is exported from `@umbraco-cms/backoffice/variant`, with `new UmbVariantId(culture, segment)` and `UmbVariantId.CreateInvariant()`.
- Client: `umbConfirmModal(host, data)` is exported from `@umbraco-cms/backoffice/modal`. `data` is `{ headline: string; content: TemplateResult | string; color?: 'positive'|'danger'|'warning'; cancelLabel?: string; confirmLabel?: string }`. It returns `Promise<undefined>` and **rejects** on cancel — so the call site is `await umbConfirmModal(...).catch(() => false)` followed by `if (confirmed === false) return;`, exactly as core's `publish.bulk-action.js` does it.
- Client: `UMB_NOTIFICATION_CONTEXT` from `@umbraco-cms/backoffice/notification`; `context.peek('danger' | 'positive' | 'warning', { data: { headline?, message } })` is what renders a `uui-toast-notification`. This is the supported way to show one — the board never instantiates the toast element itself.
- Client: `css` supports `color-mix(in srgb, …)` verbatim; it is plain CSS passed through, not a Lit feature.

## File Structure

**New — server**

| File | Responsibility |
| --- | --- |
| `src/Umbraco.Community.Kanban/Services/IKanbanContentWriter.cs` | The write slice of `IContentService`, plus `KanbanCardSaveResult`. |
| `src/Umbraco.Community.Kanban/Services/KanbanContentWriter.cs` | Its `IContentService` implementation, plus the pure `KanbanWriteCulture`. |
| `tests/Umbraco.Community.Kanban.Tests/Services/KanbanWriteCultureTests.cs` | Tests the property-vs-document variation rule. |
| `src/Umbraco.Community.Kanban/Services/IKanbanCardService.cs` | `KanbanCardLaneRequest`/`Result`/`Status` and the service contract. |
| `src/Umbraco.Community.Kanban/Services/KanbanCardService.cs` | Load → configure → authorise → write → report state. |
| `src/Umbraco.Community.Kanban/Models/Api/KanbanCardLaneRequestModel.cs` | The `PUT /card/{key}/lane` body. |
| `src/Umbraco.Community.Kanban/Models/Api/KanbanCardLaneResponseModel.cs` | The response: the persisted card state. |
| `src/Umbraco.Community.Kanban/Controllers/CardController.cs` | `PUT /card/{key}/lane`. |
| `tests/Umbraco.Community.Kanban.Tests/Fakes/FakeKanbanContentWriter.cs` | Records writes; lets a test set the resulting published/edited pair. |
| `tests/Umbraco.Community.Kanban.Tests/Services/KanbanCardServiceTests.cs` | The card-lane-write suite. |

**New — client**

| File | Responsibility |
| --- | --- |
| `src/Umbraco.Community.Kanban/Client/src/core/drag.model.ts` | `shouldStartCardDrag`, `laneAtPoint`, `moveFailureMessage`, `formatPublishSummary`. Pure. |
| `src/Umbraco.Community.Kanban/Client/src/core/drag.model.test.ts` | Tests for the above. |

**Changed** — each task names its own; the spec's §6 table is the authority for the whole set.

`core/` imports nothing from `hosts/` or `workspace-views/`. Nothing in the toolchain enforces this — it is a review gate.

---

### Task 1: `AllowDrag` reaches the client

The board configuration already carries `AllowDrag`; nothing outside the configuration editor reads it. Thread it through the response the same way `ShowChildItems` already is. Server only — the client mirror is Task 5.

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Models/Api/KanbanBoardResponseModel.cs`
- Modify: `src/Umbraco.Community.Kanban/Services/KanbanBoardComposer.cs`
- Modify: `src/Umbraco.Community.Kanban/Services/KanbanBoardService.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Services/KanbanBoardServiceTests.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Services/KanbanBoardComposerTests.cs`

**Interfaces:**
- Consumes: `KanbanBoardConfiguration.AllowDrag` (already exists, defaults `true`).
- Produces:
  - `KanbanBoardResponseModel.AllowDrag` (`bool`)
  - `KanbanBoardComposerRequest`'s new trailing parameter `bool AllowDrag = false`

- [ ] **Step 1: Write the failing composer test**

Append to `tests/Umbraco.Community.Kanban.Tests/Services/KanbanBoardComposerTests.cs`, inside the class:

```csharp
    [Fact]
    public void Echoes_allow_drag_off_by_default_so_a_caller_that_does_not_set_it_cannot_enable_dragging()
    {
        KanbanBoardComposer.Compose(Request([])).AllowDrag.Should().BeFalse();
    }

    [Fact]
    public void Echoes_allow_drag_when_the_request_carries_it()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            new KanbanBoardComposerRequest(Lanes(), [], 0, false, 25, null, 0, false, AllowDrag: true));

        board.AllowDrag.Should().BeTrue();
    }
```

The default-false case is the one worth pinning: the composer is where a missing wire-up would silently turn dragging *on* for everyone if the default were `true`. The configuration's own default is `true`; the composer's is not, so only an explicit thread-through enables it.

- [ ] **Step 2: Write the failing board service test**

Append to `tests/Umbraco.Community.Kanban.Tests/Services/KanbanBoardServiceTests.cs`, inside the class:

```csharp
    [Fact]
    public async Task Reports_allow_drag_from_the_configuration()
    {
        Harness harness = Configured(new KanbanBoardConfiguration
        {
            LaneProperty = "status",
            CardProperties = CardPropertyList.Of("status"),
            LanePageSize = 25,
            AllowDrag = true,
        });

        KanbanBoardResult result = await harness.Service.GetBoardAsync(Request(), User);

        result.Board!.AllowDrag.Should().BeTrue();
    }

    [Fact]
    public async Task Reports_allow_drag_off_when_the_configuration_disables_it()
    {
        Harness harness = Configured(new KanbanBoardConfiguration
        {
            LaneProperty = "status",
            CardProperties = CardPropertyList.Of("status"),
            LanePageSize = 25,
            AllowDrag = false,
        });

        KanbanBoardResult result = await harness.Service.GetBoardAsync(Request(), User);

        result.Board!.AllowDrag.Should().BeFalse();
    }
```

- [ ] **Step 3: Run both to verify they fail**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj --filter "FullyQualifiedName~KanbanBoardComposerTests|FullyQualifiedName~KanbanBoardServiceTests"`
Expected: compile error — `KanbanBoardResponseModel.AllowDrag` and the composer request's `AllowDrag` parameter do not exist.

- [ ] **Step 4: Add the response field**

In `src/Umbraco.Community.Kanban/Models/Api/KanbanBoardResponseModel.cs`, on `KanbanBoardResponseModel`, after `ShowChildItems`:

```csharp
    /// <summary>
    /// Whether this board's configuration permits dragging cards between lanes. Board-wide, and paired
    /// with each card's own <see cref="KanbanCardModel.CanUpdate" />: only the server knows both the
    /// configuration and the per-card permission, so a host cannot supply this and does not try.
    /// </summary>
    public bool AllowDrag { get; init; }
```

- [ ] **Step 5: Thread it through the composer**

In `src/Umbraco.Community.Kanban/Services/KanbanBoardComposer.cs`, add a trailing parameter to `KanbanBoardComposerRequest` — **with a default**, so every existing positional construction in `KanbanBoardComposerTests` keeps compiling:

```csharp
/// <param name="AllowDrag">Whether the board permits dragging cards between lanes, echoed to the client.</param>
public sealed record KanbanBoardComposerRequest(
    IReadOnlyList<KanbanLane> Lanes,
    IReadOnlyList<KanbanCardAssignment> Cards,
    int ChildCount,
    bool Truncated,
    int PageSize,
    string? Lane,
    int Skip,
    bool ShowChildItems = false,
    bool AllowDrag = false);
```

and set it on the response inside `Compose`, after `ShowChildItems`:

```csharp
            ShowChildItems = request.ShowChildItems,
            AllowDrag = request.AllowDrag,
```

- [ ] **Step 6: Thread it through the board service**

In `src/Umbraco.Community.Kanban/Services/KanbanBoardService.cs`, at the end of `ComposeAsync`, add the argument to the `KanbanBoardComposerRequest` construction:

```csharp
        return KanbanBoardComposer.Compose(new KanbanBoardComposerRequest(
            lanes.Lanes,
            assignments,
            page.TotalChildCount,
            truncated,
            pageSize,
            request.Lane,
            request.Skip ?? 0,
            configuration.ShowChildItems,
            configuration.AllowDrag));
```

- [ ] **Step 7: Run the whole server suite**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj`
Expected: PASS — 4 new tests, every pre-existing test untouched.

- [ ] **Step 8: Commit**

```bash
git add src/Umbraco.Community.Kanban tests/Umbraco.Community.Kanban.Tests
git commit -m "feat: report a board's allowDrag setting to the client"
```

---

### Task 2: The content writer

The narrow write slice of `IContentService`, mirroring how `IKanbanContentLoader` wraps its own read slice. `IContentService` has dozens of members and cannot be constructed without persistence infrastructure this test project lacks, so this wrapper is what makes Task 3's service testable at all.

Nothing calls it yet.

**Files:**
- Create: `src/Umbraco.Community.Kanban/Services/IKanbanContentWriter.cs`
- Create: `src/Umbraco.Community.Kanban/Services/KanbanContentWriter.cs`
- Create: `tests/Umbraco.Community.Kanban.Tests/Services/KanbanWriteCultureTests.cs`
- Modify: `src/Umbraco.Community.Kanban/Services/IKanbanContentLoader.cs`
- Modify: `src/Umbraco.Community.Kanban/Services/KanbanContentLoader.cs`
- Modify: `tests/Umbraco.Community.Kanban.Tests/Fakes/FakeKanbanContentLoader.cs`
- Modify: `src/Umbraco.Community.Kanban/Extensions/UmbracoBuilderExtensions.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Composing/KanbanBoardRegistrationTests.cs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `Umbraco.Community.Kanban.Services.KanbanCardSaveResult(bool Saved, bool Published, bool Edited)` with `static KanbanCardSaveResult NotSaved { get; }`
  - `IKanbanContentWriter.SetLaneValue(IContent content, string laneProperty, string laneValue, string? culture)` → `KanbanCardSaveResult`
  - `KanbanWriteCulture.ForProperty(IPropertyType propertyType, string? culture)` → `string?`
  - `KanbanWriteCulture.ForDocument(ISimpleContentType contentType, string? culture)` → `string?`
  - `KanbanContentWriter` implementing the interface, registered singleton
  - `IKanbanContentLoader.GetById(int id)` → `IContent?`

- [ ] **Step 1: Write the failing registration test**

In `tests/Umbraco.Community.Kanban.Tests/Composing/KanbanBoardRegistrationTests.cs`, add one row to `BoardServices`, after the `IKanbanContentLoader` row:

```csharp
        { typeof(IKanbanContentWriter), typeof(KanbanContentWriter) },
```

- [ ] **Step 2: Run it to verify it fails**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj --filter FullyQualifiedName~KanbanBoardRegistrationTests`
Expected: compile error — `IKanbanContentWriter` does not exist.

- [ ] **Step 3: Write the interface**

Create `src/Umbraco.Community.Kanban/Services/IKanbanContentWriter.cs`:

```csharp
using Umbraco.Cms.Core.Models;

namespace Umbraco.Community.Kanban.Services;

/// <param name="Saved">False when the property was not there to write, or the save itself failed.</param>
/// <param name="Published">The document's published flag after the save, for the effective culture.</param>
/// <param name="Edited">The document's edited flag after the save, for the effective culture.</param>
/// <remarks>
/// The published/edited pair is returned rather than read back off the <see cref="IContent" /> by the
/// caller for one reason: the per-culture flags come from IContent internals that cannot be set on an
/// in-memory Content instance, so a caller computing state itself would be untestable. Returning the
/// pair keeps <see cref="KanbanCardStateResolver" /> the single place that decides what a state means.
/// </remarks>
public sealed record KanbanCardSaveResult(bool Saved, bool Published, bool Edited)
{
    /// <summary>Nothing was written — a missing lane property, or a save Umbraco refused.</summary>
    public static KanbanCardSaveResult NotSaved { get; } = new(false, false, false);
}

/// <summary>
/// The narrow slice of IContentService the card write path needs, so the card service is testable —
/// IContentService can be neither hand-faked nor constructed without persistence. The read-side
/// counterpart is <see cref="IKanbanContentLoader" />.
/// </summary>
public interface IKanbanContentWriter
{
    /// <summary>
    /// Sets one property and saves the document — <c>Save</c>, never a publish, because a dragged card
    /// must stay reversible until an editor publishes it deliberately.
    /// </summary>
    /// <remarks>
    /// Culture targeting follows the property's own variation, not the document's: an invariant property
    /// on a varying document still stores its value under no culture, and passing a culture there would
    /// write a value nothing ever reads back.
    /// </remarks>
    KanbanCardSaveResult SetLaneValue(IContent content, string laneProperty, string laneValue, string? culture);
}
```

- [ ] **Step 4: Write the failing culture-rule tests**

The writer itself cannot be unit-tested — it calls `IContentService.Save` — but the culture rule inside it is exactly the part that silently writes a value nothing reads back if it is wrong, so it comes out as a pure pair of functions and is tested directly.

Create `tests/Umbraco.Community.Kanban.Tests/Services/KanbanWriteCultureTests.cs`:

```csharp
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Services;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanWriteCultureTests
{
    private static readonly FakeShortStringHelper ShortStrings = new();

    private static PropertyType Property(ContentVariation variations) =>
        new(ShortStrings, "Umbraco.TextBox", ValueStorageType.Nvarchar, "status")
        {
            Name = "Status",
            Variations = variations,
        };

    private static ContentType Document(ContentVariation variations) =>
        new(ShortStrings, -1) { Alias = "task", Name = "Task", Variations = variations };

    [Fact]
    public void ForProperty_KeepsTheCultureForAVaryingProperty()
    {
        KanbanWriteCulture.ForProperty(Property(ContentVariation.Culture), "da-DK").Should().Be("da-DK");
    }

    [Fact]
    public void ForProperty_DropsTheCultureForAnInvariantProperty()
    {
        // The case that matters: an invariant property on a varying document still stores its value under
        // no culture, so passing the culture down would write where nothing reads back.
        KanbanWriteCulture.ForProperty(Property(ContentVariation.Nothing), "da-DK").Should().BeNull();
    }

    [Fact]
    public void ForProperty_IsNullWhenThereIsNoCultureToBeginWith()
    {
        KanbanWriteCulture.ForProperty(Property(ContentVariation.Culture), null).Should().BeNull();
    }

    [Fact]
    public void ForProperty_KeepsTheCultureForACultureAndSegmentProperty()
    {
        // Variations is a [Flags] enum, so a culture-and-segment property must match on the Culture flag
        // rather than on equality with ContentVariation.Culture.
        KanbanWriteCulture.ForProperty(Property(ContentVariation.CultureAndSegment), "da-DK")
            .Should().Be("da-DK");
    }

    [Fact]
    public void ForDocument_KeepsTheCultureForAVaryingDocument()
    {
        KanbanWriteCulture.ForDocument(new ContentTypeSimple(Document(ContentVariation.Culture)), "da-DK")
            .Should().Be("da-DK");
    }

    [Fact]
    public void ForDocument_DropsTheCultureForAnInvariantDocument()
    {
        KanbanWriteCulture.ForDocument(new ContentTypeSimple(Document(ContentVariation.Nothing)), "da-DK")
            .Should().BeNull();
    }
}
```

`ContentTypeSimple` is Umbraco's own `ISimpleContentType` implementation (namespace `Umbraco.Cms.Core.Models`), which is what `IContent.ContentType` is. If that constructor does not bind, take `ContentVariation` directly instead: change both `ForDocument` overloads' first parameter to `ContentVariation variations` and drop the wrapper from the tests — the **production signature is allowed to change here**, because the rule under test is about a variation flag and nothing else.

- [ ] **Step 5: Run them to verify they fail**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj --filter FullyQualifiedName~KanbanWriteCultureTests`
Expected: compile error — `KanbanWriteCulture` does not exist.

- [ ] **Step 6: Write the implementation**

Create `src/Umbraco.Community.Kanban/Services/KanbanContentWriter.cs`:

```csharp
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;
using Umbraco.Extensions;

namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// Which culture a write targets. Two separate questions with two separate answers, which is why they are
/// two functions: the culture a *value* is stored under follows the property's variation, while the
/// published/edited pair that describes the *card* follows the document's. Pure, so both rules are tested
/// without a database — the one part of the writer that can be.
/// </summary>
public static class KanbanWriteCulture
{
    /// <summary>
    /// The culture to store a value under: the requested culture where the property varies by culture,
    /// otherwise none. An invariant property on a varying document stores its value under no culture, so
    /// passing a culture there writes where nothing ever reads back.
    /// </summary>
    public static string? ForProperty(IPropertyType propertyType, string? culture) =>
        propertyType.Variations.HasFlag(ContentVariation.Culture) ? culture : null;

    /// <summary>
    /// The culture whose published/edited pair describes the card: the requested culture where the
    /// document varies by culture, otherwise none.
    /// </summary>
    public static string? ForDocument(ISimpleContentType contentType, string? culture) =>
        contentType.Variations.HasFlag(ContentVariation.Culture) ? culture : null;
}

/// <inheritdoc />
public sealed class KanbanContentWriter(IContentService contentService) : IKanbanContentWriter
{
    public KanbanCardSaveResult SetLaneValue(IContent content, string laneProperty, string laneValue, string? culture)
    {
        if (content.Properties.TryGetValue(laneProperty, out IProperty? property) == false)
        {
            return KanbanCardSaveResult.NotSaved;
        }

        content.SetValue(laneProperty, laneValue, KanbanWriteCulture.ForProperty(property.PropertyType, culture));

        // Save, never SaveAndPublish: the whole point of this milestone is that a drag is reversible
        // before it goes live.
        OperationResult result = contentService.Save(content);

        if (result.Success == false)
        {
            return KanbanCardSaveResult.NotSaved;
        }

        var documentCulture = KanbanWriteCulture.ForDocument(content.ContentType, culture);

        return documentCulture is null
            ? new KanbanCardSaveResult(true, content.Published, content.Edited)
            : new KanbanCardSaveResult(
                true,
                content.IsCulturePublished(documentCulture),
                content.IsCultureEdited(documentCulture));
    }
}
```

`OperationResult` lives in `Umbraco.Cms.Core.Services`, the same namespace as `IContentService`, so the two usings above cover it. `Umbraco.Extensions` is what brings `IsCulturePublished`/`IsCultureEdited` into scope — the same import `KanbanCardMapper` relies on.

- [ ] **Step 7: Run the culture tests to verify they pass**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj --filter FullyQualifiedName~KanbanWriteCultureTests`
Expected: PASS, 6 tests.

- [ ] **Step 8: Add `GetById(int)` to the loader**

The card write path resolves the card's parent to find the board configuration, and `IContent.ParentId` is an `int`.

In `src/Umbraco.Community.Kanban/Services/IKanbanContentLoader.cs`, inside the interface, after `IContent? GetById(Guid key);`:

```csharp
    /// <summary>
    /// A document by its integer id. Needed because a card resolves its own parent through
    /// <see cref="IContent.ParentId" />, which is an int — there is no GUID parent reference on IContent.
    /// </summary>
    IContent? GetById(int id);
```

In `src/Umbraco.Community.Kanban/Services/KanbanContentLoader.cs`, after the existing `GetById`:

```csharp
    public IContent? GetById(int id) => contentService.GetById(id);
```

In `tests/Umbraco.Community.Kanban.Tests/Fakes/FakeKanbanContentLoader.cs`, add the backing store and the method. Put the dictionary next to `Content` and the method next to the existing `GetById`:

```csharp
    /// <summary>Documents addressable by integer id — a card's parent, which IContent.ParentId names.</summary>
    public Dictionary<int, IContent> ContentById { get; } = [];
```

```csharp
    public IContent? GetById(int id) => ContentById.TryGetValue(id, out IContent? content) ? content : null;
```

- [ ] **Step 9: Register the writer**

In `src/Umbraco.Community.Kanban/Extensions/UmbracoBuilderExtensions.cs`, after the `IKanbanContentLoader` registration:

```csharp
        builder.Services.AddSingleton<IKanbanContentWriter, KanbanContentWriter>();
```

- [ ] **Step 10: Run the whole server suite**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj`
Expected: PASS — 6 new culture tests and one more registration case.

- [ ] **Step 11: Commit**

```bash
git add src/Umbraco.Community.Kanban tests/Umbraco.Community.Kanban.Tests
git commit -m "feat: add the narrow content writer for the lane property"
```

---

### Task 3: The card lane service

The whole server flow: load the card, resolve its parent's board configuration, refuse a disabled-drag board, require Update, write, and report the state that was actually persisted. The endpoint itself is Task 4.

**Files:**
- Create: `src/Umbraco.Community.Kanban/Services/IKanbanCardService.cs`
- Create: `src/Umbraco.Community.Kanban/Services/KanbanCardService.cs`
- Create: `tests/Umbraco.Community.Kanban.Tests/Fakes/FakeKanbanContentWriter.cs`
- Create: `tests/Umbraco.Community.Kanban.Tests/Services/KanbanCardServiceTests.cs`
- Modify: `src/Umbraco.Community.Kanban/Extensions/UmbracoBuilderExtensions.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Composing/KanbanBoardRegistrationTests.cs`

**Interfaces:**
- Consumes: `IKanbanContentWriter`, `KanbanCardSaveResult`, `IKanbanContentLoader.GetById(int)` (Task 2); `IKanbanBoardConfigurationResolver.ResolveAsync(Guid?, Guid?)`, `KanbanBoardConfigurationResult`, `KanbanBoardConfigurationStatus` (existing); `KanbanCardStateResolver.Resolve(bool, bool)` (existing).
- Produces:
  - `KanbanCardLaneStatus` — `Success`, `CardNotFound`, `ParentNotFound`, `AccessDenied`, `NotConfigured`, `ConfigurationNotFound`, `DragNotAllowed`, `SaveFailed`
  - `KanbanCardLaneRequest(Guid CardKey, string LaneValue, string? Culture)`
  - `KanbanCardLaneResult(KanbanCardLaneStatus Status, string? State)`
  - `IKanbanCardService.SetLaneAsync(KanbanCardLaneRequest request, IUser user)` → `Task<KanbanCardLaneResult>`
  - `KanbanCardService`, registered singleton
  - `FakeKanbanContentWriter` with `Writes`, `Result` and `Saved`

- [ ] **Step 1: Write the fake writer**

Create `tests/Umbraco.Community.Kanban.Tests/Fakes/FakeKanbanContentWriter.cs`:

```csharp
using Umbraco.Cms.Core.Models;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Fakes;

internal sealed class FakeKanbanContentWriter : IKanbanContentWriter
{
    /// <summary>Every write, so a test can assert the alias, value and culture that reached the writer.</summary>
    public List<(Guid Key, string LaneProperty, string LaneValue, string? Culture)> Writes { get; } = [];

    /// <summary>
    /// What the fake reports back. Set per test — the published/edited pair cannot be produced from an
    /// in-memory Content, which is exactly why the real writer returns it rather than the caller reading it.
    /// </summary>
    public KanbanCardSaveResult Result { get; set; } = new(true, false, false);

    public KanbanCardSaveResult SetLaneValue(IContent content, string laneProperty, string laneValue, string? culture)
    {
        Writes.Add((content.Key, laneProperty, laneValue, culture));

        // The real writer decides the property culture itself; the fake records what it was *given* so a
        // test asserts the service's own culture handling, not the writer's.
        return Result;
    }
}
```

- [ ] **Step 2: Write the failing service tests**

Create `tests/Umbraco.Community.Kanban.Tests/Services/KanbanCardServiceTests.cs`:

```csharp
using Umbraco.Cms.Core.Actions;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanCardServiceTests
{
    private static readonly FakeShortStringHelper ShortStrings = new();
    private static readonly Guid ParentKey = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid ListViewKey = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid BoardConfigKey = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private const int ParentId = 1234;

    private sealed record Harness(
        KanbanCardService Service,
        FakeKanbanContentLoader Loader,
        FakeKanbanContentWriter Writer,
        FakeContentPermissionAuthorizer Permissions,
        FakeKanbanDataTypeConfigurationLookup DataTypes,
        FakeKanbanConfigurationService Configurations,
        ContentType CardContentType);

    private static ContentType CardType(ContentVariation documentVariations, ContentVariation propertyVariations)
    {
        var contentType = new ContentType(ShortStrings, -1)
        {
            Alias = "task",
            Name = "Task",
            Key = Guid.Parse("44444444-4444-4444-4444-444444444444"),
            Variations = documentVariations,
        };

        contentType.AddPropertyType(new PropertyType(ShortStrings, "Umbraco.TextBox", ValueStorageType.Nvarchar, "status")
        {
            Name = "Status",
            Variations = propertyVariations,
        });

        return contentType;
    }

    /// <summary>
    /// A card under a parent whose list view names a drag-enabled board configuration keyed on "status".
    /// </summary>
    private static Harness Configured(
        KanbanBoardConfiguration? configuration = null,
        ContentVariation documentVariations = ContentVariation.Nothing,
        ContentVariation propertyVariations = ContentVariation.Nothing)
    {
        var parentContentType = new ContentType(ShortStrings, -1)
        {
            Alias = "taskFolder",
            Name = "Task Folder",
            Key = Guid.Parse("55555555-5555-5555-5555-555555555555"),
            ListView = ListViewKey,
        };
        var parent = new Content("Tasks", -1, parentContentType) { Id = ParentId, Key = ParentKey };

        ContentType cardContentType = CardType(documentVariations, propertyVariations);

        var loader = new FakeKanbanContentLoader();
        loader.Content[ParentKey] = parent;
        loader.ContentById[ParentId] = parent;

        var dataTypes = new FakeKanbanDataTypeConfigurationLookup();
        dataTypes.Values[(ListViewKey, Constants.BoardConfigIdKey)] = BoardConfigKey;

        var configurations = new FakeKanbanConfigurationService();
        configurations.BoardConfigurations[BoardConfigKey] = configuration ?? new KanbanBoardConfiguration
        {
            LaneProperty = "status",
            AllowDrag = true,
        };

        var writer = new FakeKanbanContentWriter();
        var permissions = new FakeContentPermissionAuthorizer();

        var service = new KanbanCardService(
            loader,
            writer,
            new KanbanBoardConfigurationResolver(dataTypes, configurations),
            permissions);

        return new Harness(service, loader, writer, permissions, dataTypes, configurations, cardContentType);
    }

    private static Content Card(Harness harness, Guid? key = null)
    {
        var card = new Content("Write the spec", ParentId, harness.CardContentType)
        {
            Id = 4321,
            Key = key ?? Guid.Parse("66666666-6666-6666-6666-666666666666"),
        };

        harness.Loader.Content[card.Key] = card;

        return card;
    }

    private static KanbanCardLaneRequest Request(Guid cardKey, string laneValue = "doing", string? culture = null) =>
        new(cardKey, laneValue, culture);

    private static IUser User => new FakeUser();

    [Fact]
    public async Task Reports_card_not_found_for_an_unknown_key()
    {
        Harness harness = Configured();

        KanbanCardLaneResult result = await harness.Service.SetLaneAsync(Request(Guid.NewGuid()), User);

        result.Status.Should().Be(KanbanCardLaneStatus.CardNotFound);
        harness.Writer.Writes.Should().BeEmpty();
    }

    [Fact]
    public async Task Reports_parent_not_found_when_the_card_has_no_loadable_parent()
    {
        // A card at the tree root, or one whose parent vanished between load and write: there is no
        // collection to read a board configuration from, so there is no board to authorise against.
        Harness harness = Configured();
        Content card = Card(harness);
        harness.Loader.ContentById.Clear();

        KanbanCardLaneResult result = await harness.Service.SetLaneAsync(Request(card.Key), User);

        result.Status.Should().Be(KanbanCardLaneStatus.ParentNotFound);
        harness.Writer.Writes.Should().BeEmpty();
    }

    [Fact]
    public async Task Reports_not_configured_when_the_parents_list_view_names_no_board()
    {
        Harness harness = Configured();
        Content card = Card(harness);
        harness.DataTypes.Values.Clear();

        (await harness.Service.SetLaneAsync(Request(card.Key), User)).Status
            .Should().Be(KanbanCardLaneStatus.NotConfigured);
    }

    [Fact]
    public async Task Reports_configuration_not_found_when_the_named_board_is_gone()
    {
        Harness harness = Configured();
        Content card = Card(harness);
        harness.Configurations.BoardConfigurations.Clear();

        (await harness.Service.SetLaneAsync(Request(card.Key), User)).Status
            .Should().Be(KanbanCardLaneStatus.ConfigurationNotFound);
    }

    [Fact]
    public async Task Refuses_the_write_when_the_board_disallows_dragging()
    {
        // A disabled-drag board must refuse this even called directly, not merely hide the UI for it.
        Harness harness = Configured(new KanbanBoardConfiguration { LaneProperty = "status", AllowDrag = false });
        Content card = Card(harness);

        KanbanCardLaneResult result = await harness.Service.SetLaneAsync(Request(card.Key), User);

        result.Status.Should().Be(KanbanCardLaneStatus.DragNotAllowed);
        harness.Writer.Writes.Should().BeEmpty();
    }

    [Fact]
    public async Task Refuses_the_write_when_the_configuration_names_no_lane_property()
    {
        Harness harness = Configured(new KanbanBoardConfiguration { LaneProperty = null, AllowDrag = true });
        Content card = Card(harness);

        KanbanCardLaneResult result = await harness.Service.SetLaneAsync(Request(card.Key), User);

        result.Status.Should().Be(KanbanCardLaneStatus.NotConfigured);
        harness.Writer.Writes.Should().BeEmpty();
    }

    [Fact]
    public async Task Refuses_the_write_without_update_permission_on_the_card()
    {
        Harness harness = Configured();
        Content card = Card(harness);
        harness.Permissions.Allowed[ActionUpdate.ActionLetter] = [];

        KanbanCardLaneResult result = await harness.Service.SetLaneAsync(Request(card.Key), User);

        result.Status.Should().Be(KanbanCardLaneStatus.AccessDenied);
        harness.Writer.Writes.Should().BeEmpty();
    }

    [Fact]
    public async Task Checks_update_permission_on_the_card_itself_not_the_parent()
    {
        Harness harness = Configured();
        Content card = Card(harness);
        harness.Permissions.Allowed[ActionUpdate.ActionLetter] = [ParentKey];

        (await harness.Service.SetLaneAsync(Request(card.Key), User)).Status
            .Should().Be(KanbanCardLaneStatus.AccessDenied);
    }

    [Fact]
    public async Task Writes_the_configured_lane_property_with_the_requested_value()
    {
        Harness harness = Configured();
        Content card = Card(harness);

        KanbanCardLaneResult result = await harness.Service.SetLaneAsync(Request(card.Key, "doing"), User);

        result.Status.Should().Be(KanbanCardLaneStatus.Success);
        harness.Writer.Writes.Single().Should().Be((card.Key, "status", "doing", (string?)null));
    }

    [Fact]
    public async Task Passes_the_culture_through_for_a_varying_document()
    {
        Harness harness = Configured(documentVariations: ContentVariation.Culture, propertyVariations: ContentVariation.Culture);
        Content card = Card(harness);

        await harness.Service.SetLaneAsync(Request(card.Key, "doing", "da-DK"), User);

        harness.Writer.Writes.Single().Culture.Should().Be("da-DK");
    }

    [Fact]
    public async Task Passes_the_culture_through_even_for_an_invariant_document_because_the_writer_decides()
    {
        // The property's own variation is the writer's business, not the service's — the service must not
        // second-guess it, or an invariant document with a varying property would lose its culture.
        Harness harness = Configured(documentVariations: ContentVariation.Nothing, propertyVariations: ContentVariation.Culture);
        Content card = Card(harness);

        await harness.Service.SetLaneAsync(Request(card.Key, "doing", "da-DK"), User);

        harness.Writer.Writes.Single().Culture.Should().Be("da-DK");
    }

    [Fact]
    public async Task Reports_the_state_the_save_actually_produced()
    {
        Harness harness = Configured();
        Content card = Card(harness);
        harness.Writer.Result = new KanbanCardSaveResult(true, Published: true, Edited: true);

        KanbanCardLaneResult result = await harness.Service.SetLaneAsync(Request(card.Key), User);

        result.State.Should().Be(KanbanCardStates.PublishedPendingChanges);
    }

    [Fact]
    public async Task Reports_a_draft_card_as_still_a_draft_after_the_save()
    {
        Harness harness = Configured();
        Content card = Card(harness);
        harness.Writer.Result = new KanbanCardSaveResult(true, Published: false, Edited: true);

        (await harness.Service.SetLaneAsync(Request(card.Key), User)).State
            .Should().Be(KanbanCardStates.Draft);
    }

    [Fact]
    public async Task Reports_save_failed_when_the_writer_could_not_write()
    {
        Harness harness = Configured();
        Content card = Card(harness);
        harness.Writer.Result = KanbanCardSaveResult.NotSaved;

        KanbanCardLaneResult result = await harness.Service.SetLaneAsync(Request(card.Key), User);

        result.Status.Should().Be(KanbanCardLaneStatus.SaveFailed);
        result.State.Should().BeNull();
    }

    [Fact]
    public async Task Writes_an_empty_lane_value_to_clear_the_lane()
    {
        // Dragging into the unassigned lane is the empty string, which is a real value to write, not an
        // absent one — this is the same distinction GET /board draws for its `lane` parameter.
        Harness harness = Configured();
        Content card = Card(harness);

        KanbanCardLaneResult result = await harness.Service.SetLaneAsync(Request(card.Key, string.Empty), User);

        result.Status.Should().Be(KanbanCardLaneStatus.Success);
        harness.Writer.Writes.Single().LaneValue.Should().BeEmpty();
    }
}
```

- [ ] **Step 3: Run them to verify they fail**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj --filter FullyQualifiedName~KanbanCardServiceTests`
Expected: compile error — `KanbanCardService`, `KanbanCardLaneRequest`, `KanbanCardLaneResult` and `KanbanCardLaneStatus` do not exist.

- [ ] **Step 4: Write the service contract**

Create `src/Umbraco.Community.Kanban/Services/IKanbanCardService.cs`:

```csharp
using Umbraco.Cms.Core.Models.Membership;

namespace Umbraco.Community.Kanban.Services;

public enum KanbanCardLaneStatus
{
    Success,

    /// <summary>No document with that key — deleted, or never existed.</summary>
    CardNotFound,

    /// <summary>The card's parent could not be loaded, so there is no collection to read a board from.</summary>
    ParentNotFound,

    /// <summary>The user may not update this card.</summary>
    AccessDenied,

    /// <summary>
    /// The parent's collection names no Kanban configuration, or the configuration names no lane
    /// property — either way there is nothing to write to.
    /// </summary>
    NotConfigured,

    /// <summary>A configuration was named, but it is missing or is not a Kanban Board.</summary>
    ConfigurationNotFound,

    /// <summary>The board's configuration has dragging switched off.</summary>
    DragNotAllowed,

    /// <summary>The lane property was not on the document, or Umbraco refused the save.</summary>
    SaveFailed,
}

/// <param name="LaneValue">
/// The lane's value. The empty string is a real value — it clears the lane property, which is how a card
/// lands in the unassigned lane — so it is deliberately distinguishable from absent.
/// </param>
/// <param name="Culture">The culture to write for, or null for invariant. Not "the site default".</param>
public sealed record KanbanCardLaneRequest(Guid CardKey, string LaneValue, string? Culture);

/// <param name="State">
/// One of <see cref="Models.Api.KanbanCardStates" />, as actually persisted — the client applies this in
/// place of its own optimistic guess. Null on any non-success status.
/// </param>
public sealed record KanbanCardLaneResult(KanbanCardLaneStatus Status, string? State);

public interface IKanbanCardService
{
    /// <summary>
    /// Moves a card to a lane by writing its board's lane property, save only.
    /// </summary>
    /// <remarks>
    /// Deliberately not routed through core's <c>PUT /document/{id}</c>: that takes a full values array
    /// through IContentEditingService — a whole-document replace, not a single-property patch — and a
    /// card only ever carries the configured summary properties, so reusing it would mean fetching the
    /// whole document and resending everything back.
    /// </remarks>
    Task<KanbanCardLaneResult> SetLaneAsync(KanbanCardLaneRequest request, IUser user);
}
```

- [ ] **Step 5: Write the service**

Create `src/Umbraco.Community.Kanban/Services/KanbanCardService.cs`:

```csharp
using Umbraco.Cms.Core.Actions;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Security.Authorization;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Services;

/// <inheritdoc />
public sealed class KanbanCardService(
    IKanbanContentLoader contentLoader,
    IKanbanContentWriter contentWriter,
    IKanbanBoardConfigurationResolver configurationResolver,
    IContentPermissionAuthorizer permissionAuthorizer) : IKanbanCardService
{
    private static readonly ISet<string> UpdatePermission = new HashSet<string> { ActionUpdate.ActionLetter };

    public async Task<KanbanCardLaneResult> SetLaneAsync(KanbanCardLaneRequest request, IUser user)
    {
        IContent? card = contentLoader.GetById(request.CardKey);

        if (card is null)
        {
            return Failure(KanbanCardLaneStatus.CardNotFound);
        }

        IContent? parent = contentLoader.GetById(card.ParentId);

        if (parent is null)
        {
            return Failure(KanbanCardLaneStatus.ParentNotFound);
        }

        // The same resolver GET /board uses, so a board and its writes can never disagree about which
        // configuration is in force.
        KanbanBoardConfigurationResult configuration = await configurationResolver.ResolveAsync(
            null,
            parent.ContentType.ListView);

        if (configuration.Status != KanbanBoardConfigurationStatus.Success || configuration.Configuration is null)
        {
            return Failure(ToLaneStatus(configuration.Status));
        }

        KanbanBoardConfiguration board = configuration.Configuration;

        if (board.AllowDrag == false)
        {
            return Failure(KanbanCardLaneStatus.DragNotAllowed);
        }

        if (string.IsNullOrWhiteSpace(board.LaneProperty))
        {
            return Failure(KanbanCardLaneStatus.NotConfigured);
        }

        // On the card itself, not the parent: this is the same permission CanUpdate on the card model
        // already reports, so a client respecting that flag never lands here — but the server does not
        // trust the client.
        if (await permissionAuthorizer.IsDeniedAsync(user, [card.Key], UpdatePermission))
        {
            return Failure(KanbanCardLaneStatus.AccessDenied);
        }

        KanbanCardSaveResult saved = contentWriter.SetLaneValue(
            card,
            board.LaneProperty,
            request.LaneValue,
            request.Culture);

        return saved.Saved
            ? new KanbanCardLaneResult(
                KanbanCardLaneStatus.Success,
                KanbanCardStateResolver.Resolve(saved.Published, saved.Edited))
            : Failure(KanbanCardLaneStatus.SaveFailed);
    }

    private static KanbanCardLaneResult Failure(KanbanCardLaneStatus status) => new(status, null);

    private static KanbanCardLaneStatus ToLaneStatus(KanbanBoardConfigurationStatus status) => status switch
    {
        KanbanBoardConfigurationStatus.ConfigurationNotFound => KanbanCardLaneStatus.ConfigurationNotFound,
        _ => KanbanCardLaneStatus.NotConfigured,
    };
}
```

- [ ] **Step 6: Register it**

In `src/Umbraco.Community.Kanban/Extensions/UmbracoBuilderExtensions.cs`, after the `IKanbanBoardService` registration:

```csharp
        builder.Services.AddSingleton<IKanbanCardService, KanbanCardService>();
```

And add the row to `tests/Umbraco.Community.Kanban.Tests/Composing/KanbanBoardRegistrationTests.cs`'s `BoardServices`, after the `IKanbanBoardService` row:

```csharp
        { typeof(IKanbanCardService), typeof(KanbanCardService) },
```

- [ ] **Step 7: Run the whole server suite**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj`
Expected: PASS — 15 new `KanbanCardServiceTests` cases plus one more registration case.

- [ ] **Step 8: Commit**

```bash
git add src/Umbraco.Community.Kanban tests/Umbraco.Community.Kanban.Tests
git commit -m "feat: add the card lane write service"
```

---

### Task 4: `PUT /card/{key}/lane`

The endpoint. A thin controller over Task 3, in the same shape as `BoardController`.

**Files:**
- Create: `src/Umbraco.Community.Kanban/Models/Api/KanbanCardLaneRequestModel.cs`
- Create: `src/Umbraco.Community.Kanban/Models/Api/KanbanCardLaneResponseModel.cs`
- Create: `src/Umbraco.Community.Kanban/Controllers/CardController.cs`
- Modify: `src/Umbraco.Community.Kanban/Client/src/constants.ts`
- Test: `src/Umbraco.Community.Kanban/Client/src/constants.test.ts`

**Interfaces:**
- Consumes: `IKanbanCardService`, `KanbanCardLaneRequest`, `KanbanCardLaneStatus` (Task 3).
- Produces:
  - `KanbanCardLaneRequestModel { string LaneValue; string? Culture }`
  - `KanbanCardLaneResponseModel { string State }`
  - `PUT /umbraco/kanban/api/v1/card/{key}/lane`
  - Client `KANBAN_CARD_LANE_ENDPOINT(key: string): string`

- [ ] **Step 1: Write the failing client constant test**

Append to `src/Umbraco.Community.Kanban/Client/src/constants.test.ts`, inside the existing top-level `describe` if there is one, otherwise as a new `describe` at the end of the file:

```ts
describe('KANBAN_CARD_LANE_ENDPOINT', () => {
  it('addresses one card’s lane under the versioned api path', () => {
    expect(KANBAN_CARD_LANE_ENDPOINT('abc-123')).toBe('/umbraco/kanban/api/v1/card/abc-123/lane');
  });

  it('encodes the key, so a key needing escaping cannot break the path', () => {
    expect(KANBAN_CARD_LANE_ENDPOINT('a/b')).toBe('/umbraco/kanban/api/v1/card/a%2Fb/lane');
  });
});
```

Add `KANBAN_CARD_LANE_ENDPOINT` to that file's existing import from `./constants.js`.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/constants.test.ts`
Expected: FAIL — `KANBAN_CARD_LANE_ENDPOINT` is not exported.

- [ ] **Step 3: Add the client constant**

In `src/Umbraco.Community.Kanban/Client/src/constants.ts`, after `KANBAN_LANES_PREVIEW_ENDPOINT`:

```ts
/**
 * One card's lane, for the drag write-back. A function rather than a template constant because the key
 * is a path segment: it is encoded here so no caller has to remember to.
 */
export const KANBAN_CARD_LANE_ENDPOINT = (key: string): string =>
  `${KANBAN_API_PATH}/card/${encodeURIComponent(key)}/lane`;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/constants.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the request and response models**

Create `src/Umbraco.Community.Kanban/Models/Api/KanbanCardLaneRequestModel.cs`:

```csharp
namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>The body of a <c>PUT /card/{key}/lane</c> request.</summary>
public sealed class KanbanCardLaneRequestModel
{
    /// <summary>
    /// The lane's value, written to the board's configured lane property. The empty string is a real
    /// value: it clears the property, which is how a card lands in the unassigned lane.
    /// </summary>
    public string LaneValue { get; init; } = string.Empty;

    /// <summary>The culture to write for. Omit for invariant.</summary>
    public string? Culture { get; init; }
}
```

Create `src/Umbraco.Community.Kanban/Models/Api/KanbanCardLaneResponseModel.cs`:

```csharp
namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>What a lane write actually persisted.</summary>
public sealed class KanbanCardLaneResponseModel
{
    /// <summary>
    /// One of <see cref="KanbanCardStates" />. Returned so the client can replace its optimistic badge
    /// with what the server really recorded, rather than trusting its own guess.
    /// </summary>
    public required string State { get; init; }
}
```

- [ ] **Step 6: Write the controller**

Create `src/Umbraco.Community.Kanban/Controllers/CardController.cs`:

```csharp
using Asp.Versioning;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Common.Builders;
using Umbraco.Cms.Core.Security;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Controllers;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = "Card")]
public sealed class CardController(
    IKanbanCardService cardService,
    IBackOfficeSecurityAccessor backOfficeSecurityAccessor) : KanbanControllerBase
{
    /// <summary>
    /// Moves a card to a lane, writing its board's lane property. Saves, never publishes — a drag stays
    /// reversible until an editor publishes it.
    /// </summary>
    [HttpPut("card/{key:guid}/lane")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(KanbanCardLaneResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetLane(Guid key, KanbanCardLaneRequestModel request)
    {
        KanbanCardLaneResult result = await cardService.SetLaneAsync(
            new KanbanCardLaneRequest(key, request.LaneValue, request.Culture),
            CurrentUser(backOfficeSecurityAccessor));

        return result.Status switch
        {
            KanbanCardLaneStatus.Success => Ok(new KanbanCardLaneResponseModel { State = result.State! }),
            KanbanCardLaneStatus.CardNotFound => NotFound(),
            KanbanCardLaneStatus.AccessDenied => Forbidden(),
            KanbanCardLaneStatus.DragNotAllowed => BadRequest(new ProblemDetailsBuilder()
                .WithTitle("Dragging is disabled")
                .WithDetail("This board's Kanban configuration does not allow cards to be moved between lanes.")
                .Build()),
            KanbanCardLaneStatus.ConfigurationNotFound => BadRequest(new ProblemDetailsBuilder()
                .WithTitle("Kanban configuration not found")
                .WithDetail("The Kanban configuration this collection points at no longer exists. Choose one on the Kanban tab of the collection's data type.")
                .Build()),
            KanbanCardLaneStatus.SaveFailed => BadRequest(new ProblemDetailsBuilder()
                .WithTitle("The card could not be saved")
                .WithDetail("The lane property is not on this document, or the save was refused.")
                .Build()),
            _ => BadRequest(new ProblemDetailsBuilder()
                .WithTitle("No Kanban configuration")
                .WithDetail($"This card's collection has no usable Kanban configuration. Set '{Constants.BoardConfigIdKey}' and a lane property on the Kanban tab of the collection's data type.")
                .Build()),
        };
    }
}
```

The `_` arm covers `NotConfigured` and `ParentNotFound`: both mean "there is no board here to move a card on", and both are the caller's problem to fix in configuration, so they read as the same 400.

- [ ] **Step 7: Build and run the whole server suite**

Run: `dotnet build && dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj`
Expected: builds clean, all tests pass.

- [ ] **Step 8: Verify the route by hand**

Nothing in the unit suite proves the route template or the versioned prefix. Build the package into the test site and confirm the endpoint appears in the Kanban Swagger document at `PUT /umbraco/kanban/api/v1/card/{key}/lane`, alongside `GET /board`. If it is missing, the cause is the route template on `[HttpPut]` or the `[ApiExplorerSettings]` group name — not the service.

Run: `dotnet build src/Umbraco.Community.Kanban/Umbraco.Community.Kanban.csproj`
Expected: builds clean.

- [ ] **Step 9: Commit**

```bash
git add src/Umbraco.Community.Kanban
git commit -m "feat: add PUT /card/{key}/lane"
```

---

### Task 5: Client wire types and the `setLane` data source method

The client mirror of Tasks 1 and 4. No visible change yet.

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/data/kanban-board.types.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/data/kanban-data-source.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/data/kanban-server-data-source.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/data/kanban-data-source.test.ts`

**Interfaces:**
- Consumes: `KANBAN_CARD_LANE_ENDPOINT` (Task 4); the server's `allowDrag` and `KanbanCardLaneResponseModel` (Tasks 1 and 4).
- Produces:
  - `KanbanBoardModel.allowDrag` (`boolean`)
  - `KanbanCardModel.saving?` (`boolean`) — client-only
  - `KanbanCardLaneCommand { cardKey: string; laneValue: string; culture?: string | null }`
  - `buildLaneBody(command: KanbanCardLaneCommand): { laneValue: string; culture?: string }`
  - `KanbanSetLaneOutcome = { kind: 'success'; state: KanbanCardState } | { kind: 'error'; status?: number }`
  - `KanbanDataSource.setLane(command: KanbanCardLaneCommand): Promise<KanbanSetLaneOutcome>`
  - `KanbanServerDataSource.setLane` implementing it

- [ ] **Step 1: Write the failing body-builder tests**

Append to `src/Umbraco.Community.Kanban/Client/src/data/kanban-data-source.test.ts`:

```ts
describe('buildLaneBody', () => {
  it('always sends the lane value', () => {
    expect(buildLaneBody({ cardKey: 'c1', laneValue: 'doing' })).toEqual({ laneValue: 'doing' });
  });

  it('keeps an empty lane value, which clears the lane property', () => {
    // Dragging into the unassigned lane writes the empty string; dropping it would leave the card put.
    expect(buildLaneBody({ cardKey: 'c1', laneValue: '' })).toEqual({ laneValue: '' });
  });

  it('sends a culture when there is one', () => {
    expect(buildLaneBody({ cardKey: 'c1', laneValue: 'doing', culture: 'da-DK' })).toEqual({
      laneValue: 'doing',
      culture: 'da-DK',
    });
  });

  it('omits a null culture rather than sending null', () => {
    expect('culture' in buildLaneBody({ cardKey: 'c1', laneValue: 'doing', culture: null })).toBe(false);
  });

  it('omits an empty culture rather than asking for the empty culture', () => {
    // Matches buildBoardQuery: an empty culture means "no culture", not "the culture named ''".
    expect('culture' in buildLaneBody({ cardKey: 'c1', laneValue: 'doing', culture: '' })).toBe(false);
  });

  it('never sends the card key in the body, because it is a path segment', () => {
    expect('cardKey' in buildLaneBody({ cardKey: 'c1', laneValue: 'doing' })).toBe(false);
  });
});
```

Add `buildLaneBody` to that file's existing import from `./kanban-data-source.js`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/data/kanban-data-source.test.ts`
Expected: FAIL — `buildLaneBody` is not exported.

- [ ] **Step 3: Add the wire types**

In `src/Umbraco.Community.Kanban/Client/src/data/kanban-board.types.ts`, inside `KanbanCardModel`, after `canUpdate`:

```ts
  /**
   * Client-only, never sent by the server: true while a lane write for this card is in flight. Lives on
   * the card rather than in a separate set on the board so the lane can pass it straight down, the same
   * way every other per-card value already reaches the card element.
   */
  saving?: boolean;
```

and change the `canUpdate` comment, which is now out of date:

```ts
  /** Whether the current user may update this card; with the board's allowDrag, gates dragging. */
  canUpdate: boolean;
```

Then inside `KanbanBoardModel`, after `showChildItems`:

```ts
  /** Whether this board's configuration permits dragging cards between lanes. Board-wide. */
  allowDrag: boolean;
```

- [ ] **Step 4: Add the command, the body builder and the interface method**

In `src/Umbraco.Community.Kanban/Client/src/data/kanban-data-source.ts`, add after `KanbanBoardOutcome` and extend the interface. Note the `KanbanCardState` import has to be added to the existing type-only import at the top of the file:

```ts
import type { KanbanBoardModel, KanbanCardState } from './kanban-board.types.js';
```

```ts
/** A request to move one card to one lane. */
export interface KanbanCardLaneCommand {
  cardKey: string;
  /** The empty string clears the lane property, putting the card in the unassigned lane. */
  laneValue: string;
  culture?: string | null;
}

/**
 * Why the status is carried on failure: the board distinguishes 403 (permission changed mid-session) and
 * 404 (card deleted concurrently) in the message it shows, and nothing else can tell them apart once the
 * response has been discarded.
 */
export type KanbanSetLaneOutcome =
  | { kind: 'success'; state: KanbanCardState }
  | { kind: 'error'; status?: number };

export interface KanbanDataSource {
  getBoard(query: KanbanBoardQuery): Promise<KanbanBoardOutcome>;
  setLane(command: KanbanCardLaneCommand): Promise<KanbanSetLaneOutcome>;
}
```

and the builder, at the end of the file:

```ts
/**
 * Builds the body for PUT /card/{key}/lane. Pure and tested for the same reason buildBoardQuery is: the
 * empty-string cases are load-bearing in opposite directions — an empty lane value must survive, because
 * it clears the property, while an empty culture must not be sent at all.
 */
export function buildLaneBody(command: KanbanCardLaneCommand): { laneValue: string; culture?: string } {
  const body: { laneValue: string; culture?: string } = { laneValue: command.laneValue };

  if (command.culture) body.culture = command.culture;

  return body;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/data/kanban-data-source.test.ts`
Expected: PASS.

- [ ] **Step 6: Implement `setLane` on the server data source**

In `src/Umbraco.Community.Kanban/Client/src/data/kanban-server-data-source.ts`, extend the imports and add the method:

```ts
import { KANBAN_BOARD_ENDPOINT, KANBAN_CARD_LANE_ENDPOINT } from '@/constants.js';
import {
  buildBoardQuery,
  buildLaneBody,
  type KanbanBoardOutcome,
  type KanbanBoardQuery,
  type KanbanCardLaneCommand,
  type KanbanDataSource,
  type KanbanSetLaneOutcome,
} from './kanban-data-source.js';
import type { KanbanBoardModel, KanbanCardState } from './kanban-board.types.js';
```

```ts
  async setLane(command: KanbanCardLaneCommand): Promise<KanbanSetLaneOutcome> {
    const { data, error } = await tryExecute(
      this.#host,
      umbHttpClient.put<{ state: KanbanCardState }>({
        url: KANBAN_CARD_LANE_ENDPOINT(command.cardKey),
        body: buildLaneBody(command),
        security: [{ type: 'http', scheme: 'bearer' }],
      }),
      // The board shows its own targeted message and snaps the card back, so a generic toast on top of
      // that would be two notifications for one failure.
      { disableNotifications: true },
    );

    if (error) {
      return { kind: 'error', status: (error as { status?: number }).status };
    }

    return data ? { kind: 'success', state: data.state } : { kind: 'error' };
  }
```

- [ ] **Step 7: Type-check, build and run every client test**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: `tsc --noEmit` fails on `board.model.test.ts`'s `board()` helper, which does not set the now-required `allowDrag`. Fix it there — in `src/core/board.model.test.ts`, add `allowDrag: false,` to the `board` helper's object literal, beside `showChildItems: false`. Then re-run; expected: build succeeds, all tests pass.

`umbHttpClient` is a `@hey-api/openapi-ts` generated client, so `put` takes the same option bag `get` does — `url`, `body`, `query`, `headers`, `security` — and only `url`, `body` and `security` are used here.

- [ ] **Step 8: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src
git commit -m "feat: add allowDrag and the setLane request to the client data source"
```

---

### Task 6: The pure board reducers

`moveCard`, `nextStateAfterSave`, `applyCardState`, `setCardSaving` and `pendingCards` — everything the drag and the publish action do to board state, with no DOM anywhere near it.

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/board.model.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/board.model.test.ts`

**Interfaces:**
- Consumes: `KanbanBoardState`, `toBoardState`, `KanbanCardModel`, `KanbanCardState` (existing); `KanbanBoardModel.allowDrag` (Task 5).
- Produces:
  - `KanbanBoardState.allowDrag` (`boolean`)
  - `moveCard(state: KanbanBoardState, cardKey: string, fromLane: string, toLane: string): KanbanBoardState`
  - `nextStateAfterSave(state: KanbanCardState): KanbanCardState`
  - `applyCardState(state: KanbanBoardState, cardKey: string, cardState: KanbanCardState): KanbanBoardState`
  - `setCardSaving(state: KanbanBoardState, cardKey: string, saving: boolean): KanbanBoardState`
  - `pendingCards(state: KanbanBoardState): KanbanCardModel[]`

- [ ] **Step 1: Write the failing tests**

Append to `src/Umbraco.Community.Kanban/Client/src/core/board.model.test.ts`. Add the five new names to the existing import from `./board.model.js`, and add `KanbanCardState` to the type-only import from `../data/kanban-board.types.js`.

The existing `card` helper takes only a key; these tests need a state and a saving flag too, so replace the helper at the top of the file with an overload-friendly version — every existing call `card('a')` keeps working:

```ts
const card = (key: string, overrides: Partial<KanbanCardModel> = {}): KanbanCardModel => ({
  key,
  name: key,
  contentTypeAlias: 'task',
  contentTypeKey: '00000000-0000-0000-0000-000000000001',
  state: 'draft',
  canUpdate: false,
  canCreate: false,
  children: [],
  childTotal: 0,
  childTotalIsExact: true,
  properties: [],
  ...overrides,
});
```

The `lane` helper calls `cards.map(card)`, which passes `(value, index, array)` — with the new second parameter that would spread an index as overrides. Change that one line in the `lane` helper to:

```ts
  cards: cards.map((key) => card(key)),
```

Then append:

```ts
describe('moveCard', () => {
  const initial = () => toBoardState(board([lane('todo', ['a', 'b']), lane('doing', ['x']), lane('', [])]));

  it('removes the card from its source lane and appends it to the target', () => {
    const next = moveCard(initial(), 'a', 'todo', 'doing');

    expect(next.lanes[0].cards.map((c) => c.key)).toEqual(['b']);
    expect(next.lanes[1].cards.map((c) => c.key)).toEqual(['x', 'a']);
  });

  it('moves the totals with the card', () => {
    const next = moveCard(initial(), 'a', 'todo', 'doing');

    expect(next.lanes[0].total).toBe(1);
    expect(next.lanes[1].total).toBe(2);
  });

  it('is its own inverse, which is what the snap-back on a failed write relies on', () => {
    const state = initial();

    const reverted = moveCard(moveCard(state, 'a', 'todo', 'doing'), 'a', 'doing', 'todo');

    expect(reverted.lanes[0].cards.map((c) => c.key)).toEqual(['b', 'a']);
    expect(reverted.lanes[0].total).toBe(2);
    expect(reverted.lanes[1].cards.map((c) => c.key)).toEqual(['x']);
    expect(reverted.lanes[1].total).toBe(1);
  });

  it('moves into the unassigned lane, addressed by the empty string', () => {
    const next = moveCard(initial(), 'a', 'todo', '');

    expect(next.lanes[2].cards.map((c) => c.key)).toEqual(['a']);
  });

  it('matches lanes case-insensitively, as every other lane lookup does', () => {
    const next = moveCard(initial(), 'a', 'ToDo', 'DOING');

    expect(next.lanes[1].cards.map((c) => c.key)).toEqual(['x', 'a']);
  });

  it('changes nothing when the source and target are the same lane', () => {
    const next = moveCard(initial(), 'a', 'todo', 'todo');

    expect(next.lanes[0].cards.map((c) => c.key)).toEqual(['a', 'b']);
    expect(next.lanes[0].total).toBe(2);
  });

  it('changes nothing when the card is not in the source lane', () => {
    const next = moveCard(initial(), 'x', 'todo', 'doing');

    expect(next.lanes[0].cards.map((c) => c.key)).toEqual(['a', 'b']);
    expect(next.lanes[1].cards.map((c) => c.key)).toEqual(['x']);
  });

  it('changes nothing when the target lane does not exist', () => {
    const next = moveCard(initial(), 'a', 'todo', 'archived');

    expect(next.lanes[0].cards.map((c) => c.key)).toEqual(['a', 'b']);
  });

  it('does not mutate the state it was given', () => {
    const state = initial();

    moveCard(state, 'a', 'todo', 'doing');

    expect(state.lanes[0].cards.map((c) => c.key)).toEqual(['a', 'b']);
    expect(state.lanes[1].cards.map((c) => c.key)).toEqual(['x']);
  });
});

describe('nextStateAfterSave', () => {
  it('turns a published card pending, because a save leaves the live version behind', () => {
    expect(nextStateAfterSave('published')).toBe('publishedPendingChanges');
  });

  it('leaves an already-pending card pending', () => {
    expect(nextStateAfterSave('publishedPendingChanges')).toBe('publishedPendingChanges');
  });

  it('leaves a draft a draft, since there is no published version to diverge from', () => {
    expect(nextStateAfterSave('draft')).toBe('draft');
  });
});

describe('applyCardState', () => {
  const initial = () =>
    toBoardState(board([lane('todo', ['a', 'b']), lane('doing', ['x'])]));

  it('replaces one card’s state wherever it sits', () => {
    const next = applyCardState(initial(), 'x', 'published');

    expect(next.lanes[1].cards[0].state).toBe('published');
  });

  it('leaves every other card alone', () => {
    const next = applyCardState(initial(), 'a', 'published');

    expect(next.lanes[0].cards[1].state).toBe('draft');
  });

  it('changes nothing for a card it does not hold', () => {
    const next = applyCardState(initial(), 'nope', 'published');

    expect(next.lanes.flatMap((l) => l.cards).map((c) => c.state)).toEqual(['draft', 'draft', 'draft']);
  });

  it('does not mutate the state it was given', () => {
    const state = initial();

    applyCardState(state, 'a', 'published');

    expect(state.lanes[0].cards[0].state).toBe('draft');
  });
});

describe('setCardSaving', () => {
  const initial = () => toBoardState(board([lane('todo', ['a', 'b'])]));

  it('marks one card as saving', () => {
    const next = setCardSaving(initial(), 'a', true);

    expect(next.lanes[0].cards[0].saving).toBe(true);
    expect(next.lanes[0].cards[1].saving).toBeUndefined();
  });

  it('clears the flag again once the write resolves', () => {
    const next = setCardSaving(setCardSaving(initial(), 'a', true), 'a', false);

    expect(next.lanes[0].cards[0].saving).toBe(false);
  });

  it('does not mutate the state it was given', () => {
    const state = initial();

    setCardSaving(state, 'a', true);

    expect(state.lanes[0].cards[0].saving).toBeUndefined();
  });
});

describe('pendingCards', () => {
  it('collects every card with unpublished changes, across lanes', () => {
    const state = toBoardState(
      board([
        lane('todo', [], { cards: [card('a', { state: 'publishedPendingChanges' }), card('b')] }),
        lane('doing', [], { cards: [card('c', { state: 'publishedPendingChanges' })] }),
      ]),
    );

    expect(pendingCards(state).map((c) => c.key)).toEqual(['a', 'c']);
  });

  it('excludes published and draft cards', () => {
    const state = toBoardState(
      board([lane('todo', [], { cards: [card('a', { state: 'published' }), card('b', { state: 'draft' })] })]),
    );

    expect(pendingCards(state)).toEqual([]);
  });

  it('is empty for a board with no lanes at all', () => {
    expect(pendingCards(toBoardState(board([])))).toEqual([]);
  });

  it('is scoped to the cards the board is holding, never to cards it has not paged in', () => {
    // A deliberate scope line, matching core's own bulk action being scoped to its selection: a lane with
    // 40 pending cards but only 25 loaded contributes 25.
    const state = toBoardState(
      board([
        lane('todo', [], {
          cards: [card('a', { state: 'publishedPendingChanges' })],
          total: 40,
          totalIsExact: true,
        }),
      ]),
    );

    expect(pendingCards(state)).toHaveLength(1);
  });
});
```

Also extend the existing `toBoardState` describe with the new flag:

```ts
  it('carries the allow drag flag across', () => {
    expect(toBoardState(board([], { allowDrag: true })).allowDrag).toBe(true);
  });
```

and the existing `mergeLanePage` describe, because `mergeLanePage` rebuilds the state object and would otherwise silently drop it:

```ts
  it('keeps the allow drag flag when a lane page is merged in', () => {
    const state = toBoardState(board([lane('todo', ['a'], { total: 3 })], { allowDrag: true }));

    const next = mergeLanePage(state, board([lane('todo', ['b'], { total: 3, skip: 1 })], { allowDrag: true }));

    expect(next.allowDrag).toBe(true);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/core/board.model.test.ts`
Expected: FAIL — `moveCard`, `nextStateAfterSave`, `applyCardState`, `setCardSaving` and `pendingCards` are not exported, and `KanbanBoardState.allowDrag` does not exist.

- [ ] **Step 3: Add `allowDrag` to the board state**

In `src/Umbraco.Community.Kanban/Client/src/core/board.model.ts`, extend the interface and both constructors:

```ts
/** What the board element holds between requests. */
export interface KanbanBoardState {
  lanes: KanbanBoardLaneModel[];
  truncated: boolean;
  childCount: number;
  showChildItems: boolean;
  allowDrag: boolean;
}
```

In `toBoardState`, after `showChildItems`:

```ts
    allowDrag: board.allowDrag,
```

In `mergeLanePage`'s returned object, after `showChildItems`:

```ts
    allowDrag: page.allowDrag,
```

- [ ] **Step 4: Write the reducers**

Append to `src/Umbraco.Community.Kanban/Client/src/core/board.model.ts`, above the existing private `sameLane`, and extend the type-only import at the top of the file to bring in the card types:

```ts
import type {
  KanbanBoardLaneModel,
  KanbanBoardModel,
  KanbanCardModel,
  KanbanCardState,
} from '../data/kanban-board.types.js';
```

```ts
/**
 * Relocates a card from one lane to another, moving the lane totals with it. Pure; never mutates its
 * input.
 *
 * The revert on a failed write is this same function with the lanes swapped back — there is deliberately
 * no separate undo, because an undo that is not literally the inverse move is an undo that can drift.
 * A move whose card, source lane or target lane cannot be found is a no-op rather than an error: the
 * board hit-tests against what it is rendering, so a mismatch means the board reloaded mid-gesture and
 * the safe answer is to leave the fresh state alone.
 */
export function moveCard(
  state: KanbanBoardState,
  cardKey: string,
  fromLane: string,
  toLane: string,
): KanbanBoardState {
  if (sameLane(fromLane, toLane)) return state;

  const source = state.lanes.find((lane) => sameLane(lane.value, fromLane));
  const target = state.lanes.find((lane) => sameLane(lane.value, toLane));

  if (!source || !target) return state;

  const moving = source.cards.find((card) => card.key === cardKey);

  if (!moving) return state;

  return {
    ...state,
    lanes: state.lanes.map((lane) => {
      if (lane === source) {
        return { ...lane, cards: lane.cards.filter((card) => card.key !== cardKey), total: lane.total - 1 };
      }

      if (lane === target) {
        return { ...lane, cards: [...lane.cards, moving], total: lane.total + 1 };
      }

      return lane;
    }),
  };
}

/**
 * The state a card takes on immediately after a save. A published card gains unpublished changes; a draft
 * has no published version to diverge from, so nothing changes.
 *
 * This is the optimistic guess only — it is superseded by whatever the server reports the save actually
 * persisted, which is why nothing else in the client derives a state this way.
 */
export function nextStateAfterSave(state: KanbanCardState): KanbanCardState {
  return state === 'published' ? 'publishedPendingChanges' : state;
}

/** Replaces one card's publish state, wherever the card sits. Pure. */
export function applyCardState(
  state: KanbanBoardState,
  cardKey: string,
  cardState: KanbanCardState,
): KanbanBoardState {
  return mapCard(state, cardKey, (card) => ({ ...card, state: cardState }));
}

/**
 * Flags a card as having a write in flight. Drives the dimmed treatment and stops a second drag starting
 * before the first resolves.
 */
export function setCardSaving(state: KanbanBoardState, cardKey: string, saving: boolean): KanbanBoardState {
  return mapCard(state, cardKey, (card) => ({ ...card, saving }));
}

/**
 * Every loaded card with unpublished changes, in lane order.
 *
 * Deliberately scoped to what the board is holding in memory — the same scope core's own document bulk
 * publish action has, which acts on `this.selection` and never queries for items that were never
 * selected. A card in an unpaged lane page, or beyond the board's truncation cap, does not appear here
 * until it is paged in. That makes "Publish pending changes" convenience-scoped to what is on screen
 * rather than exhaustive, which is the backoffice's own convention.
 */
export function pendingCards(state: KanbanBoardState): KanbanCardModel[] {
  return state.lanes.flatMap((lane) => lane.cards.filter((card) => card.state === 'publishedPendingChanges'));
}

function mapCard(
  state: KanbanBoardState,
  cardKey: string,
  transform: (card: KanbanCardModel) => KanbanCardModel,
): KanbanBoardState {
  return {
    ...state,
    lanes: state.lanes.map((lane) =>
      lane.cards.some((card) => card.key === cardKey)
        ? { ...lane, cards: lane.cards.map((card) => (card.key === cardKey ? transform(card) : card)) }
        : lane,
    ),
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/core/board.model.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check, build and run every client test**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: build succeeds, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src
git commit -m "feat: add the pure board reducers for moving cards and finding pending ones"
```

---

### Task 7: The pure drag helpers

The gating decision, the hit-test, and the two message formatters — everything about the gesture that can be decided without a DOM, so the element wiring in Tasks 8–11 stays thin. Mirrors `pan.model.ts` exactly, including why it takes plain numbers rather than events.

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/core/drag.model.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/core/drag.model.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `shouldStartCardDrag(input: { allowDrag: boolean; canUpdate: boolean; saving: boolean; pointerType: string; button: number; isPrimary: boolean }): boolean`
  - `KanbanLaneHitTarget { value: string; acceptsDrops: boolean; rect: { left: number; top: number; right: number; bottom: number } }`
  - `laneAtPoint(x: number, y: number, lanes: readonly KanbanLaneHitTarget[]): KanbanLaneHitTarget | undefined`
  - `moveFailureMessage(cardName: string, status: number | undefined): string`
  - `formatPublishSummary(succeeded: number, total: number): string`

- [ ] **Step 1: Write the failing tests**

Create `src/Umbraco.Community.Kanban/Client/src/core/drag.model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  formatPublishSummary,
  laneAtPoint,
  moveFailureMessage,
  shouldStartCardDrag,
  type KanbanLaneHitTarget,
} from './drag.model.js';

describe('shouldStartCardDrag', () => {
  const draggable = {
    allowDrag: true,
    canUpdate: true,
    saving: false,
    pointerType: 'mouse',
    button: 0,
    isPrimary: true,
  };

  it('allows a primary mouse press on an updatable card of a drag-enabled board', () => {
    expect(shouldStartCardDrag(draggable)).toBe(true);
  });

  it('refuses when the board’s configuration disables dragging', () => {
    expect(shouldStartCardDrag({ ...draggable, allowDrag: false })).toBe(false);
  });

  it('refuses when the user cannot update this card', () => {
    // Both halves are required: only the server knows the configuration AND the per-card permission.
    expect(shouldStartCardDrag({ ...draggable, canUpdate: false })).toBe(false);
  });

  it('refuses while a write for this card is still in flight', () => {
    expect(shouldStartCardDrag({ ...draggable, saving: true })).toBe(false);
  });

  it('refuses touch, which scrolls the board instead', () => {
    expect(shouldStartCardDrag({ ...draggable, pointerType: 'touch' })).toBe(false);
  });

  it('refuses a non-primary mouse button (right-click)', () => {
    // Right and middle click share the mouse's single pointerId, so pointerId cannot distinguish them.
    expect(shouldStartCardDrag({ ...draggable, button: 2 })).toBe(false);
  });

  it('refuses a pointer that is not the primary pointer of its type', () => {
    expect(shouldStartCardDrag({ ...draggable, isPrimary: false })).toBe(false);
  });
});

describe('laneAtPoint', () => {
  const at = (value: string, left: number, right: number, acceptsDrops = true): KanbanLaneHitTarget => ({
    value,
    acceptsDrops,
    rect: { left, top: 0, right, bottom: 100 },
  });

  const lanes = [at('todo', 0, 100), at('doing', 100, 200), at('', 200, 300, false)];

  it('finds the lane the point falls inside', () => {
    expect(laneAtPoint(150, 50, lanes)?.value).toBe('doing');
  });

  it('reports whether that lane would take the card', () => {
    expect(laneAtPoint(250, 50, lanes)?.acceptsDrops).toBe(false);
  });

  it('is nothing when the point is beyond every lane horizontally', () => {
    expect(laneAtPoint(400, 50, lanes)).toBeUndefined();
  });

  it('is nothing when the point is above or below the lanes', () => {
    expect(laneAtPoint(150, -5, lanes)).toBeUndefined();
    expect(laneAtPoint(150, 105, lanes)).toBeUndefined();
  });

  it('includes the leading edges and excludes the trailing ones, so touching lanes never both match', () => {
    // Lane rects abut exactly; a half-open range is what keeps "only ever one lane highlighted" true.
    expect(laneAtPoint(100, 50, lanes)?.value).toBe('doing');
    expect(laneAtPoint(99.9, 50, lanes)?.value).toBe('todo');
  });

  it('is nothing when there are no lanes', () => {
    expect(laneAtPoint(50, 50, [])).toBeUndefined();
  });
});

describe('moveFailureMessage', () => {
  it('says the permission is gone on a 403', () => {
    expect(moveFailureMessage('Write the spec', 403)).toBe(
      'Couldn’t move ‘Write the spec’ — you no longer have permission to change it.',
    );
  });

  it('says the card is gone on a 404', () => {
    expect(moveFailureMessage('Write the spec', 404)).toBe(
      'Couldn’t move ‘Write the spec’ — it no longer exists.',
    );
  });

  it('falls back to a generic reason for anything else', () => {
    expect(moveFailureMessage('Write the spec', 500)).toBe(
      'Couldn’t move ‘Write the spec’ — the change could not be saved.',
    );
  });

  it('falls back to a generic reason when there is no status at all', () => {
    expect(moveFailureMessage('Write the spec', undefined)).toBe(
      'Couldn’t move ‘Write the spec’ — the change could not be saved.',
    );
  });
});

describe('formatPublishSummary', () => {
  it('reports a clean run as a plain count', () => {
    expect(formatPublishSummary(8, 8)).toBe('Published 8 cards.');
  });

  it('uses the singular for one card', () => {
    expect(formatPublishSummary(1, 1)).toBe('Published 1 card.');
  });

  it('reports a partial run in one line rather than one toast per card', () => {
    expect(formatPublishSummary(6, 8)).toBe('Published 6 of 8 — 2 failed.');
  });

  it('reports a total failure the same way', () => {
    expect(formatPublishSummary(0, 3)).toBe('Published 0 of 3 — 3 failed.');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/core/drag.model.test.ts`
Expected: FAIL — cannot resolve `./drag.model.js`.

- [ ] **Step 3: Write the module**

Create `src/Umbraco.Community.Kanban/Client/src/core/drag.model.ts`:

```ts
/**
 * Whether a pointerdown on a card should start a drag.
 *
 * Takes plain values rather than a PointerEvent for the same reason `shouldStartPan` does: the decision
 * is then testable in the Node test environment, where there is no PointerEvent at all.
 *
 * Both `allowDrag` (the board's configuration) and `canUpdate` (this user, this card) are required, and
 * both come from the server — only the server knows either one, so no host attribute can supply them.
 * Touch is excluded because the board already scrolls horizontally on a touch swipe, with native
 * momentum; hijacking that to drag a card would cost more than it buys.
 */
export function shouldStartCardDrag(input: {
  allowDrag: boolean;
  canUpdate: boolean;
  saving: boolean;
  pointerType: string;
  button: number;
  isPrimary: boolean;
}): boolean {
  if (!input.allowDrag || !input.canUpdate) return false;
  if (input.saving) return false;
  if (input.pointerType === 'touch') return false;
  if (input.button !== 0 || !input.isPrimary) return false;
  return true;
}

/** One lane as the hit-test sees it: its identity, whether it would take a card, and where it is. */
export interface KanbanLaneHitTarget {
  value: string;
  acceptsDrops: boolean;
  rect: { left: number; top: number; right: number; bottom: number };
}

/**
 * The lane under a viewport point, or nothing.
 *
 * Ranges are half-open — `left <= x < right`, `top <= y < bottom` — because lane rects abut exactly, and
 * an inclusive upper bound would match two lanes at once on the shared edge. Only ever one lane
 * highlighted at a time is a property of the drag, not a coincidence of the geometry.
 */
export function laneAtPoint(
  x: number,
  y: number,
  lanes: readonly KanbanLaneHitTarget[],
): KanbanLaneHitTarget | undefined {
  return lanes.find(
    (lane) =>
      x >= lane.rect.left && x < lane.rect.right && y >= lane.rect.top && y < lane.rect.bottom,
  );
}

/**
 * Why a card could not be moved. 403 and 404 get their own wording because they are the two failures an
 * editor can act on — a permission changed under them, or someone else deleted the card — and "the
 * change could not be saved" would send them looking in the wrong place for both.
 */
export function moveFailureMessage(cardName: string, status: number | undefined): string {
  const reason =
    status === 403
      ? 'you no longer have permission to change it'
      : status === 404
        ? 'it no longer exists'
        : 'the change could not be saved';

  return `Couldn’t move ‘${cardName}’ — ${reason}.`;
}

/**
 * One summary line for a publish run, rather than one toast per card — publishing twenty cards must not
 * mean twenty notifications. Mirrors how core's own bulk publish reports a single count.
 */
export function formatPublishSummary(succeeded: number, total: number): string {
  if (succeeded === total) {
    return `Published ${succeeded} ${succeeded === 1 ? 'card' : 'cards'}.`;
  }

  return `Published ${succeeded} of ${total} — ${total - succeeded} failed.`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/core/drag.model.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check, build and run every client test**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: build succeeds, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core/drag.model.ts src/Umbraco.Community.Kanban/Client/src/core/drag.model.test.ts
git commit -m "feat: add the pure drag gating, hit-test and message helpers"
```

---

### Task 8: The card raises drag events

The card owns the pointer capture and reports the gesture; it decides nothing about where the card lands. Only the board can see every lane at once, so only the board hit-tests.

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts`

**Interfaces:**
- Consumes: `shouldStartCardDrag` (Task 7); `KanbanCardModel.saving` (Task 5).
- Produces four bubbling, composed events, all `CustomEvent`:
  - `kanban-drag-start` — `{ key: string; lane: string }`
  - `kanban-drag-move` — `{ clientX: number; clientY: number }`
  - `kanban-drag-end` — `{ clientX: number; clientY: number }`
  - `kanban-drag-cancel` — no detail
  - and two new properties: `allowDrag` (`allow-drag`) and `laneValue` (`lane-value`)

- [ ] **Step 1: Add the properties and the pointer state**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts`, extend the imports and add the properties after `showChildItems`:

```ts
import { classMap, css, customElement, html, nothing, property, repeat, state } from '@umbraco-cms/backoffice/external/lit';
```

```ts
  /**
   * Whether this board's configuration permits dragging. Board-wide state forwarded down, paired with the
   * card's own `canUpdate` — dragging needs both, and only the server knows either.
   */
  @property({ type: Boolean, attribute: 'allow-drag' })
  allowDrag = false;

  /**
   * The value of the lane this card is currently in. Passed down rather than derived: a card has no view
   * of the board, and the drag's source lane has to travel with the gesture so the failure path can put
   * the card back exactly where it started.
   */
  @property({ type: String, attribute: 'lane-value' })
  laneValue?: string;
```

Then, beside the existing `#entityContext` field:

```ts
  /**
   * True while this card is the one being dragged. The placeholder the spec asks for is the card itself
   * reading as lifted-and-left-behind rather than a second floating element: the pointer is captured on
   * this card, so it is already the thing under the cursor for the whole gesture, and a duplicate ghost
   * would have to be positioned against a board that is scrolling underneath it.
   */
  @state()
  private _dragging = false;

  /** The live drag, or undefined between gestures. Keyed by pointerId so a second pointer is ignored. */
  #drag?: { pointerId: number };

  /**
   * Whether the last gesture moved at all. A drag ends with a pointerup on the card, which the browser
   * then follows with a click — so without this, every drag would also open the card's document.
   */
  #moved = false;
```

- [ ] **Step 2: Add the pointer handlers**

In the same file, after `#onOpen`:

```ts
  #onPointerDown(event: PointerEvent) {
    if (this.#drag || !this.card || this.laneValue === undefined) return;

    if (
      !shouldStartCardDrag({
        allowDrag: this.allowDrag,
        canUpdate: this.card.canUpdate,
        saving: this.card.saving === true,
        pointerType: event.pointerType,
        button: event.button,
        isPrimary: event.isPrimary,
      })
    ) {
      return;
    }

    // Capturing on the card is what makes every subsequent event for this pointer arrive here regardless
    // of what is visually underneath — including over another lane, which is the whole point.
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    this.#drag = { pointerId: event.pointerId };
    this.#moved = false;
    this._dragging = true;

    this.#dispatch('kanban-drag-start', { key: this.card.key, lane: this.laneValue });

    // Stops the browser's native drag-select starting before the board's re-render lands — Lit's render
    // is a microtask, not synchronous with this event.
    event.preventDefault();
  }

  #onPointerMove(event: PointerEvent) {
    if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;

    this.#moved = true;

    this.#dispatch('kanban-drag-move', { clientX: event.clientX, clientY: event.clientY });
  }

  #onPointerUp(event: PointerEvent) {
    if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;

    this.#releaseCapture(event);
    this.#drag = undefined;
    this._dragging = false;

    this.#dispatch('kanban-drag-end', { clientX: event.clientX, clientY: event.clientY });
  }

  /**
   * pointercancel and lostpointercapture, the latter of which the browser can fire with no pointerup ever
   * arriving (losing window focus, an OS gesture taking over the drag). Identical cleanup to a pointerup
   * over nothing — the same reasoning the board's pan already applies to a revoked capture.
   */
  #onPointerCancel(event: PointerEvent) {
    if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;

    this.#releaseCapture(event);
    this.#drag = undefined;
    this._dragging = false;

    this.#dispatch('kanban-drag-cancel', undefined);
  }

  #releaseCapture(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement;

    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  }

  #dispatch(type: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
```

and add `shouldStartCardDrag` to the imports:

```ts
import { shouldStartCardDrag } from './drag.model.js';
```

- [ ] **Step 3: Suppress the click that follows a drag**

Replace the existing `#onOpen` in the same file:

```ts
  #onOpen() {
    if (!this.card) return;

    // A drag ends with a pointerup on this card, which the browser follows with a click. Opening the
    // document then would make every completed drag also open a workspace modal.
    if (this.#moved) {
      this.#moved = false;
      return;
    }

    this.dispatchEvent(
      new CustomEvent('kanban-open-document', {
        detail: { key: this.card.key },
        bubbles: true,
        composed: true,
      }),
    );
  }
```

- [ ] **Step 4: Bind the handlers and the visual states**

In the same file's `render()`, replace the opening `<div class="card">` with a `classMap` carrying the two new states and the pointer bindings:

```ts
      <div
        class=${classMap({
          card: true,
          draggable: this.allowDrag && this.card.canUpdate && this.card.saving !== true,
          dragging: this._dragging,
          saving: this.card.saving === true,
        })}
        @pointerdown=${this.#onPointerDown}
        @pointermove=${this.#onPointerMove}
        @pointerup=${this.#onPointerUp}
        @pointercancel=${this.#onPointerCancel}
        @lostpointercapture=${this.#onPointerCancel}>
```

and add to `static override styles`, after the `.card:hover` rule:

```css
      .card.draggable {
        cursor: grab;
      }

      /* The placeholder: this card is the one in flight, so it reads as lifted out of the lane. Text
         selection is off for the gesture's duration, the same reason `.lanes.panning` turns it off. */
      .card.dragging {
        cursor: grabbing;
        opacity: 0.5;
        border-style: dashed;
        user-select: none;
      }

      /* A write is in flight: the card reads as provisional and cannot be picked up again until it
         resolves, which shouldStartCardDrag enforces independently of this styling. */
      .card.saving {
        opacity: 0.6;
        cursor: progress;
      }
```

- [ ] **Step 5: Type-check, build and run every client test**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: build succeeds, all tests pass. Nothing visible changes yet — no host passes `allow-drag`.

- [ ] **Step 6: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts
git commit -m "feat: card reports a pointer drag and suppresses the click that follows it"
```

---

### Task 9: The lane's drop-target highlight

Two booleans driven from above, and a highlight built from the lane's own colour so a red "Blocked" lane highlights red rather than every lane flashing the same generic accent. The `readonly` property, which nothing ever read, goes.

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-lane.element.ts`

**Interfaces:**
- Consumes: `KanbanCardModel.saving` (Task 5); the card element's `allow-drag` / `lane-value` (Task 8).
- Produces: `isDropTarget` (`is-drop-target`), `acceptsDrop` (`accepts-drop`) and `allowDrag` (`allow-drag`) on `umb-community-kanban-lane`; `readonly` removed.

- [ ] **Step 1: Replace `readonly` with the three new properties**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-lane.element.ts`, delete:

```ts
  @property({ type: Boolean })
  readonly = true;
```

and put in its place:

```ts
  /**
   * Whether this board's configuration permits dragging. Forwarded to each card, which pairs it with the
   * card's own canUpdate. Replaces the milestone-2 `readonly` flag, which every host hardcoded true and
   * nothing ever read — dragging is gated on server-supplied facts, not a host attribute.
   */
  @property({ type: Boolean, attribute: 'allow-drag' })
  allowDrag = false;

  /**
   * Whether this lane is the one currently under a dragging pointer. Set by the board, because the board
   * is the only element that can hit-test every lane at once, and only ever on one lane at a time.
   */
  @property({ type: Boolean, attribute: 'is-drop-target' })
  isDropTarget = false;

  /** Whether this lane would take the card if it were released now — the lane model's own acceptsDrops. */
  @property({ type: Boolean, attribute: 'accepts-drop' })
  acceptsDrop = false;
```

- [ ] **Step 2: Move the colour variable up to `.lane` and add the highlight classes**

In the same file's `render()`, replace the two opening divs:

```ts
      <div
        class=${classMap({
          lane: true,
          'drop-target': this.isDropTarget && this.acceptsDrop,
          'drop-reject': this.isDropTarget && !this.acceptsDrop,
        })}
        style=${colour ? `--kanban-lane-colour: ${colour}` : ''}>
        <div class="header">
```

The variable moves one level up so both the header's top border and the new highlight read the same value without it being threaded through twice. Add `classMap` to the lit import at the top of the file:

```ts
import { classMap, css, customElement, html, nothing, property, repeat } from '@umbraco-cms/backoffice/external/lit';
```

- [ ] **Step 3: Forward drag state to each card**

In the same `render()`, replace the card template inside `repeat`:

```ts
            (card) => html`<umb-community-kanban-card
              .card=${card}
              lane-value=${this.lane!.value}
              ?allow-drag=${this.allowDrag}
              ?show-child-items=${this.showChildItems}></umb-community-kanban-card>`,
```

`lane-value` is bound as an attribute, not a property, precisely so the empty string (the unassigned lane) arrives as `''` rather than being treated as absent.

- [ ] **Step 4: Style the highlight**

In the same file's `static override styles`, replace the `.lane` rule and add the two states:

```css
      .lane {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-3);
        min-width: 280px;
        max-width: 320px;
        flex: 0 0 auto;
        /* A transparent border of the same width the highlight uses, so becoming a drop target changes
           colour and nothing else — no reflow of the whole board mid-drag. */
        border: 2px solid transparent;
        border-radius: var(--uui-border-radius);
      }

      /* A variant of the lane's own colour, not a generic accent: a red "Blocked" lane highlights red and
         a green "Done" lane green. Two strengths of the same colour so the border reads as the saturated
         edge of the faint tint behind it. The fallback covers a lane with no resolved colour — reachable
         today only via the (Unassigned) lane, which is pinned to neutral grey. */
      .lane.drop-target {
        background: color-mix(in srgb, var(--kanban-lane-colour, var(--uui-color-border)) 20%, transparent);
        border-color: color-mix(in srgb, var(--kanban-lane-colour, var(--uui-color-border)) 80%, transparent);
      }

      /* Rejection reads as neutral and disabled, deliberately NOT as a variant of the lane's identity —
         so a lane that will not take the card never looks like a lane that will. */
      .lane.drop-reject {
        border-style: dashed;
        border-color: var(--uui-color-border);
      }
```

- [ ] **Step 5: Type-check, build and run every client test**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: `tsc --noEmit` fails in `kanban-board.element.ts`, which still binds `?readonly=${this.readonly}` on the lane. That is Task 10's job — to keep this task's commit compiling, delete just that one binding line from `kanban-board.element.ts`'s lane template now:

```ts
        ${this._board.lanes.map(
          (lane) => html`<umb-community-kanban-lane
            .lane=${lane}
            ?show-child-items=${this._board?.showChildItems ?? false}></umb-community-kanban-lane>`,
        )}
```

Then re-run; expected: build succeeds, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core
git commit -m "feat: highlight a drop-target lane in a shade of its own colour"
```

---

### Task 10: The board orchestrates the drag and the write

The board hit-tests, moves the card optimistically, fires the write, and snaps back on failure. The hardcoded `readonly` property and every host binding for it go.

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/hosts/collection-view-board.element.ts`

**Interfaces:**
- Consumes: `moveCard`, `nextStateAfterSave`, `applyCardState`, `setCardSaving` (Task 6); `laneAtPoint`, `moveFailureMessage`, `KanbanLaneHitTarget` (Task 7); the card's four drag events (Task 8); the lane's `allow-drag` / `is-drop-target` / `accepts-drop` (Task 9); `KanbanDataSource.setLane` (Task 5).
- Produces: a board that persists drags; `readonly` gone from `umb-community-kanban-board`.

- [ ] **Step 1: Replace `readonly` with the drag state**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`, delete:

```ts
  /** Fixed true for this milestone; drag arrives in milestone 3. */
  @property({ type: Boolean })
  readonly = true;
```

and add after `_isPanning`:

```ts
  /**
   * The live card drag, or undefined between gestures. `lane` is the source lane, captured at drag start
   * so the revert on a failed write is the exact inverse move.
   */
  @state()
  private _drag?: { key: string; lane: string };

  /** The lane currently under the pointer, or undefined. Only ever one, which laneAtPoint guarantees. */
  @state()
  private _dropTarget?: { value: string; acceptsDrops: boolean };
```

- [ ] **Step 2: Extend the imports**

At the top of the same file:

```ts
import { UMB_NOTIFICATION_CONTEXT } from '@umbraco-cms/backoffice/notification';
import {
  applyCardState,
  mergeLanePage,
  moveCard,
  nextStateAfterSave,
  setCardSaving,
  toBoardState,
  type KanbanBoardState,
} from './board.model.js';
import { laneAtPoint, moveFailureMessage, type KanbanLaneHitTarget } from './drag.model.js';
```

- [ ] **Step 3: Add the drag handlers**

In the same file, after `#endPan()`:

```ts
  #onDragStart(event: CustomEvent<{ key: string; lane: string }>) {
    // A pan and a card drag cannot overlap: the pan only starts on `.lanes` itself, which a card is never.
    this._drag = { key: event.detail.key, lane: event.detail.lane };
    this._dropTarget = undefined;
  }

  #onDragMove(event: CustomEvent<{ clientX: number; clientY: number }>) {
    if (!this._drag) return;

    const hit = laneAtPoint(event.detail.clientX, event.detail.clientY, this.#laneTargets());

    this._dropTarget = hit ? { value: hit.value, acceptsDrops: hit.acceptsDrops } : undefined;
  }

  #onDragCancel() {
    this._drag = undefined;
    this._dropTarget = undefined;
  }

  async #onDragEnd(event: CustomEvent<{ clientX: number; clientY: number }>) {
    const drag = this._drag;
    const hit = drag ? laneAtPoint(event.detail.clientX, event.detail.clientY, this.#laneTargets()) : undefined;

    // Clear before awaiting anything, so the highlight never outlives the gesture.
    this._drag = undefined;
    this._dropTarget = undefined;

    if (!drag || !hit || !hit.acceptsDrops || !this._board || !this.datasource) return;
    if (hit.value.toLowerCase() === drag.lane.toLowerCase()) return;

    const card = this.#findCard(drag.key);

    if (!card) return;

    // Optimistic: the card relocates, its badge flips, and it dims — all before the request is even sent.
    let next = moveCard(this._board, drag.key, drag.lane, hit.value);
    next = applyCardState(next, drag.key, nextStateAfterSave(card.state));
    this._board = setCardSaving(next, drag.key, true);

    const token = this.#loadToken;

    const outcome = await this.datasource.setLane({
      cardKey: drag.key,
      laneValue: hit.value,
      culture: this.culture,
    });

    // A full reload started meanwhile and owns `_board` now; its state came from the server, so it is
    // already correct whether the write landed or not.
    if (token !== this.#loadToken || !this._board) return;

    if (outcome.kind === 'success') {
      // What the server actually persisted, in place of the optimistic guess.
      this._board = setCardSaving(applyCardState(this._board, drag.key, outcome.state), drag.key, false);
      return;
    }

    // The same function with the lanes swapped: the card goes back exactly where it started.
    let reverted = moveCard(this._board, drag.key, hit.value, drag.lane);
    reverted = applyCardState(reverted, drag.key, card.state);
    this._board = setCardSaving(reverted, drag.key, false);

    const notifications = await this.getContext(UMB_NOTIFICATION_CONTEXT);

    notifications?.peek('danger', {
      data: { message: moveFailureMessage(card.name, outcome.status) },
    });
  }

  /** Every rendered lane's identity and viewport rect — the board is the only element that can see them all. */
  #laneTargets(): KanbanLaneHitTarget[] {
    const elements = Array.from(this.renderRoot.querySelectorAll('umb-community-kanban-lane'));

    return elements.flatMap((element) => {
      if (!element.lane) return [];

      const rect = element.getBoundingClientRect();

      return [
        {
          value: element.lane.value,
          acceptsDrops: element.lane.acceptsDrops,
          rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        },
      ];
    });
  }

  #findCard(key: string) {
    return this._board?.lanes.flatMap((lane) => lane.cards).find((card) => card.key === key);
  }
```

- [ ] **Step 4: Clear the drag on reload**

In the same file's `load()`, beside the existing `this.#endPan();`:

```ts
    this.#endPan();
    this.#onDragCancel();
```

with the existing comment above it extended:

```ts
    // A reload swaps out `.lanes` for a loader, not a re-render in place — any in-progress pan or card
    // drag would otherwise be stranded on the discarded div (see #endPan for why that's unsafe).
```

- [ ] **Step 5: Bind the events and the per-lane drag state**

In `#renderBoard()`, add the four listeners to the `.lanes` div alongside `@kanban-load-more`:

```ts
        @kanban-load-more=${this.#onLoadMore}
        @kanban-drag-start=${this.#onDragStart}
        @kanban-drag-move=${this.#onDragMove}
        @kanban-drag-end=${this.#onDragEnd}
        @kanban-drag-cancel=${this.#onDragCancel}
```

and replace the lane template:

```ts
        ${this._board.lanes.map(
          (lane) => html`<umb-community-kanban-lane
            .lane=${lane}
            ?allow-drag=${this._board?.allowDrag ?? false}
            ?is-drop-target=${this._dropTarget?.value === lane.value}
            ?accepts-drop=${this._dropTarget?.acceptsDrops ?? false}
            ?show-child-items=${this._board?.showChildItems ?? false}></umb-community-kanban-lane>`,
        )}
```

`_dropTarget.value` is compared to `lane.value` exactly, not case-insensitively, because it *came from* `lane.value` via the hit-test — there is no second source to reconcile.

- [ ] **Step 6: Remove the host's `readonly` binding**

In `src/Umbraco.Community.Kanban/Client/src/hosts/collection-view-board.element.ts`, delete the `?readonly=${true}` line from the board template:

```ts
      <umb-community-kanban-board
        parent-id=${this._parentId}
        .culture=${this._culture}
        .datasource=${this.#datasource}
        @kanban-open-document=${this.#onOpenDocument}
        @kanban-create-child=${this.#onCreateChild}></umb-community-kanban-board>
```

- [ ] **Step 7: Verify no `readonly` survives**

Run: `grep -rn "readonly=" src/Umbraco.Community.Kanban/Client/src`
Expected: no output. (`readonly` as a TypeScript modifier will not match this pattern.)

- [ ] **Step 8: Type-check, build and run every client test**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: build succeeds, all tests pass.

If `this.renderRoot.querySelectorAll('umb-community-kanban-lane')` is not typed as the lane element, the `HTMLElementTagNameMap` declaration at the bottom of `kanban-lane.element.ts` is what supplies that — it is already there, and `kanban-board.element.ts` already imports `./kanban-lane.element.js`, so no cast is needed. Do not add one.

- [ ] **Step 9: Verify the drag by hand**

There is no test harness for element-level pointer wiring — the same as the existing pan and every other interaction in this package. Build the package into the test site and check all five:

1. Drag a card into another lane that accepts drops. The lane tints in its own colour while hovered, the card relocates on release, its badge goes to "Published pending changes", and the move survives a page reload.
2. Drag a card over the (Unassigned) lane, or any lane with `acceptsDrops: false`. It shows the muted dashed border, and releasing there moves nothing and writes nothing.
3. Release outside every lane. Nothing moves, no request is sent.
4. Sign in as a user without Update on one card. That card does not start a drag at all, and shows no grab cursor.
5. Switch the board configuration's **Allow drag** off. No card drags, and calling `PUT /card/{key}/lane` directly (via the Swagger UI) returns 400 "Dragging is disabled".

To see the failure path, temporarily deny Update on a card in a second browser tab after the board has loaded, then drag it: expected — the card snaps back to its original lane with its original badge, and one toast reads "Couldn't move '…' — you no longer have permission to change it." Undo the permission change afterwards.

- [ ] **Step 10: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src
git commit -m "feat: drag a card between lanes, writing the lane back optimistically"
```

---

### Task 11: Publish pending changes

A board-level toolbar action reusing Umbraco's own publishing repository, one call per pending card. No new server endpoint — core's own bulk publish has none either.

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`

**Interfaces:**
- Consumes: `pendingCards`, `applyCardState` (Task 6); `formatPublishSummary` (Task 7); `UmbDocumentPublishingRepository` (`@umbraco-cms/backoffice/document`), `UmbVariantId` (`@umbraco-cms/backoffice/variant`), `umbConfirmModal` (`@umbraco-cms/backoffice/modal`), `UMB_NOTIFICATION_CONTEXT` (`@umbraco-cms/backoffice/notification`).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Extend the imports**

At the top of `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`:

```ts
import { UmbDocumentPublishingRepository } from '@umbraco-cms/backoffice/document';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import { UmbVariantId } from '@umbraco-cms/backoffice/variant';
```

and add `pendingCards` to the existing `./board.model.js` import, and `formatPublishSummary` to the existing `./drag.model.js` import.

- [ ] **Step 2: Add the publishing state and repository**

Beside the other private fields in the same file:

```ts
  /**
   * Umbraco's own single-document publishing repository, looped once per pending card. This is exactly
   * what core's document list-view bulk publish does — that action has no server-side bulk endpoint
   * behind it either — so this milestone adds no /publish-pending controller of its own.
   */
  #publishing = new UmbDocumentPublishingRepository(this);

  /** True while a publish run is in flight, so the button cannot be pressed twice. */
  @state()
  private _publishing = false;
```

- [ ] **Step 3: Add the publish action**

After `#findCard`:

```ts
  async #onPublishPending() {
    if (!this._board || this._publishing) return;

    const pending = pendingCards(this._board);

    if (pending.length === 0) return;

    const confirmed = await umbConfirmModal(this, {
      headline: '#content_readyToPublish',
      content: `${pending.length} ${pending.length === 1 ? 'card has' : 'cards have'} unpublished changes: ${pending
        .map((card) => card.name)
        .join(', ')}`,
      color: 'positive',
      confirmLabel: this.localize.term('actions_publish'),
    }).catch(() => false);

    if (confirmed === false) return;

    this._publishing = true;

    // The board's own culture, or the invariant variant where nothing varies — the same choice core's
    // bulk action makes when every selected document is invariant.
    const variantId = this.culture ? new UmbVariantId(this.culture, null) : UmbVariantId.CreateInvariant();

    let succeeded = 0;

    for (const card of pending) {
      const { error } = await this.#publishing.publish(card.key, [{ variantId }]);

      if (error) continue;

      succeeded++;

      // Flip this card locally rather than reloading the whole board: a reload would discard every lane
      // page the editor has already loaded.
      if (this._board) {
        this._board = applyCardState(this._board, card.key, 'published');
      }
    }

    this._publishing = false;

    const notifications = await this.getContext(UMB_NOTIFICATION_CONTEXT);

    // One summary line, never one toast per card — a failure folds into the same line as the successes.
    notifications?.peek(succeeded === pending.length ? 'positive' : 'warning', {
      data: { message: formatPublishSummary(succeeded, pending.length) },
    });
  }
```

- [ ] **Step 4: Render the toolbar**

In `#renderBoard()`, the existing body is `if (!this._board) return nothing;` followed by `return html\`…\``. Insert the `const` between those two statements — after the guard, so `this._board` is known non-null — and put the toolbar above the truncation message, which is the same place a board-level message already renders and above `.lanes`:

```ts
    const pending = pendingCards(this._board);

    return html`
      ${pending.length
        ? html`<div class="toolbar">
            <uui-button
              look="primary"
              color="positive"
              icon="icon-globe"
              label="Publish pending changes"
              ?disabled=${this._publishing}
              @click=${this.#onPublishPending}>
              Publish pending changes
              <uui-badge look="secondary">${pending.length}</uui-badge>
            </uui-button>
          </div>`
        : nothing}
      ${this._board.truncated
```

`icon-globe` is the icon Umbraco's own publish entity action and bulk action both use; `uui-badge look="secondary"` is the same component and look the lane header already uses for its total. This is deliberately **not** `umb-collection-selection-actions` — that component is keyed to a collection's checkbox selection, which this board has none of.

- [ ] **Step 5: Style the toolbar**

Add to `static override styles`, after the `.message` rule:

```css
      .toolbar {
        display: flex;
        justify-content: flex-end;
        padding-bottom: var(--uui-size-space-3);
      }
```

- [ ] **Step 6: Type-check, build and run every client test**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: build succeeds, all tests pass.

If `umbConfirmModal`'s `content` rejects a plain string, it accepts `TemplateResult | string` per its own type — check the import path resolved to `@umbraco-cms/backoffice/modal` and not a `dist-cms` path.

- [ ] **Step 7: Verify publishing by hand**

Build the package into the test site and check four things:

1. A board with no pending cards shows no toolbar at all.
2. Drag a published card to another lane. The button appears reading "Publish pending changes" with a badge of 1.
3. Press it. The confirmation lists that card by name; confirming publishes it, the badge disappears, the card's tag becomes "Published", and one green toast reads "Published 1 card." Reload: the card is published in its new lane.
4. Make two cards pending, then delete one in a second tab, then publish. Expected: one amber toast reading "Published 1 of 2 — 1 failed.", the surviving card published, and the failed card still showing pending — not one toast per card.

Cancel the confirmation once too: nothing should publish and no toast should appear.

- [ ] **Step 8: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts
git commit -m "feat: publish every pending card from one confirmed board action"
```

---

### Task 12: Record the milestone in the docs

The enhancements backlog is the file a cold reader checks to know what is built. Item 8 explicitly waited on drag existing, so its blocker is now gone.

**Files:**
- Modify: `docs/ENHANCEMENTS.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. No task depends on this.

- [ ] **Step 1: Add the milestone entry**

In `docs/ENHANCEMENTS.md`, insert a new section immediately after the `## 2 & 3. Card properties as List View columns — **done 2026-07-29**` section and before `## 7. Board configuration picker`:

```markdown
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
```

- [ ] **Step 2: Unblock item 8**

In the same file, in the `## 8. Add a card from the top of a lane` section, replace the sentence beginning "Builds on item 5, now done" with:

```markdown
Builds on item 5 (create in the workspace modal) and on milestone 3's drag, both now done, so nothing
blocks it structurally. One thing still needs verifying first: whether a document's property values can
be preset. `UMB_WORKSPACE_MODAL` takes a `preset`, and `entity-detail-workspace-base` applies it as
`{...scaffold, ...preset}` — a **top-level spread**, so a preset `values` array replaces the scaffolded
one outright rather than merging into it. Presetting one property therefore means constructing the whole
`values` array, and the culture/segment of the entry has to be right for a varying document. Prove that
on a real document type before designing the panel.
```

Leave the "Also unsettled" paragraph below it exactly as it is — the unassigned lane and manual-lane-value problems it names are still open, and milestone 3 did not touch them.

- [ ] **Step 3: Verify the whole suite one last time**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj && cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: every server test passes, the client builds and type-checks clean, every client test passes.

- [ ] **Step 4: Commit**

```bash
git add docs/ENHANCEMENTS.md
git commit -m "docs: record milestone 3 and unblock the add-from-lane enhancement"
```
