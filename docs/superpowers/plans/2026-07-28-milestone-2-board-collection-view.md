# Milestone 2 — Read-only Board via the Collection View Host — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a document's children as a read-only Kanban board, reachable from the standard Collection (list view) layout picker.

**Architecture:** A new `GET /board` endpoint resolves which Kanban Board configuration a collection is using (walking parent → `ListView` data type → `kanban.boardConfigId`), loads the parent's children capped at 1000, filters them by browse permission, groups them into the lanes milestone 1's `IKanbanLaneResolver` produces, and pages each lane independently. On the client, a host-agnostic `<umb-community-kanban-board>` element renders lanes as columns through an injectable `KanbanDataSource`; a `collectionView` adapter supplies it with the parent id and culture, and a Data Type workspace tab lets an editor pick the configuration.

**Tech Stack:** .NET 10, Umbraco CMS 18.0.2, xUnit + FluentAssertions (no mocking framework — hand-written fakes), TypeScript, Lit 3, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-28-milestone-2-board-collection-view-design.md`

## Global Constraints

- Target Umbraco CMS **18.0.2** and .NET **10**. Every Umbraco API used in this plan has been verified against that version — do not substitute a differently-named member because it looks more familiar from an older version.
- **File-scoped namespaces** in all C# files.
- **Primary constructors** for classes taking dependencies.
- **No underscore prefix on private fields.** `private readonly Dictionary<string, Guid> cache = [];`, not `_cache`.
- Nullable reference types are enabled; honour it.
- **No mocking framework.** Tests use hand-written fakes. Shared fakes live in `tests/Umbraco.Community.Kanban.Tests/Fakes/` as `internal sealed`, namespace `Umbraco.Community.Kanban.Tests.Fakes`.
- **The core package must never reference Contentment.**
- Property editor aliases, UI aliases and API paths are fixed constants in `src/Umbraco.Community.Kanban/Constants.cs` (server) and `Client/src/constants.ts` (client). Never inline them as magic strings.
- Client Vitest runs in a **Node environment with no custom-elements registry**. Lit elements are therefore NOT DOM-tested. Only pure model/logic modules get unit tests; elements are verified by `tsc --noEmit` and `npm run build`. Do not add a browser test runner.
- `UmbPropertyValueChangeEvent` **does not exist** in `@umbraco-cms/backoffice` 18.0.2. Use `UmbChangeEvent` from `@umbraco-cms/backoffice/event`.
- The board is **read-only** in this milestone. No drag handlers, no write endpoints, no publish action.
- Everything on the spec's §1 "Out" list is out. In particular: no calendar, no inline configuration on `GET /board`, no media picker thumbnails, no lane-preview wiring.

**Verified Umbraco 18.0.2 API facts this plan depends on** (do not re-derive):

- `IContent.ContentType` is an `ISimpleContentType` exposing `Key`, `Alias`, `Icon` (`string?`), `ListView` (`Guid?`) and `Variations` (`ContentVariation`). `IsContainer` no longer exists.
- `IContentService.GetById(Guid key)` returns `IContent?` and is **synchronous only** — there is no async variant.
- `IContentService.GetPagedChildren(int id, long pageIndex, int pageSize, out long totalRecords, string[]? propertyAliases, IQuery<IContent>? filter, Ordering? ordering, bool loadTemplates = true)`. All three of `propertyAliases`, `filter` and `ordering` accept `null`; a `null` ordering falls back to `sortOrder` ascending.
- `IContentBase.Properties` is `IPropertyCollection`, which has `IProperty? this[string name]`, `bool TryGetValue(string, out IProperty)` and `bool Contains(string)`. `IProperty.PropertyType` is a non-nullable `IPropertyType` exposing `Alias`, `Name`, `PropertyEditorAlias`, `DataTypeKey` and `Variations`.
- `IContentBase.GetValue(string propertyTypeAlias, string? culture = null, string? segment = null, bool published = false)`.
- `ContentVariation` is a `[Flags] enum : byte { Nothing = 0, Culture = 1, Segment = 2, CultureAndSegment = 3 }` in `Umbraco.Cms.Core.Models`.
- `IContentTypeBase.AllowedContentTypes` is `IEnumerable<ContentTypeSort>?`; `ContentTypeSort` (namespace `Umbraco.Cms.Core.Models`) exposes `Key` (Guid), `Alias` (string) and `SortOrder` (int).
- `IContentTypeService.Get(Guid key)` / `GetAsync(Guid guid)` come from `IContentTypeBaseService<IContentType>`.
- `IContentPermissionAuthorizer` (namespace `Umbraco.Cms.Core.Security.Authorization`) exposes `Task<bool> IsDeniedAsync(IUser currentUser, IEnumerable<Guid> contentKeys, ISet<string> permissionsToCheck)` and `Task<ISet<Guid>> FilterAuthorizedAsync(IUser currentUser, IEnumerable<Guid> contentKeys, ISet<string> permissionsToCheck)`. Use `FilterAuthorizedAsync` for bulk filtering.
- `ActionBrowse.ActionLetter == "Umb.Document.Read"` and `ActionUpdate.ActionLetter == "Umb.Document.Update"`, both `public const string` in `Umbraco.Cms.Core.Actions`.
- `ManagementApiControllerBase` exposes `protected static IUser CurrentUser(IBackOfficeSecurityAccessor)` and a `Forbidden()` helper. `ProblemDetailsBuilder` lives in `Umbraco.Cms.Api.Common.Builders` with `WithTitle`/`WithDetail`/`Build`.
- `ILanguageService.GetDefaultIsoCodeAsync()` returns `Task<string>`. `ILocalizationService.GetDefaultLanguageIsoCode()` does **not** exist.
- Client: `UMB_ENTITY_CONTEXT` (`@umbraco-cms/backoffice/entity`) yields the owning document's GUID — the collection context does **not**. `UMB_VARIANT_CONTEXT` (`@umbraco-cms/backoffice/variant`) yields `displayCulture`. `UMB_COLLECTION_CONTEXT` (`@umbraco-cms/backoffice/collection`) exposes `items`, `loading` and `loadCollection()`.
- Client: `<umb-value-summary-extension .valueType=${schemaEditorAlias} .value=${value}>` renders arbitrary property values and falls back to the raw value when no `valueSummary` extension matches. `<umb-icon name="icon-box color-blue">` splits and resolves the colour suffix itself.
- Client: the `collectionView` condition is `{ alias: 'Umb.Condition.CollectionAlias', match: 'Umb.Collection.Document' }`. The data type `workspaceView` condition is `{ alias: UMB_WORKSPACE_CONDITION_ALIAS, match: UMB_DATA_TYPE_WORKSPACE_ALIAS }`, both from `@umbraco-cms/backoffice/data-type` / `.../workspace`.
- Client: there is **no** extension condition matching a data type's property editor UI alias. The Kanban tab must register unconditionally on the data type workspace and render nothing unless `propertyEditorUiAlias === 'Umb.PropertyEditorUi.Collection'`.
- Client: authenticated calls go through `umbHttpClient` (`@umbraco-cms/backoffice/http-client`) whose `baseUrl` is the site root, wrapped in `tryExecute(host, promise, opts)` (`@umbraco-cms/backoffice/resources`). The client is configured `throwOnError: true`, so `tryExecute` is required, not optional.

## File Structure

**Server** — `src/Umbraco.Community.Kanban/`

| File | Responsibility |
|---|---|
| `Constants.cs` *(modify)* | Adds the `kanban.boardConfigId` key and the child cap default |
| `Models/Api/KanbanBoardResponseModel.cs` | The `GET /board` wire shape: board, lane, card, card property |
| `Models/Api/KanbanBoardRequestModel.cs` | The query-string binding model |
| `Services/KanbanCardStateResolver.cs` | Pure published/edited → state string |
| `Services/KanbanCardMapper.cs` | `IContent` → `KanbanCardModel`, culture-aware |
| `Services/KanbanBoardComposer.cs` | Pure grouping, per-lane paging, totals, truncation |
| `Services/IKanbanContentTypeLookup.cs` + `KanbanContentTypeLookup.cs` | Narrow wrapper over `IContentTypeService` |
| `Services/IKanbanLaneContentTypeResolver.cs` + impl | Picks the child content type the lanes resolve against |
| `Services/IKanbanBoardConfigurationResolver.cs` + impl | `configId`/`ListView` → `KanbanBoardConfiguration` |
| `Services/IKanbanContentLoader.cs` + `KanbanContentLoader.cs` | Narrow wrapper over `IContentService` |
| `Services/IKanbanBoardService.cs` + `KanbanBoardService.cs` | Orchestrates the above into a board |
| `Controllers/BoardController.cs` | `GET /board` |
| `Extensions/UmbracoBuilderExtensions.cs` *(modify)* | Registers the new services |

The narrow `IKanban*Lookup`/`IKanban*Loader` wrappers exist for one reason: `IContentService` and `IContentTypeService` cannot be faked by hand (dozens of members) and cannot be instantiated without persistence infrastructure this test project does not have. Milestone 1 established this pattern with `IKanbanPropertyDataTypeLookup`. Follow it — do not attempt to fake the Umbraco services directly.

**Client** — `src/Umbraco.Community.Kanban/Client/src/`

| File | Responsibility |
|---|---|
| `constants.ts` *(modify)* | New aliases, endpoint paths, the config key |
| `data/kanban-board.types.ts` | Wire types mirroring the server models |
| `data/kanban-data-source.ts` | The `KanbanDataSource` interface + pure query building |
| `data/kanban-server-data-source.ts` | `umbHttpClient` implementation |
| `data/kanban-configuration-data-source.ts` | `GET /configurations`, for the workspace tab |
| `core/board.model.ts` | Board state, the page-merge reducer, total formatting |
| `core/kanban-card.element.ts` | One card |
| `core/kanban-lane.element.ts` | One lane column |
| `core/kanban-board.element.ts` | `<umb-community-kanban-board>` |
| `hosts/collection-view-board.element.ts` + `hosts/manifests.ts` | The `collectionView` adapter |
| `workspace-views/data-type-kanban.element.ts` + `workspace-views/manifests.ts` | The Data Type workspace tab |
| `bundle.manifests.ts` *(modify)* | Registers the two new manifest groups |

`core/` imports nothing from `hosts/` or `workspace-views/`, and nothing from any collection or workspace package. Nothing in the toolchain enforces this — it is a review gate.

---

### Task 1: Board response models and the card state resolver

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Constants.cs`
- Create: `src/Umbraco.Community.Kanban/Models/Api/KanbanBoardResponseModel.cs`
- Create: `src/Umbraco.Community.Kanban/Services/KanbanCardStateResolver.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Services/KanbanCardStateResolverTests.cs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `Umbraco.Community.Kanban.Models.Api.KanbanBoardResponseModel`, `KanbanBoardLaneModel`, `KanbanCardModel`, `KanbanCardPropertyModel` — the wire shapes every later server task fills and the client mirrors.
  - `Umbraco.Community.Kanban.Models.Api.KanbanCardStates` — `public const string` values `"published"`, `"publishedPendingChanges"`, `"draft"`.
  - `Umbraco.Community.Kanban.Services.KanbanCardStateResolver.Resolve(bool published, bool edited)` → `string`.
  - `Constants.BoardConfigIdKey` = `"kanban.boardConfigId"`, `Constants.DefaultChildCap` = `1000`.

- [ ] **Step 1: Write the failing test**

`tests/Umbraco.Community.Kanban.Tests/Services/KanbanCardStateResolverTests.cs`:

```csharp
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanCardStateResolverTests
{
    [Fact]
    public void Published_and_unedited_is_published() =>
        KanbanCardStateResolver.Resolve(published: true, edited: false)
            .Should().Be(KanbanCardStates.Published);

    [Fact]
    public void Published_and_edited_is_published_pending_changes() =>
        KanbanCardStateResolver.Resolve(published: true, edited: true)
            .Should().Be(KanbanCardStates.PublishedPendingChanges);

    [Fact]
    public void Unpublished_is_draft() =>
        KanbanCardStateResolver.Resolve(published: false, edited: false)
            .Should().Be(KanbanCardStates.Draft);

    [Fact]
    public void Unpublished_but_edited_is_still_draft() =>
        KanbanCardStateResolver.Resolve(published: false, edited: true)
            .Should().Be(KanbanCardStates.Draft);
}
```

The fourth case is the one worth pinning: an unpublished document is a draft whether or not it has been touched since creation, so `edited` must not leak into that branch.

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~KanbanCardStateResolverTests`
Expected: FAIL — `KanbanCardStateResolver` and `KanbanCardStates` do not exist (compile error).

- [ ] **Step 3: Add the constants**

In `src/Umbraco.Community.Kanban/Constants.cs`, add to the existing `Constants` class, after `CalendarEditorUiAlias`:

```csharp
    /// <summary>
    /// The extra configuration key written onto a Collection data type naming which
    /// Kanban Board configuration its board layout uses.
    /// </summary>
    public const string BoardConfigIdKey = "kanban.boardConfigId";

    /// <summary>How many children a board reads before it reports itself truncated.</summary>
    public const int DefaultChildCap = 1000;
```

- [ ] **Step 4: Write the response models**

`src/Umbraco.Community.Kanban/Models/Api/KanbanBoardResponseModel.cs`:

```csharp
namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>
/// The publish states a card can report. Deliberately our own three-value vocabulary
/// rather than Umbraco's variant-state enum: every card is a document that exists, so
/// there is no "not created", and the client's badge stays free of an enum whose
/// serialised form we would otherwise have to match exactly.
/// </summary>
public static class KanbanCardStates
{
    public const string Published = "published";
    public const string PublishedPendingChanges = "publishedPendingChanges";
    public const string Draft = "draft";
}

/// <summary>One summary property shown on a card.</summary>
public sealed class KanbanCardPropertyModel
{
    public required string Alias { get; init; }

    public required string Name { get; init; }

    /// <summary>
    /// The property editor *schema* alias, e.g. "Umbraco.DropDown.Flexible". The client
    /// hands this to umb-value-summary-extension to pick a renderer.
    /// </summary>
    public required string EditorAlias { get; init; }

    public object? Value { get; init; }
}

/// <summary>One card on a board — a child document.</summary>
public sealed class KanbanCardModel
{
    public required Guid Key { get; init; }

    public required string Name { get; init; }

    public required string ContentTypeAlias { get; init; }

    /// <summary>
    /// The content type icon verbatim, including any "color-x" suffix — umb-icon
    /// splits and resolves that itself, so nothing here parses it.
    /// </summary>
    public string? Icon { get; init; }

    /// <summary>One of <see cref="KanbanCardStates" />.</summary>
    public required string State { get; init; }

    /// <summary>
    /// Whether the current user may update this node. Populated from this milestone on,
    /// but nothing reads it until drag arrives in milestone 3.
    /// </summary>
    public bool CanUpdate { get; init; }

    public IReadOnlyList<KanbanCardPropertyModel> Properties { get; init; } = [];
}

/// <summary>One lane, with the page of cards the request asked for.</summary>
public sealed class KanbanBoardLaneModel
{
    public required string Value { get; init; }

    public required string Name { get; init; }

    public string? Colour { get; init; }

    public string? Icon { get; init; }

    public bool IsUnassigned { get; init; }

    public bool AcceptsDrops { get; init; }

    /// <summary>
    /// Cards in this lane the current user can see. Exact while
    /// <see cref="TotalIsExact" /> is true, otherwise a lower bound.
    /// </summary>
    public int Total { get; init; }

    public bool TotalIsExact { get; init; } = true;

    /// <summary>How many cards were skipped to produce <see cref="Cards" />.</summary>
    public int Skip { get; init; }

    public IReadOnlyList<KanbanCardModel> Cards { get; init; } = [];
}

/// <summary>The board, or a single lane's page when the request named one.</summary>
public sealed class KanbanBoardResponseModel
{
    public IReadOnlyList<KanbanBoardLaneModel> Lanes { get; init; } = [];

    /// <summary>True when the parent has more children than the board read.</summary>
    public bool Truncated { get; init; }

    /// <summary>The parent's true child count, exact even when truncated.</summary>
    public int ChildCount { get; init; }
}
```

- [ ] **Step 5: Write the state resolver**

`src/Umbraco.Community.Kanban/Services/KanbanCardStateResolver.cs`:

```csharp
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// Turns a document's published/edited pair into a card state. Pure and separate from the
/// card mapper because the per-culture flags it consumes (IsCulturePublished /
/// IsCultureEdited) come from IContent internals that cannot be set on an in-memory
/// Content instance — keeping the decision here is what makes it testable at all.
/// </summary>
public static class KanbanCardStateResolver
{
    public static string Resolve(bool published, bool edited) =>
        published
            ? edited ? KanbanCardStates.PublishedPendingChanges : KanbanCardStates.Published
            : KanbanCardStates.Draft;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet build && dotnet test`
Expected: all pass, 4 new tests.

- [ ] **Step 7: Commit**

```bash
git add src/Umbraco.Community.Kanban/Constants.cs src/Umbraco.Community.Kanban/Models/Api src/Umbraco.Community.Kanban/Services tests/Umbraco.Community.Kanban.Tests/Services
git commit -m "feat: add the board response models and card state resolver"
```

---

### Task 2: Card projection

**Files:**
- Create: `src/Umbraco.Community.Kanban/Services/KanbanCardMapper.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Services/KanbanCardMapperTests.cs`

**Interfaces:**
- Consumes: `KanbanCardModel`, `KanbanCardPropertyModel`, `KanbanCardStates`, `KanbanCardStateResolver` (Task 1).
- Produces: `KanbanCardMapper.Map(IContent content, IReadOnlyList<string> cardProperties, string? culture, bool canUpdate)` → `KanbanCardModel`.

Culture rules, which the tests pin:

- A property is read per-culture only when **both** the content type and the property type vary by culture. Otherwise the invariant value is read.
- Aliases in `cardProperties` that the document does not have are skipped, not emitted as empty.
- Output order follows `cardProperties`, not the document's property order.

- [ ] **Step 1: Write the failing test**

`tests/Umbraco.Community.Kanban.Tests/Services/KanbanCardMapperTests.cs`:

```csharp
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanCardMapperTests
{
    private static readonly FakeShortStringHelper ShortStrings = new();

    private static ContentType ContentTypeWith(ContentVariation variations, params (string Alias, ContentVariation Variations)[] properties)
    {
        var contentType = new ContentType(ShortStrings, -1)
        {
            Alias = "task",
            Name = "Task",
            Icon = "icon-checkbox color-green",
            Variations = variations,
        };

        foreach ((string alias, ContentVariation propertyVariations) in properties)
        {
            contentType.AddPropertyType(new PropertyType(ShortStrings, "Umbraco.TextBox", ValueStorageType.Nvarchar, alias)
            {
                Name = alias,
                Variations = propertyVariations,
            });
        }

        return contentType;
    }

    [Fact]
    public void Maps_identity_from_the_document()
    {
        ContentType contentType = ContentTypeWith(ContentVariation.Nothing);
        var content = new Content("Write the spec", -1, contentType);

        KanbanCardModel card = KanbanCardMapper.Map(content, [], culture: null, canUpdate: true);

        card.Key.Should().Be(content.Key);
        card.Name.Should().Be("Write the spec");
        card.ContentTypeAlias.Should().Be("task");
        card.CanUpdate.Should().BeTrue();
    }

    [Fact]
    public void Passes_the_content_type_icon_through_untouched()
    {
        var content = new Content("A", -1, ContentTypeWith(ContentVariation.Nothing));

        KanbanCardMapper.Map(content, [], null, false).Icon
            .Should().Be("icon-checkbox color-green");
    }

    [Fact]
    public void Reports_state_from_the_published_and_edited_flags()
    {
        var content = new Content("A", -1, ContentTypeWith(ContentVariation.Nothing))
        {
            Published = true,
            Edited = true,
        };

        KanbanCardMapper.Map(content, [], null, false).State
            .Should().Be(KanbanCardStates.PublishedPendingChanges);
    }

    [Fact]
    public void Emits_configured_properties_in_configured_order()
    {
        ContentType contentType = ContentTypeWith(
            ContentVariation.Nothing,
            ("status", ContentVariation.Nothing),
            ("owner", ContentVariation.Nothing));
        var content = new Content("A", -1, contentType);
        content.SetValue("status", "doing");
        content.SetValue("owner", "robert");

        KanbanCardModel card = KanbanCardMapper.Map(content, ["owner", "status"], null, false);

        card.Properties.Select(p => p.Alias).Should().Equal("owner", "status");
        card.Properties.Select(p => p.Value).Should().Equal("robert", "doing");
    }

    [Fact]
    public void Reports_the_property_editor_schema_alias_and_name()
    {
        ContentType contentType = ContentTypeWith(ContentVariation.Nothing, ("status", ContentVariation.Nothing));
        var content = new Content("A", -1, contentType);
        content.SetValue("status", "doing");

        KanbanCardPropertyModel property = KanbanCardMapper.Map(content, ["status"], null, false).Properties.Single();

        property.EditorAlias.Should().Be("Umbraco.TextBox");
        property.Name.Should().Be("status");
    }

    [Fact]
    public void Skips_aliases_the_document_does_not_have()
    {
        ContentType contentType = ContentTypeWith(ContentVariation.Nothing, ("status", ContentVariation.Nothing));
        var content = new Content("A", -1, contentType);

        KanbanCardMapper.Map(content, ["status", "nope"], null, false).Properties
            .Select(p => p.Alias).Should().Equal("status");
    }

    [Fact]
    public void Reads_a_varying_property_for_the_requested_culture()
    {
        ContentType contentType = ContentTypeWith(ContentVariation.Culture, ("status", ContentVariation.Culture));
        var content = new Content("A", -1, contentType);
        content.SetCultureName("A", "en-US");
        content.SetCultureName("A", "da-DK");
        content.SetValue("status", "doing", "en-US");
        content.SetValue("status", "i gang", "da-DK");

        KanbanCardMapper.Map(content, ["status"], "da-DK", false).Properties.Single().Value
            .Should().Be("i gang");
    }

    [Fact]
    public void Reads_an_invariant_property_invariantly_even_when_a_culture_is_requested()
    {
        ContentType contentType = ContentTypeWith(ContentVariation.Culture, ("status", ContentVariation.Nothing));
        var content = new Content("A", -1, contentType);
        content.SetCultureName("A", "en-US");
        content.SetValue("status", "doing");

        KanbanCardMapper.Map(content, ["status"], "en-US", false).Properties.Single().Value
            .Should().Be("doing");
    }
}
```

The last two are the pair that matters: mixing a varying content type with an invariant property is the case that silently returns `null` if the mapper passes the culture down unconditionally.

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~KanbanCardMapperTests`
Expected: FAIL — `KanbanCardMapper` does not exist (compile error).

- [ ] **Step 3: Write the mapper**

`src/Umbraco.Community.Kanban/Services/KanbanCardMapper.cs`:

```csharp
using Umbraco.Cms.Core.Models;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// Projects a child document onto a card. Pure, so it is tested directly against
/// in-memory Content instances.
/// </summary>
public static class KanbanCardMapper
{
    public static KanbanCardModel Map(
        IContent content,
        IReadOnlyList<string> cardProperties,
        string? culture,
        bool canUpdate)
    {
        var variesByCulture = content.ContentType.Variations.HasFlag(ContentVariation.Culture);
        var effectiveCulture = variesByCulture ? culture : null;

        return new KanbanCardModel
        {
            Key = content.Key,
            Name = ResolveName(content, effectiveCulture),
            ContentTypeAlias = content.ContentType.Alias,
            Icon = content.ContentType.Icon,
            State = ResolveState(content, effectiveCulture),
            CanUpdate = canUpdate,
            Properties = MapProperties(content, cardProperties, effectiveCulture),
        };
    }

    private static string ResolveName(IContent content, string? culture) =>
        culture is null
            ? content.Name ?? string.Empty
            : content.GetCultureName(culture) ?? content.Name ?? string.Empty;

    private static string ResolveState(IContent content, string? culture) =>
        culture is null
            ? KanbanCardStateResolver.Resolve(content.Published, content.Edited)
            : KanbanCardStateResolver.Resolve(
                content.IsCulturePublished(culture),
                content.IsCultureEdited(culture));

    private static List<KanbanCardPropertyModel> MapProperties(
        IContent content,
        IReadOnlyList<string> cardProperties,
        string? culture)
    {
        var properties = new List<KanbanCardPropertyModel>(cardProperties.Count);

        foreach (var alias in cardProperties)
        {
            if (content.Properties.TryGetValue(alias, out IProperty? property) == false)
            {
                continue;
            }

            // A culture only applies where the property itself varies; an invariant
            // property on a varying document still stores its value under no culture.
            var propertyCulture = property.PropertyType.Variations.HasFlag(ContentVariation.Culture)
                ? culture
                : null;

            properties.Add(new KanbanCardPropertyModel
            {
                Alias = property.PropertyType.Alias,
                Name = property.PropertyType.Name,
                EditorAlias = property.PropertyType.PropertyEditorAlias,
                Value = content.GetValue(alias, propertyCulture),
            });
        }

        return properties;
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet build && dotnet test`
Expected: all pass, 8 new tests.

If `new Content(name, parentId, contentType)` or `new PropertyType(shortStringHelper, editorAlias, storageType, alias)` does not bind, check the real constructor overloads in the installed `Umbraco.Cms.Core` and adjust the **test helpers only** — the mapper's own API must not change to accommodate a constructor shape.

- [ ] **Step 5: Commit**

```bash
git add src/Umbraco.Community.Kanban/Services/KanbanCardMapper.cs tests/Umbraco.Community.Kanban.Tests/Services/KanbanCardMapperTests.cs
git commit -m "feat: add the card projection"
```

---

### Task 3: Board composition — grouping, per-lane paging and totals

**Files:**
- Create: `src/Umbraco.Community.Kanban/Services/KanbanBoardComposer.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Services/KanbanBoardComposerTests.cs`

**Interfaces:**
- Consumes: `KanbanBoardResponseModel`, `KanbanBoardLaneModel`, `KanbanCardModel` (Task 1); `KanbanLane` from `Umbraco.Community.Kanban.Models` (milestone 1).
- Produces:
  - `KanbanCardAssignment(string LaneValue, KanbanCardModel Card)` — a card paired with the raw lane value read off it.
  - `KanbanBoardComposerRequest(IReadOnlyList<KanbanLane> Lanes, IReadOnlyList<KanbanCardAssignment> Cards, int ChildCount, bool Truncated, int PageSize, string? Lane, int Skip)`.
  - `KanbanBoardComposer.Compose(KanbanBoardComposerRequest request)` → `KanbanBoardResponseModel`.

This is the heart of the milestone and entirely pure — no Umbraco types beyond `KanbanLane`. Rules:

- Cards are matched to lanes on `Value`, **case-insensitively**, matching the rest of the lane pipeline.
- A card whose lane value is empty, or matches no lane, goes to the lane with `IsUnassigned`. If the lane list somehow has no unassigned lane, those cards are dropped rather than throwing.
- Lanes come out in the order `IKanbanLaneResolver` produced them. Never re-sort: that order drives colour assignment.
- With `Lane` null: every lane, `Skip = 0`, first `PageSize` cards.
- With `Lane` set: only that lane, `Skip` and `PageSize` applied. The empty string addresses the unassigned lane. A `Lane` matching nothing yields an empty `Lanes` list.
- `Total` counts the cards assigned to that lane, and `TotalIsExact` is `Truncated == false`.

- [ ] **Step 1: Write the failing test**

`tests/Umbraco.Community.Kanban.Tests/Services/KanbanBoardComposerTests.cs`:

```csharp
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanBoardComposerTests
{
    private static KanbanLane Lane(string value) => new() { Value = value, Name = value };

    private static IReadOnlyList<KanbanLane> Lanes() =>
        [Lane("todo"), Lane("doing"), KanbanLane.Unassigned()];

    private static KanbanCardModel Card(string name) => new()
    {
        Key = Guid.NewGuid(),
        Name = name,
        ContentTypeAlias = "task",
        State = KanbanCardStates.Draft,
    };

    private static KanbanCardAssignment At(string laneValue, string name) => new(laneValue, Card(name));

    private static KanbanBoardComposerRequest Request(
        IReadOnlyList<KanbanCardAssignment> cards,
        int pageSize = 25,
        string? lane = null,
        int skip = 0,
        bool truncated = false,
        int childCount = 0) =>
        new(Lanes(), cards, childCount, truncated, pageSize, lane, skip);

    [Fact]
    public void Groups_cards_into_their_lane()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            Request([At("todo", "a"), At("doing", "b"), At("todo", "c")]));

        board.Lanes.Single(l => l.Value == "todo").Cards.Select(c => c.Name).Should().Equal("a", "c");
        board.Lanes.Single(l => l.Value == "doing").Cards.Select(c => c.Name).Should().Equal("b");
    }

    [Fact]
    public void Matches_lane_values_case_insensitively()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(Request([At("ToDo", "a")]));

        board.Lanes.Single(l => l.Value == "todo").Cards.Should().HaveCount(1);
    }

    [Fact]
    public void Sends_empty_and_unmatched_values_to_the_unassigned_lane()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            Request([At(string.Empty, "a"), At("archived", "b")]));

        board.Lanes.Single(l => l.IsUnassigned).Cards.Select(c => c.Name).Should().Equal("a", "b");
    }

    [Fact]
    public void Preserves_the_resolved_lane_order()
    {
        KanbanBoardComposer.Compose(Request([])).Lanes
            .Select(l => l.Value).Should().Equal("todo", "doing", string.Empty);
    }

    [Fact]
    public void Carries_lane_appearance_through()
    {
        var lanes = new List<KanbanLane>
        {
            new() { Value = "todo", Name = "To do", Colour = "blue", Icon = "icon-box", AcceptsDrops = true },
            KanbanLane.Unassigned(),
        };

        KanbanBoardLaneModel lane = KanbanBoardComposer
            .Compose(new KanbanBoardComposerRequest(lanes, [], 0, false, 25, null, 0))
            .Lanes[0];

        lane.Name.Should().Be("To do");
        lane.Colour.Should().Be("blue");
        lane.Icon.Should().Be("icon-box");
        lane.AcceptsDrops.Should().BeTrue();
        lane.IsUnassigned.Should().BeFalse();
    }

    [Fact]
    public void Pages_every_lane_to_the_page_size_on_an_initial_load()
    {
        IReadOnlyList<KanbanCardAssignment> cards =
            [At("todo", "a"), At("todo", "b"), At("todo", "c"), At("doing", "d")];

        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(Request(cards, pageSize: 2));

        KanbanBoardLaneModel todo = board.Lanes.Single(l => l.Value == "todo");
        todo.Cards.Select(c => c.Name).Should().Equal("a", "b");
        todo.Total.Should().Be(3);
        todo.Skip.Should().Be(0);
        board.Lanes.Single(l => l.Value == "doing").Cards.Should().HaveCount(1);
    }

    [Fact]
    public void Returns_only_the_requested_lane_when_one_is_named()
    {
        IReadOnlyList<KanbanCardAssignment> cards =
            [At("todo", "a"), At("todo", "b"), At("todo", "c"), At("doing", "d")];

        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            Request(cards, pageSize: 2, lane: "todo", skip: 2));

        board.Lanes.Should().HaveCount(1);
        KanbanBoardLaneModel todo = board.Lanes.Single();
        todo.Value.Should().Be("todo");
        todo.Cards.Select(c => c.Name).Should().Equal("c");
        todo.Skip.Should().Be(2);
        todo.Total.Should().Be(3);
    }

    [Fact]
    public void Addresses_the_unassigned_lane_with_the_empty_string()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            Request([At("archived", "a")], lane: string.Empty));

        board.Lanes.Single().IsUnassigned.Should().BeTrue();
        board.Lanes.Single().Cards.Should().HaveCount(1);
    }

    [Fact]
    public void Returns_no_lanes_when_the_requested_lane_does_not_exist()
    {
        KanbanBoardComposer.Compose(Request([At("todo", "a")], lane: "nope")).Lanes
            .Should().BeEmpty();
    }

    [Fact]
    public void Returns_an_empty_page_past_the_end_without_losing_the_total()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            Request([At("todo", "a")], pageSize: 25, lane: "todo", skip: 50));

        board.Lanes.Single().Cards.Should().BeEmpty();
        board.Lanes.Single().Total.Should().Be(1);
    }

    [Fact]
    public void Totals_are_exact_when_not_truncated()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            Request([At("todo", "a")], childCount: 1));

        board.Truncated.Should().BeFalse();
        board.ChildCount.Should().Be(1);
        board.Lanes.Should().OnlyContain(l => l.TotalIsExact);
    }

    [Fact]
    public void Every_total_becomes_a_lower_bound_once_truncated()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            Request([At("todo", "a")], truncated: true, childCount: 4000));

        board.Truncated.Should().BeTrue();
        board.ChildCount.Should().Be(4000);
        board.Lanes.Should().OnlyContain(l => l.TotalIsExact == false);
    }

    [Fact]
    public void Drops_unmatched_cards_when_there_is_no_unassigned_lane()
    {
        var lanes = new List<KanbanLane> { new() { Value = "todo", Name = "To do" } };

        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            new KanbanBoardComposerRequest(lanes, [At("archived", "a")], 1, false, 25, null, 0));

        board.Lanes.Single().Cards.Should().BeEmpty();
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~KanbanBoardComposerTests`
Expected: FAIL — `KanbanBoardComposer` does not exist (compile error).

- [ ] **Step 3: Write the composer**

`src/Umbraco.Community.Kanban/Services/KanbanBoardComposer.cs`:

```csharp
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

/// <summary>A card paired with the raw lane value read from its lane property.</summary>
public sealed record KanbanCardAssignment(string LaneValue, KanbanCardModel Card);

/// <param name="Lanes">The resolved lanes, in display order. Never re-sorted — this order drives lane colours.</param>
/// <param name="Cards">Every visible card, already permission-filtered.</param>
/// <param name="ChildCount">The parent's true child count, even when truncated.</param>
/// <param name="Truncated">True when more children exist than were read.</param>
/// <param name="PageSize">Cards per lane page.</param>
/// <param name="Lane">The single lane to return, or null for every lane. The empty string means the unassigned lane.</param>
/// <param name="Skip">Cards to skip within <paramref name="Lane" />. Ignored when Lane is null.</param>
public sealed record KanbanBoardComposerRequest(
    IReadOnlyList<KanbanLane> Lanes,
    IReadOnlyList<KanbanCardAssignment> Cards,
    int ChildCount,
    bool Truncated,
    int PageSize,
    string? Lane,
    int Skip);

/// <summary>
/// Groups cards into lanes and pages each lane independently. Pure — every input is a
/// plain model, which is what makes the paging and total arithmetic directly testable.
/// </summary>
public static class KanbanBoardComposer
{
    public static KanbanBoardResponseModel Compose(KanbanBoardComposerRequest request)
    {
        Dictionary<string, List<KanbanCardModel>> grouped = Group(request.Lanes, request.Cards);

        IEnumerable<KanbanLane> lanes = request.Lane is null
            ? request.Lanes
            : request.Lanes.Where(lane => Matches(lane, request.Lane));

        var skip = request.Lane is null ? 0 : Math.Max(0, request.Skip);

        return new KanbanBoardResponseModel
        {
            Truncated = request.Truncated,
            ChildCount = request.ChildCount,
            Lanes = lanes
                .Select(lane => Project(lane, grouped[lane.Value], skip, request.PageSize, request.Truncated))
                .ToList(),
        };
    }

    private static bool Matches(KanbanLane lane, string requested) =>
        string.Equals(lane.Value, requested, StringComparison.OrdinalIgnoreCase);

    private static Dictionary<string, List<KanbanCardModel>> Group(
        IReadOnlyList<KanbanLane> lanes,
        IReadOnlyList<KanbanCardAssignment> cards)
    {
        var grouped = new Dictionary<string, List<KanbanCardModel>>();

        foreach (KanbanLane lane in lanes)
        {
            // Duplicate lane values are possible from editor-authored data; the first wins,
            // as it does everywhere else in the lane pipeline.
            grouped.TryAdd(lane.Value, []);
        }

        KanbanLane? unassigned = lanes.FirstOrDefault(lane => lane.IsUnassigned);

        foreach (KanbanCardAssignment assignment in cards)
        {
            KanbanLane? target = string.IsNullOrEmpty(assignment.LaneValue)
                ? unassigned
                : lanes.FirstOrDefault(lane => Matches(lane, assignment.LaneValue)) ?? unassigned;

            if (target is not null)
            {
                grouped[target.Value].Add(assignment.Card);
            }
        }

        return grouped;
    }

    private static KanbanBoardLaneModel Project(
        KanbanLane lane,
        List<KanbanCardModel> cards,
        int skip,
        int pageSize,
        bool truncated) =>
        new()
        {
            Value = lane.Value,
            Name = lane.Name,
            Colour = lane.Colour,
            Icon = lane.Icon,
            IsUnassigned = lane.IsUnassigned,
            AcceptsDrops = lane.AcceptsDrops,
            Total = cards.Count,
            TotalIsExact = truncated == false,
            Skip = skip,
            Cards = cards.Skip(skip).Take(pageSize).ToList(),
        };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet build && dotnet test`
Expected: all pass, 13 new tests.

- [ ] **Step 5: Commit**

```bash
git add src/Umbraco.Community.Kanban/Services/KanbanBoardComposer.cs tests/Umbraco.Community.Kanban.Tests/Services/KanbanBoardComposerTests.cs
git commit -m "feat: add board composition with per-lane paging"
```

---

### Task 4: Content type lookup and lane content type resolution

**Files:**
- Create: `src/Umbraco.Community.Kanban/Services/IKanbanContentTypeLookup.cs`
- Create: `src/Umbraco.Community.Kanban/Services/KanbanContentTypeLookup.cs`
- Create: `src/Umbraco.Community.Kanban/Services/IKanbanLaneContentTypeResolver.cs`
- Create: `src/Umbraco.Community.Kanban/Services/KanbanLaneContentTypeResolver.cs`
- Create: `tests/Umbraco.Community.Kanban.Tests/Fakes/FakeKanbanContentTypeLookup.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Services/KanbanLaneContentTypeResolverTests.cs`

**Interfaces:**
- Consumes: nothing from earlier tasks in this plan.
- Produces:
  - `IKanbanContentTypeLookup` with `Task<IReadOnlyList<Guid>> GetAllowedChildKeysAsync(Guid contentTypeKey)` and `Task<bool> HasPropertyAsync(Guid contentTypeKey, string propertyAlias)`.
  - `IKanbanLaneContentTypeResolver` with `Task<Guid> ResolveAsync(Guid parentContentTypeKey, string? laneProperty)`.
  - `FakeKanbanContentTypeLookup` in `tests/.../Fakes/`, reused by Task 6.

`IKanbanLaneResolver.ResolveAsync` (milestone 1) needs a content type key, because a dropdown-backed lane source reads its options from the lane property's data type. That key is the **child** content type — the lane property lives on the cards, not the parent. A parent may allow several child types, so the choice is the first allowed child content type declaring a property with the configured `laneProperty` alias.

Deliberately not "the content type of the first child": that would make the lane set depend on which documents happen to exist, so an empty parent would render no columns and adding the first card would change the board's shape.

`IKanbanContentTypeLookup` exists because `IContentTypeService` has dozens of members and cannot be instantiated without persistence infrastructure this test project lacks. Milestone 1 established this wrapper pattern with `IKanbanPropertyDataTypeLookup` — follow it.

- [ ] **Step 1: Write the fake**

`tests/Umbraco.Community.Kanban.Tests/Fakes/FakeKanbanContentTypeLookup.cs`:

```csharp
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Fakes;

internal sealed class FakeKanbanContentTypeLookup : IKanbanContentTypeLookup
{
    /// <summary>Parent content type key to its allowed child content type keys, in order.</summary>
    public Dictionary<Guid, List<Guid>> AllowedChildren { get; } = [];

    /// <summary>Content type key to the property aliases it declares.</summary>
    public Dictionary<Guid, List<string>> Properties { get; } = [];

    /// <summary>Every property check made, so a test can assert the search stopped early.</summary>
    public List<(Guid ContentTypeKey, string Alias)> PropertyChecks { get; } = [];

    public Task<IReadOnlyList<Guid>> GetAllowedChildKeysAsync(Guid contentTypeKey) =>
        Task.FromResult<IReadOnlyList<Guid>>(
            AllowedChildren.TryGetValue(contentTypeKey, out List<Guid>? children) ? children : []);

    public Task<bool> HasPropertyAsync(Guid contentTypeKey, string propertyAlias)
    {
        PropertyChecks.Add((contentTypeKey, propertyAlias));

        return Task.FromResult(
            Properties.TryGetValue(contentTypeKey, out List<string>? aliases)
            && aliases.Contains(propertyAlias, StringComparer.OrdinalIgnoreCase));
    }
}
```

- [ ] **Step 2: Write the failing test**

`tests/Umbraco.Community.Kanban.Tests/Services/KanbanLaneContentTypeResolverTests.cs`:

```csharp
using Umbraco.Community.Kanban.Services;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanLaneContentTypeResolverTests
{
    private static readonly Guid Parent = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Task = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid Note = Guid.Parse("33333333-3333-3333-3333-333333333333");

    private static (KanbanLaneContentTypeResolver Resolver, FakeKanbanContentTypeLookup Lookup) Subject()
    {
        var lookup = new FakeKanbanContentTypeLookup();
        return (new KanbanLaneContentTypeResolver(lookup), lookup);
    }

    [Fact]
    public async Task Returns_the_only_allowed_child_declaring_the_lane_property()
    {
        (KanbanLaneContentTypeResolver resolver, FakeKanbanContentTypeLookup lookup) = Subject();
        lookup.AllowedChildren[Parent] = [Note, Task];
        lookup.Properties[Task] = ["status"];

        (await resolver.ResolveAsync(Parent, "status")).Should().Be(Task);
    }

    [Fact]
    public async Task Prefers_the_first_allowed_child_that_declares_it()
    {
        (KanbanLaneContentTypeResolver resolver, FakeKanbanContentTypeLookup lookup) = Subject();
        lookup.AllowedChildren[Parent] = [Note, Task];
        lookup.Properties[Note] = ["status"];
        lookup.Properties[Task] = ["status"];

        (await resolver.ResolveAsync(Parent, "status")).Should().Be(Note);
        lookup.PropertyChecks.Should().ContainSingle("the search must stop at the first match");
    }

    [Fact]
    public async Task Matches_the_alias_case_insensitively()
    {
        (KanbanLaneContentTypeResolver resolver, FakeKanbanContentTypeLookup lookup) = Subject();
        lookup.AllowedChildren[Parent] = [Task];
        lookup.Properties[Task] = ["Status"];

        (await resolver.ResolveAsync(Parent, "status")).Should().Be(Task);
    }

    [Fact]
    public async Task Returns_empty_when_no_allowed_child_declares_the_property()
    {
        (KanbanLaneContentTypeResolver resolver, FakeKanbanContentTypeLookup lookup) = Subject();
        lookup.AllowedChildren[Parent] = [Note, Task];

        (await resolver.ResolveAsync(Parent, "status")).Should().Be(Guid.Empty);
    }

    [Fact]
    public async Task Returns_empty_when_the_parent_allows_no_children()
    {
        (KanbanLaneContentTypeResolver resolver, _) = Subject();

        (await resolver.ResolveAsync(Parent, "status")).Should().Be(Guid.Empty);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Returns_empty_without_looking_anything_up_when_there_is_no_lane_property(string? laneProperty)
    {
        (KanbanLaneContentTypeResolver resolver, FakeKanbanContentTypeLookup lookup) = Subject();
        lookup.AllowedChildren[Parent] = [Task];
        lookup.Properties[Task] = ["status"];

        (await resolver.ResolveAsync(Parent, laneProperty)).Should().Be(Guid.Empty);
        lookup.PropertyChecks.Should().BeEmpty();
    }
}
```

The last case is the manual-lanes configuration: there is no lane property to match, so there is nothing to look up and the resolver must not pick an arbitrary content type.

- [ ] **Step 3: Run the test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~KanbanLaneContentTypeResolverTests`
Expected: FAIL — `IKanbanContentTypeLookup` and `KanbanLaneContentTypeResolver` do not exist (compile error).

- [ ] **Step 4: Write the lookup interface and implementation**

`src/Umbraco.Community.Kanban/Services/IKanbanContentTypeLookup.cs`:

```csharp
namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// The narrow slice of IContentTypeService the board needs. Exists so the callers can be
/// tested against a hand-written fake — IContentTypeService has dozens of members and
/// cannot be constructed without persistence infrastructure.
/// </summary>
public interface IKanbanContentTypeLookup
{
    /// <summary>
    /// The keys of the content types allowed as children of the given content type, in the
    /// order the content type declares them. Empty when the content type is unknown or
    /// allows no children.
    /// </summary>
    Task<IReadOnlyList<Guid>> GetAllowedChildKeysAsync(Guid contentTypeKey);

    /// <summary>
    /// True when the content type declares a property with this alias, including properties
    /// inherited through composition. Case-insensitive.
    /// </summary>
    Task<bool> HasPropertyAsync(Guid contentTypeKey, string propertyAlias);
}
```

`src/Umbraco.Community.Kanban/Services/KanbanContentTypeLookup.cs`:

```csharp
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.Kanban.Services;

/// <inheritdoc />
public sealed class KanbanContentTypeLookup(IContentTypeService contentTypeService) : IKanbanContentTypeLookup
{
    public async Task<IReadOnlyList<Guid>> GetAllowedChildKeysAsync(Guid contentTypeKey)
    {
        IContentType? contentType = await contentTypeService.GetAsync(contentTypeKey);

        return contentType?.AllowedContentTypes?
            .OrderBy(allowed => allowed.SortOrder)
            .Select(allowed => allowed.Key)
            .ToList() ?? [];
    }

    public async Task<bool> HasPropertyAsync(Guid contentTypeKey, string propertyAlias)
    {
        IContentType? contentType = await contentTypeService.GetAsync(contentTypeKey);

        // CompositionPropertyTypes rather than PropertyTypes: a lane property is very often
        // inherited from a composition rather than declared on the child type itself.
        return contentType?.CompositionPropertyTypes
            .Any(property => string.Equals(property.Alias, propertyAlias, StringComparison.OrdinalIgnoreCase))
            ?? false;
    }
}
```

- [ ] **Step 5: Write the resolver**

`src/Umbraco.Community.Kanban/Services/IKanbanLaneContentTypeResolver.cs`:

```csharp
namespace Umbraco.Community.Kanban.Services;

public interface IKanbanLaneContentTypeResolver
{
    /// <summary>
    /// The child content type key a board's lanes resolve against, or <see cref="Guid.Empty" />
    /// when the configuration has no lane property or no allowed child declares it. Empty is
    /// not a failure: a manual-lanes configuration needs no content type at all.
    /// </summary>
    Task<Guid> ResolveAsync(Guid parentContentTypeKey, string? laneProperty);
}
```

`src/Umbraco.Community.Kanban/Services/KanbanLaneContentTypeResolver.cs`:

```csharp
namespace Umbraco.Community.Kanban.Services;

/// <inheritdoc />
public sealed class KanbanLaneContentTypeResolver(IKanbanContentTypeLookup contentTypeLookup)
    : IKanbanLaneContentTypeResolver
{
    public async Task<Guid> ResolveAsync(Guid parentContentTypeKey, string? laneProperty)
    {
        if (string.IsNullOrWhiteSpace(laneProperty))
        {
            return Guid.Empty;
        }

        IReadOnlyList<Guid> allowed = await contentTypeLookup.GetAllowedChildKeysAsync(parentContentTypeKey);

        foreach (Guid key in allowed)
        {
            if (await contentTypeLookup.HasPropertyAsync(key, laneProperty))
            {
                return key;
            }
        }

        return Guid.Empty;
    }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet build && dotnet test`
Expected: all pass, 8 new tests (three of them from the `[Theory]`).

- [ ] **Step 7: Commit**

```bash
git add src/Umbraco.Community.Kanban/Services tests/Umbraco.Community.Kanban.Tests
git commit -m "feat: resolve which child content type a board's lanes come from"
```

---

### Task 5: Board configuration resolution

**Files:**
- Create: `src/Umbraco.Community.Kanban/Services/KanbanConfigurationValueReader.cs`
- Create: `src/Umbraco.Community.Kanban/Services/IKanbanDataTypeConfigurationLookup.cs`
- Create: `src/Umbraco.Community.Kanban/Services/KanbanDataTypeConfigurationLookup.cs`
- Create: `src/Umbraco.Community.Kanban/Services/IKanbanBoardConfigurationResolver.cs`
- Create: `src/Umbraco.Community.Kanban/Services/KanbanBoardConfigurationResolver.cs`
- Create: `tests/Umbraco.Community.Kanban.Tests/Fakes/FakeKanbanDataTypeConfigurationLookup.cs`
- Create: `tests/Umbraco.Community.Kanban.Tests/Fakes/FakeKanbanConfigurationService.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Services/KanbanConfigurationValueReaderTests.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Services/KanbanBoardConfigurationResolverTests.cs`

**Interfaces:**
- Consumes: `Constants.BoardConfigIdKey` (Task 1); `IKanbanConfigurationService.GetBoardConfigurationAsync(Guid)` and `KanbanBoardConfiguration` (milestone 1).
- Produces:
  - `KanbanConfigurationValueReader.ReadGuid(IDictionary<string, object> configurationData, string key)` → `Guid?`.
  - `IKanbanDataTypeConfigurationLookup` with `Task<Guid?> GetGuidAsync(Guid dataTypeKey, string configurationKey)`.
  - `KanbanBoardConfigurationStatus` — `Success`, `NotConfigured`, `ConfigurationNotFound`.
  - `KanbanBoardConfigurationResult(KanbanBoardConfigurationStatus Status, Guid ConfigurationKey, KanbanBoardConfiguration? Configuration)` with static factories `Success`, `NotConfigured`, `NotFound`.
  - `IKanbanBoardConfigurationResolver` with `Task<KanbanBoardConfigurationResult> ResolveAsync(Guid? configId, Guid? listViewKey)`.
  - `FakeKanbanDataTypeConfigurationLookup` and `FakeKanbanConfigurationService`, reused by Task 6.

This is the spec's §2 chain: a `configId` supplied by the caller wins outright; otherwise the parent's `ListView` (collection) data type is read for `kanban.boardConfigId`.

The reader is separate and pure because the stored value's CLR type depends on how it got there. `IDataType.ConfigurationData` is `IDictionary<string, object>` deserialised by `System.Text.Json` with no converter registered for `object`, so a saved GUID arrives as a **`JsonElement`** — but a value set programmatically in the same process may still be a `string` or a `Guid`. All three must work.

- [ ] **Step 1: Write the failing reader test**

`tests/Umbraco.Community.Kanban.Tests/Services/KanbanConfigurationValueReaderTests.cs`:

```csharp
using System.Text.Json;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanConfigurationValueReaderTests
{
    private const string Key = "kanban.boardConfigId";
    private static readonly Guid Expected = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    private static IDictionary<string, object> FromJson(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, object>>(json)!;

    [Fact]
    public void Reads_a_guid_stored_as_json_which_is_how_a_saved_data_type_arrives()
    {
        IDictionary<string, object> data = FromJson($"{{\"{Key}\":\"{Expected}\"}}");

        KanbanConfigurationValueReader.ReadGuid(data, Key).Should().Be(Expected);
    }

    [Fact]
    public void Reads_a_guid_stored_as_a_plain_string()
    {
        var data = new Dictionary<string, object> { [Key] = Expected.ToString() };

        KanbanConfigurationValueReader.ReadGuid(data, Key).Should().Be(Expected);
    }

    [Fact]
    public void Reads_a_guid_stored_as_a_guid()
    {
        var data = new Dictionary<string, object> { [Key] = Expected };

        KanbanConfigurationValueReader.ReadGuid(data, Key).Should().Be(Expected);
    }

    [Fact]
    public void Returns_null_when_the_key_is_absent() =>
        KanbanConfigurationValueReader.ReadGuid(new Dictionary<string, object>(), Key)
            .Should().BeNull();

    [Fact]
    public void Returns_null_for_an_empty_string()
    {
        var data = new Dictionary<string, object> { [Key] = string.Empty };

        KanbanConfigurationValueReader.ReadGuid(data, Key).Should().BeNull();
    }

    [Fact]
    public void Returns_null_for_a_value_that_is_not_a_guid()
    {
        IDictionary<string, object> data = FromJson($"{{\"{Key}\":\"not-a-guid\"}}");

        KanbanConfigurationValueReader.ReadGuid(data, Key).Should().BeNull();
    }

    [Fact]
    public void Returns_null_for_a_json_value_of_the_wrong_kind()
    {
        IDictionary<string, object> data = FromJson($"{{\"{Key}\":42}}");

        KanbanConfigurationValueReader.ReadGuid(data, Key).Should().BeNull();
    }

    [Fact]
    public void Returns_null_for_an_empty_guid_because_it_names_nothing()
    {
        var data = new Dictionary<string, object> { [Key] = Guid.Empty };

        KanbanConfigurationValueReader.ReadGuid(data, Key).Should().BeNull();
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~KanbanConfigurationValueReaderTests`
Expected: FAIL — `KanbanConfigurationValueReader` does not exist (compile error).

- [ ] **Step 3: Write the reader**

`src/Umbraco.Community.Kanban/Services/KanbanConfigurationValueReader.cs`:

```csharp
using System.Text.Json;

namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// Reads extra values out of a data type's configuration dictionary. Umbraco keeps unknown
/// aliases on save but gives no typed access to them, and the CLR type depends on how the
/// value arrived: System.Text.Json deserialises into JsonElement, while a value set in the
/// same process may still be a string or a Guid. Pure, so every shape is directly tested.
/// </summary>
public static class KanbanConfigurationValueReader
{
    public static Guid? ReadGuid(IDictionary<string, object> configurationData, string key)
    {
        if (configurationData.TryGetValue(key, out var raw) == false || raw is null)
        {
            return null;
        }

        Guid? parsed = raw switch
        {
            Guid guid => guid,
            string text when Guid.TryParse(text, out Guid fromText) => fromText,
            JsonElement { ValueKind: JsonValueKind.String } element when element.TryGetGuid(out Guid fromJson) => fromJson,
            _ => null,
        };

        // Guid.Empty names no data type, so treat it as absent rather than as a broken reference.
        return parsed == Guid.Empty ? null : parsed;
    }
}
```

- [ ] **Step 4: Write the fakes**

`tests/Umbraco.Community.Kanban.Tests/Fakes/FakeKanbanDataTypeConfigurationLookup.cs`:

```csharp
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Fakes;

internal sealed class FakeKanbanDataTypeConfigurationLookup : IKanbanDataTypeConfigurationLookup
{
    /// <summary>Data type key and configuration key to the GUID stored there.</summary>
    public Dictionary<(Guid DataTypeKey, string ConfigurationKey), Guid> Values { get; } = [];

    public Task<Guid?> GetGuidAsync(Guid dataTypeKey, string configurationKey) =>
        Task.FromResult(Values.TryGetValue((dataTypeKey, configurationKey), out Guid value) ? value : (Guid?)null);
}
```

`tests/Umbraco.Community.Kanban.Tests/Fakes/FakeKanbanConfigurationService.cs`:

```csharp
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Fakes;

internal sealed class FakeKanbanConfigurationService : IKanbanConfigurationService
{
    public Dictionary<Guid, KanbanBoardConfiguration> BoardConfigurations { get; } = [];

    public List<KanbanConfigurationResponseModel> All { get; } = [];

    public Task<IReadOnlyList<KanbanConfigurationResponseModel>> GetAllAsync() =>
        Task.FromResult<IReadOnlyList<KanbanConfigurationResponseModel>>(All);

    public Task<KanbanBoardConfiguration?> GetBoardConfigurationAsync(Guid key) =>
        Task.FromResult(BoardConfigurations.TryGetValue(key, out KanbanBoardConfiguration? configuration)
            ? configuration
            : null);
}
```

- [ ] **Step 5: Write the failing resolver test**

`tests/Umbraco.Community.Kanban.Tests/Services/KanbanBoardConfigurationResolverTests.cs`:

```csharp
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Services;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanBoardConfigurationResolverTests
{
    private static readonly Guid ListView = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid BoardConfig = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static (KanbanBoardConfigurationResolver Resolver,
        FakeKanbanDataTypeConfigurationLookup DataTypes,
        FakeKanbanConfigurationService Configurations) Subject()
    {
        var dataTypes = new FakeKanbanDataTypeConfigurationLookup();
        var configurations = new FakeKanbanConfigurationService();
        return (new KanbanBoardConfigurationResolver(dataTypes, configurations), dataTypes, configurations);
    }

    [Fact]
    public async Task Uses_an_explicit_config_id_without_touching_the_list_view()
    {
        (KanbanBoardConfigurationResolver resolver, FakeKanbanDataTypeConfigurationLookup dataTypes,
            FakeKanbanConfigurationService configurations) = Subject();
        var configuration = new KanbanBoardConfiguration { LaneProperty = "status" };
        configurations.BoardConfigurations[BoardConfig] = configuration;

        KanbanBoardConfigurationResult result = await resolver.ResolveAsync(BoardConfig, ListView);

        result.Status.Should().Be(KanbanBoardConfigurationStatus.Success);
        result.ConfigurationKey.Should().Be(BoardConfig);
        result.Configuration.Should().BeSameAs(configuration);
        dataTypes.Values.Should().BeEmpty("nothing should have been read from the list view");
    }

    [Fact]
    public async Task Reports_not_found_when_an_explicit_config_id_is_not_a_board()
    {
        (KanbanBoardConfigurationResolver resolver, _, _) = Subject();

        KanbanBoardConfigurationResult result = await resolver.ResolveAsync(BoardConfig, ListView);

        result.Status.Should().Be(KanbanBoardConfigurationStatus.ConfigurationNotFound);
        result.ConfigurationKey.Should().Be(BoardConfig);
        result.Configuration.Should().BeNull();
    }

    [Fact]
    public async Task Resolves_through_the_list_view_when_no_config_id_is_given()
    {
        (KanbanBoardConfigurationResolver resolver, FakeKanbanDataTypeConfigurationLookup dataTypes,
            FakeKanbanConfigurationService configurations) = Subject();
        dataTypes.Values[(ListView, Constants.BoardConfigIdKey)] = BoardConfig;
        var configuration = new KanbanBoardConfiguration();
        configurations.BoardConfigurations[BoardConfig] = configuration;

        KanbanBoardConfigurationResult result = await resolver.ResolveAsync(null, ListView);

        result.Status.Should().Be(KanbanBoardConfigurationStatus.Success);
        result.ConfigurationKey.Should().Be(BoardConfig);
        result.Configuration.Should().BeSameAs(configuration);
    }

    [Fact]
    public async Task Reports_not_configured_when_the_content_type_has_no_list_view()
    {
        (KanbanBoardConfigurationResolver resolver, _, _) = Subject();

        (await resolver.ResolveAsync(null, null)).Status
            .Should().Be(KanbanBoardConfigurationStatus.NotConfigured);
    }

    [Fact]
    public async Task Reports_not_configured_when_the_list_view_names_no_board()
    {
        (KanbanBoardConfigurationResolver resolver, _, _) = Subject();

        (await resolver.ResolveAsync(null, ListView)).Status
            .Should().Be(KanbanBoardConfigurationStatus.NotConfigured);
    }

    [Fact]
    public async Task Reports_not_found_when_the_named_board_has_been_deleted()
    {
        (KanbanBoardConfigurationResolver resolver, FakeKanbanDataTypeConfigurationLookup dataTypes, _) = Subject();
        dataTypes.Values[(ListView, Constants.BoardConfigIdKey)] = BoardConfig;

        KanbanBoardConfigurationResult result = await resolver.ResolveAsync(null, ListView);

        result.Status.Should().Be(KanbanBoardConfigurationStatus.ConfigurationNotFound);
        result.ConfigurationKey.Should().Be(BoardConfig);
    }
}
```

The distinction the last two pin: "you have not set this up yet" and "what you set up has been deleted" are different problems, and an editor needs to be told which.

- [ ] **Step 6: Run it to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~KanbanBoardConfigurationResolverTests`
Expected: FAIL — `IKanbanDataTypeConfigurationLookup` and `KanbanBoardConfigurationResolver` do not exist (compile error).

- [ ] **Step 7: Write the data type lookup**

`src/Umbraco.Community.Kanban/Services/IKanbanDataTypeConfigurationLookup.cs`:

```csharp
namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// Reads a single extra configuration value off a data type. The narrow slice of
/// IDataTypeService the board needs, so its callers are testable with a hand-written fake.
/// </summary>
public interface IKanbanDataTypeConfigurationLookup
{
    /// <summary>
    /// The GUID stored under <paramref name="configurationKey" /> on the given data type,
    /// or null when the data type is missing, the key is absent, or the value is not a
    /// usable GUID.
    /// </summary>
    Task<Guid?> GetGuidAsync(Guid dataTypeKey, string configurationKey);
}
```

`src/Umbraco.Community.Kanban/Services/KanbanDataTypeConfigurationLookup.cs`:

```csharp
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.Kanban.Services;

/// <inheritdoc />
public sealed class KanbanDataTypeConfigurationLookup(IDataTypeService dataTypeService)
    : IKanbanDataTypeConfigurationLookup
{
    public async Task<Guid?> GetGuidAsync(Guid dataTypeKey, string configurationKey)
    {
        IDataType? dataType = await dataTypeService.GetAsync(dataTypeKey);

        return dataType is null
            ? null
            : KanbanConfigurationValueReader.ReadGuid(dataType.ConfigurationData, configurationKey);
    }
}
```

- [ ] **Step 8: Write the resolver**

`src/Umbraco.Community.Kanban/Services/IKanbanBoardConfigurationResolver.cs`:

```csharp
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Services;

public enum KanbanBoardConfigurationStatus
{
    Success,

    /// <summary>No Kanban configuration has been chosen for this collection yet.</summary>
    NotConfigured,

    /// <summary>A configuration was named, but it is missing or is not a Kanban Board.</summary>
    ConfigurationNotFound,
}

/// <param name="ConfigurationKey">The configuration that was named, where one was. <see cref="Guid.Empty" /> otherwise.</param>
public sealed record KanbanBoardConfigurationResult(
    KanbanBoardConfigurationStatus Status,
    Guid ConfigurationKey,
    KanbanBoardConfiguration? Configuration)
{
    public static KanbanBoardConfigurationResult Success(Guid key, KanbanBoardConfiguration configuration) =>
        new(KanbanBoardConfigurationStatus.Success, key, configuration);

    public static KanbanBoardConfigurationResult NotConfigured() =>
        new(KanbanBoardConfigurationStatus.NotConfigured, Guid.Empty, null);

    public static KanbanBoardConfigurationResult NotFound(Guid key) =>
        new(KanbanBoardConfigurationStatus.ConfigurationNotFound, key, null);
}

public interface IKanbanBoardConfigurationResolver
{
    /// <summary>
    /// Finds the board configuration to render. An explicit <paramref name="configId" /> wins;
    /// otherwise the parent's collection (list view) data type is read for
    /// <see cref="Constants.BoardConfigIdKey" />.
    /// </summary>
    Task<KanbanBoardConfigurationResult> ResolveAsync(Guid? configId, Guid? listViewKey);
}
```

`src/Umbraco.Community.Kanban/Services/KanbanBoardConfigurationResolver.cs`:

```csharp
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Services;

/// <inheritdoc />
public sealed class KanbanBoardConfigurationResolver(
    IKanbanDataTypeConfigurationLookup dataTypeConfigurationLookup,
    IKanbanConfigurationService configurationService) : IKanbanBoardConfigurationResolver
{
    public async Task<KanbanBoardConfigurationResult> ResolveAsync(Guid? configId, Guid? listViewKey)
    {
        if (configId.HasValue)
        {
            return await LoadAsync(configId.Value);
        }

        if (listViewKey.HasValue == false)
        {
            return KanbanBoardConfigurationResult.NotConfigured();
        }

        Guid? boardKey = await dataTypeConfigurationLookup.GetGuidAsync(
            listViewKey.Value,
            Constants.BoardConfigIdKey);

        return boardKey.HasValue
            ? await LoadAsync(boardKey.Value)
            : KanbanBoardConfigurationResult.NotConfigured();
    }

    private async Task<KanbanBoardConfigurationResult> LoadAsync(Guid key)
    {
        KanbanBoardConfiguration? configuration = await configurationService.GetBoardConfigurationAsync(key);

        return configuration is null
            ? KanbanBoardConfigurationResult.NotFound(key)
            : KanbanBoardConfigurationResult.Success(key, configuration);
    }
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `dotnet build && dotnet test`
Expected: all pass, 14 new tests.

- [ ] **Step 10: Commit**

```bash
git add src/Umbraco.Community.Kanban/Services tests/Umbraco.Community.Kanban.Tests
git commit -m "feat: resolve a collection's board configuration"
```

---

### Task 6: Lane value reading and the content loader

**Files:**
- Create: `src/Umbraco.Community.Kanban/Services/KanbanLaneValueReader.cs`
- Create: `src/Umbraco.Community.Kanban/Services/IKanbanContentLoader.cs`
- Create: `src/Umbraco.Community.Kanban/Services/KanbanContentLoader.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Services/KanbanLaneValueReaderTests.cs`

**Interfaces:**
- Consumes: nothing from earlier tasks in this plan.
- Produces:
  - `KanbanLaneValueReader.Read(IContent content, string? laneProperty, string? culture)` → `string` (never null; the empty string means unassigned).
  - `KanbanChildPage(IReadOnlyList<IContent> Children, int TotalChildCount)`.
  - `IKanbanContentLoader` with `IContent? GetById(Guid key)` and `KanbanChildPage GetChildren(int parentId, int cap)`.

Two small pieces the board service needs. The reader is pure and tested; the loader is a passthrough over `IContentService` with no logic of its own, so it has no test — it exists purely as a fakeable seam, because `IContentService` cannot be hand-faked or constructed in a unit test.

The reader's culture rule is the same one the card mapper uses: a culture applies only where both the content type and the property vary by culture.

- [ ] **Step 1: Write the failing test**

`tests/Umbraco.Community.Kanban.Tests/Services/KanbanLaneValueReaderTests.cs`:

```csharp
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Services;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanLaneValueReaderTests
{
    private static readonly FakeShortStringHelper ShortStrings = new();

    private static Content Content(ContentVariation contentVariations, ContentVariation propertyVariations)
    {
        var contentType = new ContentType(ShortStrings, -1)
        {
            Alias = "task",
            Name = "Task",
            Variations = contentVariations,
        };

        contentType.AddPropertyType(new PropertyType(ShortStrings, "Umbraco.TextBox", ValueStorageType.Nvarchar, "status")
        {
            Name = "Status",
            Variations = propertyVariations,
        });

        return new Content("A", -1, contentType);
    }

    [Fact]
    public void Reads_an_invariant_lane_value()
    {
        Content content = Content(ContentVariation.Nothing, ContentVariation.Nothing);
        content.SetValue("status", "doing");

        KanbanLaneValueReader.Read(content, "status", null).Should().Be("doing");
    }

    [Fact]
    public void Reads_a_varying_lane_value_for_the_requested_culture()
    {
        Content content = Content(ContentVariation.Culture, ContentVariation.Culture);
        content.SetCultureName("A", "en-US");
        content.SetCultureName("A", "da-DK");
        content.SetValue("status", "doing", "en-US");
        content.SetValue("status", "i gang", "da-DK");

        KanbanLaneValueReader.Read(content, "status", "da-DK").Should().Be("i gang");
    }

    [Fact]
    public void Ignores_the_culture_for_an_invariant_property()
    {
        Content content = Content(ContentVariation.Culture, ContentVariation.Nothing);
        content.SetCultureName("A", "en-US");
        content.SetValue("status", "doing");

        KanbanLaneValueReader.Read(content, "status", "en-US").Should().Be("doing");
    }

    [Fact]
    public void Returns_empty_when_the_value_is_not_set()
    {
        Content content = Content(ContentVariation.Nothing, ContentVariation.Nothing);

        KanbanLaneValueReader.Read(content, "status", null).Should().BeEmpty();
    }

    [Fact]
    public void Returns_empty_when_the_property_does_not_exist()
    {
        Content content = Content(ContentVariation.Nothing, ContentVariation.Nothing);

        KanbanLaneValueReader.Read(content, "nope", null).Should().BeEmpty();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void Returns_empty_when_there_is_no_lane_property_configured(string? laneProperty)
    {
        Content content = Content(ContentVariation.Nothing, ContentVariation.Nothing);
        content.SetValue("status", "doing");

        KanbanLaneValueReader.Read(content, laneProperty, null).Should().BeEmpty();
    }

    [Fact]
    public void Stringifies_a_non_string_value()
    {
        Content content = Content(ContentVariation.Nothing, ContentVariation.Nothing);
        content.SetValue("status", 3);

        KanbanLaneValueReader.Read(content, "status", null).Should().Be("3");
    }
}
```

The manual-lanes case matters: with no `laneProperty` every card reads empty and lands in the unassigned lane, which is correct — a manual board with no lane property has nothing to group by.

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~KanbanLaneValueReaderTests`
Expected: FAIL — `KanbanLaneValueReader` does not exist (compile error).

- [ ] **Step 3: Write the reader**

`src/Umbraco.Community.Kanban/Services/KanbanLaneValueReader.cs`:

```csharp
using System.Globalization;
using Umbraco.Cms.Core.Models;

namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// Reads the raw lane value off a child document. Pure, so the culture rules are directly
/// tested. Never returns null: the empty string is a meaningful value here — it means the
/// card belongs in the unassigned lane.
/// </summary>
public static class KanbanLaneValueReader
{
    public static string Read(IContent content, string? laneProperty, string? culture)
    {
        if (string.IsNullOrWhiteSpace(laneProperty)
            || content.Properties.TryGetValue(laneProperty, out IProperty? property) == false)
        {
            return string.Empty;
        }

        // A culture applies only where both the document and the property vary by it.
        var propertyCulture =
            content.ContentType.Variations.HasFlag(ContentVariation.Culture)
            && property.PropertyType.Variations.HasFlag(ContentVariation.Culture)
                ? culture
                : null;

        var value = content.GetValue(laneProperty, propertyCulture);

        return value switch
        {
            null => string.Empty,
            string text => text,
            IConvertible convertible => convertible.ToString(CultureInfo.InvariantCulture),
            _ => value.ToString() ?? string.Empty,
        };
    }
}
```

- [ ] **Step 4: Write the content loader**

`src/Umbraco.Community.Kanban/Services/IKanbanContentLoader.cs`:

```csharp
using Umbraco.Cms.Core.Models;

namespace Umbraco.Community.Kanban.Services;

/// <param name="Children">The children that were read, capped.</param>
/// <param name="TotalChildCount">The parent's true child count, even when more exist than were read.</param>
public sealed record KanbanChildPage(IReadOnlyList<IContent> Children, int TotalChildCount);

/// <summary>
/// The narrow slice of IContentService the board needs, so the board service is testable —
/// IContentService can be neither hand-faked nor constructed without persistence.
/// </summary>
public interface IKanbanContentLoader
{
    IContent? GetById(Guid key);

    /// <summary>
    /// The parent's children in sort order, at most <paramref name="cap" /> of them, with the
    /// true total. Draft values, because a card moved but not yet published must show in its
    /// new lane.
    /// </summary>
    KanbanChildPage GetChildren(int parentId, int cap);
}
```

`src/Umbraco.Community.Kanban/Services/KanbanContentLoader.cs`:

```csharp
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.Kanban.Services;

/// <inheritdoc />
public sealed class KanbanContentLoader(IContentService contentService) : IKanbanContentLoader
{
    public IContent? GetById(Guid key) => contentService.GetById(key);

    public KanbanChildPage GetChildren(int parentId, int cap)
    {
        // A null ordering falls back to sortOrder ascending, which is what the table layout
        // shows. Templates are not loaded — a card never needs one.
        IEnumerable<IContent> children = contentService.GetPagedChildren(
            parentId,
            pageIndex: 0,
            pageSize: cap,
            out var totalRecords,
            propertyAliases: null,
            filter: null,
            ordering: null,
            loadTemplates: false);

        return new KanbanChildPage(
            children.ToList(),
            (int)Math.Min(totalRecords, int.MaxValue));
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet build && dotnet test`
Expected: all pass, 8 new tests (two of them from the `[Theory]`).

- [ ] **Step 6: Commit**

```bash
git add src/Umbraco.Community.Kanban/Services tests/Umbraco.Community.Kanban.Tests/Services/KanbanLaneValueReaderTests.cs
git commit -m "feat: add lane value reading and the content loader"
```

---

### Task 7: The board service

**Files:**
- Create: `src/Umbraco.Community.Kanban/Services/IKanbanBoardService.cs`
- Create: `src/Umbraco.Community.Kanban/Services/KanbanBoardService.cs`
- Create: `tests/Umbraco.Community.Kanban.Tests/Fakes/FakeKanbanContentLoader.cs`
- Create: `tests/Umbraco.Community.Kanban.Tests/Fakes/FakeContentPermissionAuthorizer.cs`
- Create: `tests/Umbraco.Community.Kanban.Tests/Fakes/FakeKanbanLaneResolver.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Services/KanbanBoardServiceTests.cs`

**Interfaces:**
- Consumes: `KanbanBoardComposer`, `KanbanCardAssignment`, `KanbanBoardComposerRequest` (Task 3); `IKanbanBoardConfigurationResolver`, `KanbanBoardConfigurationStatus` (Task 5); `IKanbanLaneContentTypeResolver` (Task 4); `KanbanCardMapper` (Task 2); `KanbanLaneValueReader`, `IKanbanContentLoader` (Task 6); `Constants.DefaultChildCap` (Task 1); `IKanbanLaneResolver` and `KanbanLaneResolution` (milestone 1).
- Produces:
  - `KanbanBoardStatus` — `Success`, `ParentNotFound`, `ParentAccessDenied`, `NotConfigured`, `ConfigurationNotFound`.
  - `KanbanBoardRequest(Guid ParentId, Guid? ConfigId, string? Culture, string? Lane, int? Skip, int? Take)`.
  - `KanbanBoardResult(KanbanBoardStatus Status, KanbanBoardResponseModel? Board)`.
  - `IKanbanBoardService` with `Task<KanbanBoardResult> GetBoardAsync(KanbanBoardRequest request, IUser user)`.

Order of operations, which the tests pin:

1. Load the parent. Missing → `ParentNotFound`.
2. Check browse permission on the parent. Denied → `ParentAccessDenied`.
3. Resolve the configuration from `ConfigId` or the parent's `ListView`.
4. Resolve which child content type the lanes come from, then resolve the lanes.
5. Read the children, capped at `Constants.DefaultChildCap`.
6. Filter the children by browse permission and compute `CanUpdate` per card — both in one bulk call each, never per node in a loop.
7. Compose.

A **null culture means invariant**, not "the site default". The only caller that matters supplies the collection's display culture, which is itself null on an invariant site — so reading invariant values when no culture is named is both simpler and correct. No language service is involved.

- [ ] **Step 1: Write the fakes**

`tests/Umbraco.Community.Kanban.Tests/Fakes/FakeKanbanContentLoader.cs`:

```csharp
using Umbraco.Cms.Core.Models;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Fakes;

internal sealed class FakeKanbanContentLoader : IKanbanContentLoader
{
    public Dictionary<Guid, IContent> Content { get; } = [];

    public List<IContent> Children { get; } = [];

    /// <summary>Overrides the reported total, to simulate more children than were read.</summary>
    public int? TotalChildCountOverride { get; set; }

    public List<(int ParentId, int Cap)> ChildRequests { get; } = [];

    public IContent? GetById(Guid key) => Content.TryGetValue(key, out IContent? content) ? content : null;

    public KanbanChildPage GetChildren(int parentId, int cap)
    {
        ChildRequests.Add((parentId, cap));

        return new KanbanChildPage(
            Children.Take(cap).ToList(),
            TotalChildCountOverride ?? Children.Count);
    }
}
```

`tests/Umbraco.Community.Kanban.Tests/Fakes/FakeContentPermissionAuthorizer.cs`:

```csharp
using Umbraco.Cms.Core.Membership;
using Umbraco.Cms.Core.Security.Authorization;

namespace Umbraco.Community.Kanban.Tests.Fakes;

internal sealed class FakeContentPermissionAuthorizer : IContentPermissionAuthorizer
{
    /// <summary>Permission letter to the content keys the user holds it for. Absent letter means "all allowed".</summary>
    public Dictionary<string, HashSet<Guid>> Allowed { get; } = [];

    /// <summary>Every FilterAuthorizedAsync call, so a test can assert filtering was bulk, not per node.</summary>
    public List<(string Permission, int KeyCount)> FilterCalls { get; } = [];

    public Task<bool> IsDeniedAsync(IUser currentUser, IEnumerable<Guid> contentKeys, ISet<string> permissionsToCheck)
    {
        List<Guid> keys = contentKeys.ToList();

        return Task.FromResult(permissionsToCheck.Any(permission => keys.Any(key => Holds(permission, key) == false)));
    }

    public Task<ISet<Guid>> FilterAuthorizedAsync(IUser currentUser, IEnumerable<Guid> contentKeys, ISet<string> permissionsToCheck)
    {
        List<Guid> keys = contentKeys.ToList();

        foreach (var permission in permissionsToCheck)
        {
            FilterCalls.Add((permission, keys.Count));
        }

        return Task.FromResult<ISet<Guid>>(
            keys.Where(key => permissionsToCheck.All(permission => Holds(permission, key))).ToHashSet());
    }

    private bool Holds(string permission, Guid key) =>
        Allowed.TryGetValue(permission, out HashSet<Guid>? keys) == false || keys.Contains(key);
}
```

Any member of `IContentPermissionAuthorizer` not shown here must also be implemented — check the real interface and add the missing ones throwing `NotSupportedException`, so an accidental new dependency fails loudly rather than silently returning a default.

`tests/Umbraco.Community.Kanban.Tests/Fakes/FakeKanbanLaneResolver.cs`:

```csharp
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Fakes;

internal sealed class FakeKanbanLaneResolver : IKanbanLaneResolver
{
    public List<KanbanLane> Lanes { get; } = [];

    public List<(Guid ContentTypeKey, KanbanBoardConfiguration Configuration)> Calls { get; } = [];

    public Task<KanbanLaneResolution> ResolveAsync(Guid contentTypeKey, KanbanBoardConfiguration configuration)
    {
        Calls.Add((contentTypeKey, configuration));

        return Task.FromResult(new KanbanLaneResolution(Lanes, []));
    }
}
```

- [ ] **Step 2: Write the failing test**

`tests/Umbraco.Community.Kanban.Tests/Services/KanbanBoardServiceTests.cs`:

```csharp
using Umbraco.Cms.Core.Actions;
using Umbraco.Cms.Core.Membership;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanBoardServiceTests
{
    private static readonly FakeShortStringHelper ShortStrings = new();
    private static readonly Guid ParentKey = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid ListViewKey = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid BoardConfigKey = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private static readonly Guid ChildTypeKey = Guid.Parse("44444444-4444-4444-4444-444444444444");

    private sealed record Harness(
        KanbanBoardService Service,
        FakeKanbanContentLoader Loader,
        FakeContentPermissionAuthorizer Permissions,
        FakeKanbanLaneResolver LaneResolver,
        FakeKanbanContentTypeLookup ContentTypes,
        FakeKanbanDataTypeConfigurationLookup DataTypes,
        FakeKanbanConfigurationService Configurations,
        ContentType ChildContentType);

    private static ContentType ChildType()
    {
        var contentType = new ContentType(ShortStrings, -1)
        {
            Alias = "task",
            Name = "Task",
            Icon = "icon-checkbox",
            Key = ChildTypeKey,
        };

        contentType.AddPropertyType(new PropertyType(ShortStrings, "Umbraco.TextBox", ValueStorageType.Nvarchar, "status")
        {
            Name = "Status",
        });

        return contentType;
    }

    /// <summary>
    /// A configured board: a parent whose list view names a board configuration keyed on
    /// "status", with two real lanes plus unassigned.
    /// </summary>
    private static Harness Configured(KanbanBoardConfiguration? configuration = null)
    {
        var parentContentType = new ContentType(ShortStrings, -1)
        {
            Alias = "taskFolder",
            Name = "Task Folder",
            Key = Guid.Parse("55555555-5555-5555-5555-555555555555"),
            ListView = ListViewKey,
        };
        var parent = new Content("Tasks", -1, parentContentType) { Id = 1234, Key = ParentKey };

        var loader = new FakeKanbanContentLoader();
        loader.Content[ParentKey] = parent;

        var permissions = new FakeContentPermissionAuthorizer();
        var laneResolver = new FakeKanbanLaneResolver();
        laneResolver.Lanes.AddRange([
            new KanbanLane { Value = "todo", Name = "To do" },
            new KanbanLane { Value = "doing", Name = "Doing" },
            KanbanLane.Unassigned(),
        ]);

        var contentTypes = new FakeKanbanContentTypeLookup();
        contentTypes.AllowedChildren[parentContentType.Key] = [ChildTypeKey];
        contentTypes.Properties[ChildTypeKey] = ["status"];

        var dataTypes = new FakeKanbanDataTypeConfigurationLookup();
        dataTypes.Values[(ListViewKey, Constants.BoardConfigIdKey)] = BoardConfigKey;

        var configurations = new FakeKanbanConfigurationService();
        configurations.BoardConfigurations[BoardConfigKey] = configuration ?? new KanbanBoardConfiguration
        {
            LaneProperty = "status",
            CardProperties = ["status"],
            LanePageSize = 25,
        };

        var service = new KanbanBoardService(
            loader,
            new KanbanBoardConfigurationResolver(dataTypes, configurations),
            new KanbanLaneContentTypeResolver(contentTypes),
            laneResolver,
            permissions);

        return new Harness(service, loader, permissions, laneResolver, contentTypes, dataTypes, configurations, ChildType());
    }

    private static Content Child(Harness harness, string name, string? status, Guid? key = null)
    {
        var child = new Content(name, 1234, harness.ChildContentType) { Key = key ?? Guid.NewGuid() };

        if (status is not null)
        {
            child.SetValue("status", status);
        }

        harness.Loader.Children.Add(child);

        return child;
    }

    private static KanbanBoardRequest Request(string? lane = null, int? skip = null, int? take = null) =>
        new(ParentKey, null, null, lane, skip, take);

    private static IUser User => new FakeUser();

    [Fact]
    public async Task Reports_parent_not_found_for_an_unknown_parent()
    {
        Harness harness = Configured();

        KanbanBoardResult result = await harness.Service.GetBoardAsync(
            new KanbanBoardRequest(Guid.NewGuid(), null, null, null, null, null), User);

        result.Status.Should().Be(KanbanBoardStatus.ParentNotFound);
        result.Board.Should().BeNull();
    }

    [Fact]
    public async Task Reports_access_denied_when_the_user_cannot_browse_the_parent()
    {
        Harness harness = Configured();
        harness.Permissions.Allowed[ActionBrowse.ActionLetter] = [];

        (await harness.Service.GetBoardAsync(Request(), User)).Status
            .Should().Be(KanbanBoardStatus.ParentAccessDenied);
    }

    [Fact]
    public async Task Reports_not_configured_when_the_list_view_names_no_board()
    {
        Harness harness = Configured();
        harness.DataTypes.Values.Clear();

        (await harness.Service.GetBoardAsync(Request(), User)).Status
            .Should().Be(KanbanBoardStatus.NotConfigured);
    }

    [Fact]
    public async Task Reports_configuration_not_found_when_the_named_board_is_gone()
    {
        Harness harness = Configured();
        harness.Configurations.BoardConfigurations.Clear();

        (await harness.Service.GetBoardAsync(Request(), User)).Status
            .Should().Be(KanbanBoardStatus.ConfigurationNotFound);
    }

    [Fact]
    public async Task Groups_children_into_lanes()
    {
        Harness harness = Configured();
        Child(harness, "a", "todo");
        Child(harness, "b", "doing");
        Child(harness, "c", null);

        KanbanBoardResult result = await harness.Service.GetBoardAsync(Request(), User);

        result.Status.Should().Be(KanbanBoardStatus.Success);
        result.Board!.Lanes.Single(l => l.Value == "todo").Cards.Select(c => c.Name).Should().Equal("a");
        result.Board.Lanes.Single(l => l.Value == "doing").Cards.Select(c => c.Name).Should().Equal("b");
        result.Board.Lanes.Single(l => l.IsUnassigned).Cards.Select(c => c.Name).Should().Equal("c");
    }

    [Fact]
    public async Task Resolves_lanes_against_the_child_content_type_that_declares_the_lane_property()
    {
        Harness harness = Configured();

        await harness.Service.GetBoardAsync(Request(), User);

        harness.LaneResolver.Calls.Single().ContentTypeKey.Should().Be(ChildTypeKey);
    }

    [Fact]
    public async Task Reads_children_capped_at_the_default()
    {
        Harness harness = Configured();

        await harness.Service.GetBoardAsync(Request(), User);

        harness.Loader.ChildRequests.Single().Should().Be((1234, Constants.DefaultChildCap));
    }

    [Fact]
    public async Task Excludes_children_the_user_cannot_browse_from_cards_and_totals()
    {
        Harness harness = Configured();
        Content visible = Child(harness, "a", "todo");
        Child(harness, "b", "todo");
        harness.Permissions.Allowed[ActionBrowse.ActionLetter] = [ParentKey, visible.Key];

        KanbanBoardLaneModel todo = (await harness.Service.GetBoardAsync(Request(), User))
            .Board!.Lanes.Single(l => l.Value == "todo");

        todo.Cards.Select(c => c.Name).Should().Equal("a");
        todo.Total.Should().Be(1, "a hidden card must not be counted either");
    }

    [Fact]
    public async Task Filters_permissions_in_bulk_rather_than_per_node()
    {
        Harness harness = Configured();
        Child(harness, "a", "todo");
        Child(harness, "b", "todo");
        Child(harness, "c", "todo");

        await harness.Service.GetBoardAsync(Request(), User);

        harness.Permissions.FilterCalls.Should().HaveCount(2, "one bulk call per permission");
        harness.Permissions.FilterCalls.Should().OnlyContain(call => call.KeyCount == 3);
    }

    [Fact]
    public async Task Reports_can_update_per_card()
    {
        Harness harness = Configured();
        Content updatable = Child(harness, "a", "todo");
        Child(harness, "b", "todo");
        harness.Permissions.Allowed[ActionUpdate.ActionLetter] = [updatable.Key];

        IReadOnlyList<KanbanCardModel> cards = (await harness.Service.GetBoardAsync(Request(), User))
            .Board!.Lanes.Single(l => l.Value == "todo").Cards;

        cards.Single(c => c.Name == "a").CanUpdate.Should().BeTrue();
        cards.Single(c => c.Name == "b").CanUpdate.Should().BeFalse();
    }

    [Fact]
    public async Task Pages_lanes_by_the_configured_page_size()
    {
        Harness harness = Configured(new KanbanBoardConfiguration { LaneProperty = "status", LanePageSize = 1 });
        Child(harness, "a", "todo");
        Child(harness, "b", "todo");

        KanbanBoardLaneModel todo = (await harness.Service.GetBoardAsync(Request(), User))
            .Board!.Lanes.Single(l => l.Value == "todo");

        todo.Cards.Should().HaveCount(1);
        todo.Total.Should().Be(2);
    }

    [Fact]
    public async Task An_explicit_take_overrides_the_configured_page_size()
    {
        Harness harness = Configured(new KanbanBoardConfiguration { LaneProperty = "status", LanePageSize = 1 });
        Child(harness, "a", "todo");
        Child(harness, "b", "todo");

        KanbanBoardResult result = await harness.Service.GetBoardAsync(Request(lane: "todo", skip: 0, take: 2), User);

        result.Board!.Lanes.Single().Cards.Should().HaveCount(2);
    }

    [Fact]
    public async Task Returns_only_the_requested_lane_for_a_show_more()
    {
        Harness harness = Configured(new KanbanBoardConfiguration { LaneProperty = "status", LanePageSize = 1 });
        Child(harness, "a", "todo");
        Child(harness, "b", "todo");
        Child(harness, "c", "doing");

        KanbanBoardResult result = await harness.Service.GetBoardAsync(Request(lane: "todo", skip: 1), User);

        result.Board!.Lanes.Should().HaveCount(1);
        result.Board.Lanes.Single().Cards.Select(c => c.Name).Should().Equal("b");
        result.Board.Lanes.Single().Skip.Should().Be(1);
    }

    [Fact]
    public async Task Marks_the_board_truncated_when_more_children_exist_than_were_read()
    {
        Harness harness = Configured();
        Child(harness, "a", "todo");
        harness.Loader.TotalChildCountOverride = 4000;

        KanbanBoardResult result = await harness.Service.GetBoardAsync(Request(), User);

        result.Board!.Truncated.Should().BeTrue();
        result.Board.ChildCount.Should().Be(4000);
        result.Board.Lanes.Should().OnlyContain(l => l.TotalIsExact == false);
    }

    [Fact]
    public async Task Is_not_truncated_when_every_child_was_read()
    {
        Harness harness = Configured();
        Child(harness, "a", "todo");

        KanbanBoardResult result = await harness.Service.GetBoardAsync(Request(), User);

        result.Board!.Truncated.Should().BeFalse();
        result.Board.ChildCount.Should().Be(1);
        result.Board.Lanes.Should().OnlyContain(l => l.TotalIsExact);
    }
}
```

Add a minimal `FakeUser` to `tests/Umbraco.Community.Kanban.Tests/Fakes/FakeUser.cs` implementing `IUser` — the permission authorizer fake never reads it, so every member may throw `NotSupportedException` except `Key`, which returns a fixed GUID. If `IUser` proves too large to stub usefully, check whether `Umbraco.Cms.Core.Models.Membership.User` can be constructed directly with a global settings instance and use that instead.

- [ ] **Step 3: Run the test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~KanbanBoardServiceTests`
Expected: FAIL — `KanbanBoardService` does not exist (compile error).

- [ ] **Step 4: Write the service contract**

`src/Umbraco.Community.Kanban/Services/IKanbanBoardService.cs`:

```csharp
using Umbraco.Cms.Core.Membership;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

public enum KanbanBoardStatus
{
    Success,
    ParentNotFound,
    ParentAccessDenied,

    /// <summary>No Kanban configuration has been chosen for this collection yet.</summary>
    NotConfigured,

    /// <summary>A configuration was named, but it is missing or is not a Kanban Board.</summary>
    ConfigurationNotFound,
}

/// <param name="Culture">
/// The culture to read values for, or null for invariant values. Null is not "the site
/// default": the collection supplies its display culture, which is itself null where nothing
/// varies, so invariant is the correct reading in that case.
/// </param>
/// <param name="Lane">A single lane to return, or null for the whole board. The empty string means unassigned.</param>
/// <param name="Skip">Cards to skip within <paramref name="Lane" />. Ignored when Lane is null.</param>
/// <param name="Take">Overrides the configuration's lane page size.</param>
public sealed record KanbanBoardRequest(
    Guid ParentId,
    Guid? ConfigId,
    string? Culture,
    string? Lane,
    int? Skip,
    int? Take);

public sealed record KanbanBoardResult(KanbanBoardStatus Status, KanbanBoardResponseModel? Board);

public interface IKanbanBoardService
{
    Task<KanbanBoardResult> GetBoardAsync(KanbanBoardRequest request, IUser user);
}
```

- [ ] **Step 5: Write the service**

`src/Umbraco.Community.Kanban/Services/KanbanBoardService.cs`:

```csharp
using Umbraco.Cms.Core.Actions;
using Umbraco.Cms.Core.Membership;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Security.Authorization;
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

/// <inheritdoc />
public sealed class KanbanBoardService(
    IKanbanContentLoader contentLoader,
    IKanbanBoardConfigurationResolver configurationResolver,
    IKanbanLaneContentTypeResolver laneContentTypeResolver,
    IKanbanLaneResolver laneResolver,
    IContentPermissionAuthorizer permissionAuthorizer) : IKanbanBoardService
{
    private static readonly ISet<string> BrowsePermission = new HashSet<string> { ActionBrowse.ActionLetter };
    private static readonly ISet<string> UpdatePermission = new HashSet<string> { ActionUpdate.ActionLetter };

    public async Task<KanbanBoardResult> GetBoardAsync(KanbanBoardRequest request, IUser user)
    {
        IContent? parent = contentLoader.GetById(request.ParentId);

        if (parent is null)
        {
            return new KanbanBoardResult(KanbanBoardStatus.ParentNotFound, null);
        }

        if (await permissionAuthorizer.IsDeniedAsync(user, [parent.Key], BrowsePermission))
        {
            return new KanbanBoardResult(KanbanBoardStatus.ParentAccessDenied, null);
        }

        KanbanBoardConfigurationResult configuration = await configurationResolver.ResolveAsync(
            request.ConfigId,
            parent.ContentType.ListView);

        if (configuration.Status != KanbanBoardConfigurationStatus.Success || configuration.Configuration is null)
        {
            return new KanbanBoardResult(ToBoardStatus(configuration.Status), null);
        }

        return new KanbanBoardResult(
            KanbanBoardStatus.Success,
            await ComposeAsync(request, parent, configuration.Configuration, user));
    }

    private static KanbanBoardStatus ToBoardStatus(KanbanBoardConfigurationStatus status) => status switch
    {
        KanbanBoardConfigurationStatus.ConfigurationNotFound => KanbanBoardStatus.ConfigurationNotFound,
        _ => KanbanBoardStatus.NotConfigured,
    };

    private async Task<KanbanBoardResponseModel> ComposeAsync(
        KanbanBoardRequest request,
        IContent parent,
        KanbanBoardConfiguration configuration,
        IUser user)
    {
        Guid laneContentTypeKey = await laneContentTypeResolver.ResolveAsync(
            parent.ContentType.Key,
            configuration.LaneProperty);

        KanbanLaneResolution lanes = await laneResolver.ResolveAsync(laneContentTypeKey, configuration);

        KanbanChildPage page = contentLoader.GetChildren(parent.Id, Constants.DefaultChildCap);
        List<Guid> keys = page.Children.Select(child => child.Key).ToList();

        // One bulk call per permission, never one per node — a board may hold a thousand children.
        ISet<Guid> browseable = await permissionAuthorizer.FilterAuthorizedAsync(user, keys, BrowsePermission);
        ISet<Guid> updatable = await permissionAuthorizer.FilterAuthorizedAsync(user, keys, UpdatePermission);

        List<KanbanCardAssignment> assignments = page.Children
            .Where(child => browseable.Contains(child.Key))
            .Select(child => new KanbanCardAssignment(
                KanbanLaneValueReader.Read(child, configuration.LaneProperty, request.Culture),
                KanbanCardMapper.Map(
                    child,
                    configuration.CardProperties,
                    request.Culture,
                    updatable.Contains(child.Key))))
            .ToList();

        var truncated = page.TotalChildCount > page.Children.Count;
        var pageSize = Math.Max(1, request.Take ?? configuration.LanePageSize);

        return KanbanBoardComposer.Compose(new KanbanBoardComposerRequest(
            lanes.Lanes,
            assignments,
            page.TotalChildCount,
            truncated,
            pageSize,
            request.Lane,
            request.Skip ?? 0));
    }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet build && dotnet test`
Expected: all pass, 15 new tests.

- [ ] **Step 7: Commit**

```bash
git add src/Umbraco.Community.Kanban/Services tests/Umbraco.Community.Kanban.Tests
git commit -m "feat: add the board service"
```

---

### Task 8: The `GET /board` endpoint and service registration

**Files:**
- Create: `src/Umbraco.Community.Kanban/Models/Api/KanbanBoardRequestModel.cs`
- Create: `src/Umbraco.Community.Kanban/Controllers/BoardController.cs`
- Modify: `src/Umbraco.Community.Kanban/Extensions/UmbracoBuilderExtensions.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Composing/KanbanBoardRegistrationTests.cs`

**Interfaces:**
- Consumes: `IKanbanBoardService`, `KanbanBoardRequest`, `KanbanBoardResult`, `KanbanBoardStatus` (Task 7); `IKanbanContentTypeLookup`, `IKanbanLaneContentTypeResolver` (Task 4); `IKanbanDataTypeConfigurationLookup`, `IKanbanBoardConfigurationResolver` (Task 5); `IKanbanContentLoader` (Task 6); `KanbanControllerBase` (milestone 1).
- Produces: `GET /umbraco/kanban/api/v1/board`, the endpoint the client's data source calls.

Status mapping:

| Service status | HTTP |
|---|---|
| `Success` | `200` with the board |
| `ParentNotFound` | `404` |
| `ParentAccessDenied` | `403` via `Forbidden()` |
| `NotConfigured` | `400`, titled so an editor can act on it |
| `ConfigurationNotFound` | `400`, distinct detail — the chosen configuration is gone |

**No controller unit test.** Milestone 1 established this: `ConfigurationsController` and `LanesController` have none either, because the controller is a thin status-to-result mapping over a service that is fully covered, and exercising it means standing up MVC. What this task tests instead is registration — the failure that actually bites, since an unregistered service is a startup crash rather than a wrong answer.

- [ ] **Step 1: Write the failing registration test**

`tests/Umbraco.Community.Kanban.Tests/Composing/KanbanBoardRegistrationTests.cs`:

```csharp
using Microsoft.Extensions.DependencyInjection;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Composing;

public class KanbanBoardRegistrationTests
{
    /// <summary>
    /// Every service the board endpoint resolves at request time. An omission here is a
    /// startup crash on a live site, which no other test in this suite would catch.
    /// </summary>
    public static TheoryData<Type, Type> BoardServices => new()
    {
        { typeof(IKanbanContentTypeLookup), typeof(KanbanContentTypeLookup) },
        { typeof(IKanbanLaneContentTypeResolver), typeof(KanbanLaneContentTypeResolver) },
        { typeof(IKanbanDataTypeConfigurationLookup), typeof(KanbanDataTypeConfigurationLookup) },
        { typeof(IKanbanBoardConfigurationResolver), typeof(KanbanBoardConfigurationResolver) },
        { typeof(IKanbanContentLoader), typeof(KanbanContentLoader) },
        { typeof(IKanbanBoardService), typeof(KanbanBoardService) },
    };

    [Theory]
    [MemberData(nameof(BoardServices))]
    public void AddKanban_registers_the_board_services(Type serviceType, Type implementationType)
    {
        IServiceCollection services = KanbanBuilderFixture.BuildServices();

        ServiceDescriptor descriptor = services.Should()
            .ContainSingle(service => service.ServiceType == serviceType)
            .Subject;

        descriptor.ImplementationType.Should().Be(implementationType);
        descriptor.Lifetime.Should().Be(ServiceLifetime.Singleton);
    }
}
```

`KanbanBuilderFixture.BuildServices()` must construct an `IUmbracoBuilder` and call `AddKanban()` on it, returning the resulting `IServiceCollection`. **The existing registration test added in milestone 1's Task 11 already does exactly this** — find it under `tests/Umbraco.Community.Kanban.Tests/Composing/` and reuse its setup. If it builds the services inline rather than through a reusable helper, extract that setup into a `KanbanBuilderFixture` static helper in the same folder and have both tests use it. Do not duplicate the builder construction.

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~KanbanBoardRegistrationTests`
Expected: FAIL — six cases, each because the service is not registered (or a compile error until the types from Tasks 4-7 are referenced, which they are by now).

- [ ] **Step 3: Register the services**

In `src/Umbraco.Community.Kanban/Extensions/UmbracoBuilderExtensions.cs`, inside `AddKanban`, after the existing `IKanbanConfigurationService` line:

```csharp
        builder.Services.AddSingleton<IKanbanContentTypeLookup, KanbanContentTypeLookup>();
        builder.Services.AddSingleton<IKanbanLaneContentTypeResolver, KanbanLaneContentTypeResolver>();
        builder.Services.AddSingleton<IKanbanDataTypeConfigurationLookup, KanbanDataTypeConfigurationLookup>();
        builder.Services.AddSingleton<IKanbanBoardConfigurationResolver, KanbanBoardConfigurationResolver>();
        builder.Services.AddSingleton<IKanbanContentLoader, KanbanContentLoader>();
        builder.Services.AddSingleton<IKanbanBoardService, KanbanBoardService>();
```

Singleton matches every existing Kanban registration and Umbraco's own services, which are all singletons.

- [ ] **Step 4: Write the request model**

`src/Umbraco.Community.Kanban/Models/Api/KanbanBoardRequestModel.cs`:

```csharp
namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>The query string of a <c>GET /board</c> request.</summary>
public sealed class KanbanBoardRequestModel
{
    /// <summary>The document whose children the board renders.</summary>
    public Guid ParentId { get; init; }

    /// <summary>
    /// The board configuration to use. Omit to resolve it from the parent's collection
    /// (list view) data type, which is what the collection view host does.
    /// </summary>
    public Guid? ConfigId { get; init; }

    /// <summary>The culture to read values for. Omit for invariant values.</summary>
    public string? Culture { get; init; }

    /// <summary>
    /// Return only this lane, for a "Show more". The empty string addresses the
    /// unassigned lane, so this is deliberately distinguishable from omitted.
    /// </summary>
    public string? Lane { get; init; }

    /// <summary>Cards to skip within <see cref="Lane" />.</summary>
    public int? Skip { get; init; }

    /// <summary>Overrides the configuration's lane page size.</summary>
    public int? Take { get; init; }
}
```

- [ ] **Step 5: Write the controller**

`src/Umbraco.Community.Kanban/Controllers/BoardController.cs`:

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
[ApiExplorerSettings(GroupName = "Board")]
public sealed class BoardController(
    IKanbanBoardService boardService,
    IBackOfficeSecurityAccessor backOfficeSecurityAccessor) : KanbanControllerBase
{
    /// <summary>
    /// The lanes and cards for a document's children. Called with no lane for an initial
    /// load, and with a lane plus skip for a "Show more" on that lane alone.
    /// </summary>
    [HttpGet("board")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(KanbanBoardResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Board([FromQuery] KanbanBoardRequestModel request)
    {
        KanbanBoardResult result = await boardService.GetBoardAsync(
            new KanbanBoardRequest(
                request.ParentId,
                request.ConfigId,
                request.Culture,
                request.Lane,
                request.Skip,
                request.Take),
            CurrentUser(backOfficeSecurityAccessor));

        return result.Status switch
        {
            KanbanBoardStatus.Success => Ok(result.Board),
            KanbanBoardStatus.ParentNotFound => NotFound(),
            KanbanBoardStatus.ParentAccessDenied => Forbidden(),
            KanbanBoardStatus.ConfigurationNotFound => BadRequest(new ProblemDetailsBuilder()
                .WithTitle("Kanban configuration not found")
                .WithDetail("The Kanban configuration this collection points at no longer exists. Choose one on the Kanban tab of the collection's data type.")
                .Build()),
            _ => BadRequest(new ProblemDetailsBuilder()
                .WithTitle("No Kanban configuration")
                .WithDetail($"This collection has no Kanban configuration. Set '{Constants.BoardConfigIdKey}' by choosing one on the Kanban tab of the collection's data type.")
                .Build()),
        };
    }
}
```

Both `400` bodies name the fix, because reaching either is a normal step in setting a board up rather than a fault. If `Forbidden()` is not available on `ManagementApiControllerBase` under that exact name, use whatever the base class exposes — Umbraco's own document controllers call it, so check `ByKeyDocumentController` and match it.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet build && dotnet test`
Expected: all pass, 6 new test cases.

- [ ] **Step 7: Commit**

```bash
git add src/Umbraco.Community.Kanban tests/Umbraco.Community.Kanban.Tests/Composing
git commit -m "feat: add the GET /board endpoint"
```

---

### Task 9: Client wire types and the data source

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/constants.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/data/kanban-board.types.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/data/kanban-data-source.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/data/kanban-server-data-source.ts`
- Test: `src/Umbraco.Community.Kanban/Client/src/data/kanban-data-source.test.ts`

**Interfaces:**
- Consumes: the server wire shape from Tasks 1 and 8.
- Produces:
  - Types `KanbanCardState`, `KanbanCardPropertyModel`, `KanbanCardModel`, `KanbanBoardLaneModel`, `KanbanBoardModel`.
  - `KanbanBoardQuery` and `KanbanBoardOutcome`.
  - `KanbanDataSource` interface with `getBoard(query: KanbanBoardQuery): Promise<KanbanBoardOutcome>`.
  - `buildBoardQuery(query: KanbanBoardQuery): Record<string, string | number>` — pure, tested.
  - `KanbanServerDataSource` class.
  - Constants `KANBAN_BOARD_ENDPOINT`, `KANBAN_CONFIGURATIONS_ENDPOINT`, `KANBAN_COLLECTION_VIEW_BOARD_ALIAS`, `KANBAN_DATA_TYPE_WORKSPACE_VIEW_ALIAS`, `KANBAN_BOARD_CONFIG_ID_KEY`, `KANBAN_COLLECTION_PROPERTY_EDITOR_UI_ALIAS`, `KANBAN_DOCUMENT_COLLECTION_ALIAS`.

The one piece with real logic is query building, and the one case that matters is `lane: ''`: the empty string addresses the unassigned lane, so it must survive while `undefined` is dropped. Getting that wrong silently returns the whole board instead of one lane.

- [ ] **Step 1: Write the failing test**

`src/Umbraco.Community.Kanban/Client/src/data/kanban-data-source.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildBoardQuery } from './kanban-data-source.js';

describe('buildBoardQuery', () => {
  it('always sends the parent id', () => {
    expect(buildBoardQuery({ parentId: 'p1' })).toEqual({ parentId: 'p1' });
  });

  it('omits everything that was not supplied', () => {
    const query = buildBoardQuery({ parentId: 'p1' });

    expect('configId' in query).toBe(false);
    expect('culture' in query).toBe(false);
    expect('lane' in query).toBe(false);
    expect('skip' in query).toBe(false);
    expect('take' in query).toBe(false);
  });

  it('sends every supplied value', () => {
    expect(
      buildBoardQuery({ parentId: 'p1', configId: 'c1', culture: 'da-DK', lane: 'todo', skip: 25, take: 10 }),
    ).toEqual({ parentId: 'p1', configId: 'c1', culture: 'da-DK', lane: 'todo', skip: 25, take: 10 });
  });

  it('keeps an empty lane, which addresses the unassigned lane', () => {
    expect(buildBoardQuery({ parentId: 'p1', lane: '', skip: 0 })).toEqual({
      parentId: 'p1',
      lane: '',
      skip: 0,
    });
  });

  it('keeps a zero skip, which is distinct from omitting it', () => {
    expect(buildBoardQuery({ parentId: 'p1', lane: 'todo', skip: 0 }).skip).toBe(0);
  });

  it('omits an empty culture rather than asking for the empty culture', () => {
    expect('culture' in buildBoardQuery({ parentId: 'p1', culture: '' })).toBe(false);
  });
});
```

`culture: ''` is dropped but `lane: ''` is kept — the asymmetry is deliberate and is why both are tested. An empty culture means "no culture", which the server already treats as invariant; an empty lane names a real lane.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/Umbraco.Community.Kanban/Client && npm test`
Expected: FAIL — cannot resolve `./kanban-data-source.js`.

- [ ] **Step 3: Add the constants**

Append to `src/Umbraco.Community.Kanban/Client/src/constants.ts`:

```ts
export const KANBAN_BOARD_ENDPOINT = `${KANBAN_API_PATH}/board`;
export const KANBAN_CONFIGURATIONS_ENDPOINT = `${KANBAN_API_PATH}/configurations`;

export const KANBAN_COLLECTION_VIEW_BOARD_ALIAS = 'Umb.Community.Kanban.CollectionView.Board';
export const KANBAN_DATA_TYPE_WORKSPACE_VIEW_ALIAS = 'Umb.Community.Kanban.WorkspaceView.DataType.Kanban';

/** The extra configuration alias written onto a Collection data type. Must match Constants.BoardConfigIdKey. */
export const KANBAN_BOARD_CONFIG_ID_KEY = 'kanban.boardConfigId';

/** The Collection property editor UI our Data Type workspace tab attaches itself to. */
export const KANBAN_COLLECTION_PROPERTY_EDITOR_UI_ALIAS = 'Umb.PropertyEditorUi.Collection';

/** The document collection our board layout is offered for. */
export const KANBAN_DOCUMENT_COLLECTION_ALIAS = 'Umb.Collection.Document';
```

- [ ] **Step 4: Write the wire types**

`src/Umbraco.Community.Kanban/Client/src/data/kanban-board.types.ts`:

```ts
/** Mirrors KanbanCardStates on the server. */
export type KanbanCardState = 'published' | 'publishedPendingChanges' | 'draft';

/** Mirrors KanbanCardPropertyModel. */
export interface KanbanCardPropertyModel {
  alias: string;
  name: string;
  /** The property editor *schema* alias, handed to umb-value-summary-extension. */
  editorAlias: string;
  value: unknown;
}

/** Mirrors KanbanCardModel. */
export interface KanbanCardModel {
  key: string;
  name: string;
  contentTypeAlias: string;
  /** Verbatim from the content type, colour suffix and all — umb-icon parses it. */
  icon?: string | null;
  state: KanbanCardState;
  /** Populated by the server; unused until drag arrives in milestone 3. */
  canUpdate: boolean;
  properties: KanbanCardPropertyModel[];
}

/** Mirrors KanbanBoardLaneModel. */
export interface KanbanBoardLaneModel {
  value: string;
  name: string;
  colour?: string | null;
  icon?: string | null;
  isUnassigned: boolean;
  acceptsDrops: boolean;
  /** Exact while totalIsExact, otherwise a lower bound. */
  total: number;
  totalIsExact: boolean;
  skip: number;
  cards: KanbanCardModel[];
}

/** Mirrors KanbanBoardResponseModel. */
export interface KanbanBoardModel {
  lanes: KanbanBoardLaneModel[];
  truncated: boolean;
  childCount: number;
}
```

- [ ] **Step 5: Write the data source contract**

`src/Umbraco.Community.Kanban/Client/src/data/kanban-data-source.ts`:

```ts
import type { KanbanBoardModel } from './kanban-board.types.js';

export interface KanbanBoardQuery {
  parentId: string;
  configId?: string;
  culture?: string | null;
  /** A single lane to load. The empty string addresses the unassigned lane. */
  lane?: string;
  skip?: number;
  take?: number;
}

/**
 * Why an outcome union rather than a thrown error: "this collection has no Kanban
 * configuration yet" is a normal state on the way to setting a board up, and the view shows
 * guidance for it rather than an error.
 */
export type KanbanBoardOutcome =
  | { kind: 'success'; board: KanbanBoardModel }
  | { kind: 'not-configured' }
  | { kind: 'error' };

export interface KanbanDataSource {
  getBoard(query: KanbanBoardQuery): Promise<KanbanBoardOutcome>;
}

/**
 * Builds the query string for GET /board. Pure and tested because the empty-string cases
 * are load-bearing: `lane: ''` names the unassigned lane and must survive, while an empty
 * culture means "no culture" and must not be sent.
 */
export function buildBoardQuery(query: KanbanBoardQuery): Record<string, string | number> {
  const built: Record<string, string | number> = { parentId: query.parentId };

  if (query.configId) built.configId = query.configId;
  if (query.culture) built.culture = query.culture;
  if (query.lane !== undefined) built.lane = query.lane;
  if (query.skip !== undefined) built.skip = query.skip;
  if (query.take !== undefined) built.take = query.take;

  return built;
}
```

- [ ] **Step 6: Write the server data source**

`src/Umbraco.Community.Kanban/Client/src/data/kanban-server-data-source.ts`:

```ts
import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { KANBAN_BOARD_ENDPOINT } from '@/constants.js';
import { buildBoardQuery, type KanbanBoardOutcome, type KanbanBoardQuery, type KanbanDataSource } from './kanban-data-source.js';
import type { KanbanBoardModel } from './kanban-board.types.js';

/**
 * Calls GET /board with backoffice auth. umbHttpClient is configured throwOnError, so
 * tryExecute is required rather than optional — it turns a non-2xx into a returned error.
 * Notifications are disabled because a 400 here is guidance, not a fault, and the board
 * element renders it inline.
 */
export class KanbanServerDataSource implements KanbanDataSource {
  #host: UmbControllerHost;

  constructor(host: UmbControllerHost) {
    this.#host = host;
  }

  async getBoard(query: KanbanBoardQuery): Promise<KanbanBoardOutcome> {
    const { data, error } = await tryExecute(
      this.#host,
      umbHttpClient.get<KanbanBoardModel>({
        url: KANBAN_BOARD_ENDPOINT,
        query: buildBoardQuery(query),
        security: [{ type: 'http', scheme: 'bearer' }],
      }),
      { disableNotifications: true },
    );

    if (error) {
      return (error as { status?: number }).status === 400 ? { kind: 'not-configured' } : { kind: 'error' };
    }

    return data ? { kind: 'success', board: data } : { kind: 'error' };
  }
}
```

If `umbHttpClient.get` does not accept a type parameter, drop it and cast the returned `data` to `KanbanBoardModel` instead — the request options shape (`url`, `query`, `security`) is verified and must not change. Likewise if the resolved value nests the payload one level deeper than `data`, follow whatever the installed client's `RequestResult` type declares.

- [ ] **Step 7: Run the tests and build to verify they pass**

Run: `cd src/Umbraco.Community.Kanban/Client && npm test && npm run build`
Expected: tests PASS with 6 new tests; `tsc --noEmit` and the Vite build succeed.

- [ ] **Step 8: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src
git commit -m "feat: add the client board data source"
```

---

### Task 10: Board state and the page-merge reducer

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/core/board.model.ts`
- Test: `src/Umbraco.Community.Kanban/Client/src/core/board.model.test.ts`

**Interfaces:**
- Consumes: `KanbanBoardModel`, `KanbanBoardLaneModel` (Task 9).
- Produces:
  - `KanbanBoardState` — `{ lanes: KanbanBoardLaneModel[]; truncated: boolean; childCount: number }`.
  - `toBoardState(board: KanbanBoardModel): KanbanBoardState`.
  - `mergeLanePage(state: KanbanBoardState, page: KanbanBoardModel): KanbanBoardState`.
  - `laneHasMore(lane: KanbanBoardLaneModel): boolean`.
  - `nextSkip(lane: KanbanBoardLaneModel): number`.
  - `formatLaneTotal(lane: KanbanBoardLaneModel): string`.

This is the one piece of client state management that is easy to get subtly wrong, so it is pure and directly tested. The failure modes it guards:

- **Duplicate cards** from a double-clicked "Show more" — merging is keyed on card key, not blind concatenation.
- **A "Show more" that never stops.** Once truncation makes a total a lower bound, `laneHasMore` can no longer trust it, so an empty returned page is what proves the lane exhausted: the merge then pins the total to what is loaded and marks it exact.
- **A stale skip.** `nextSkip` derives from the cards actually held, never from an incremented counter.

- [ ] **Step 1: Write the failing test**

`src/Umbraco.Community.Kanban/Client/src/core/board.model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  formatLaneTotal,
  laneHasMore,
  mergeLanePage,
  nextSkip,
  toBoardState,
} from './board.model.js';
import type { KanbanBoardLaneModel, KanbanBoardModel, KanbanCardModel } from '../data/kanban-board.types.js';

const card = (key: string): KanbanCardModel => ({
  key,
  name: key,
  contentTypeAlias: 'task',
  state: 'draft',
  canUpdate: false,
  properties: [],
});

const lane = (value: string, cards: string[], overrides: Partial<KanbanBoardLaneModel> = {}): KanbanBoardLaneModel => ({
  value,
  name: value,
  isUnassigned: value === '',
  acceptsDrops: value !== '',
  total: cards.length,
  totalIsExact: true,
  skip: 0,
  cards: cards.map(card),
  ...overrides,
});

const board = (lanes: KanbanBoardLaneModel[], overrides: Partial<KanbanBoardModel> = {}): KanbanBoardModel => ({
  lanes,
  truncated: false,
  childCount: lanes.reduce((sum, l) => sum + l.total, 0),
  ...overrides,
});

describe('toBoardState', () => {
  it('carries lanes, truncation and child count across', () => {
    const state = toBoardState(board([lane('todo', ['a'])], { truncated: true, childCount: 4000 }));

    expect(state.lanes.map((l) => l.value)).toEqual(['todo']);
    expect(state.truncated).toBe(true);
    expect(state.childCount).toBe(4000);
  });
});

describe('mergeLanePage', () => {
  const initial = () =>
    toBoardState(board([lane('todo', ['a'], { total: 3 }), lane('doing', ['x'])]));

  it('appends the returned cards to the named lane', () => {
    const next = mergeLanePage(initial(), board([lane('todo', ['b', 'c'], { total: 3, skip: 1 })]));

    expect(next.lanes[0].cards.map((c) => c.key)).toEqual(['a', 'b', 'c']);
  });

  it('leaves other lanes untouched', () => {
    const next = mergeLanePage(initial(), board([lane('todo', ['b'], { total: 3, skip: 1 })]));

    expect(next.lanes[1].cards.map((c) => c.key)).toEqual(['x']);
  });

  it('does not duplicate a card already held, so a double-clicked show-more is harmless', () => {
    const next = mergeLanePage(initial(), board([lane('todo', ['a', 'b'], { total: 3, skip: 0 })]));

    expect(next.lanes[0].cards.map((c) => c.key)).toEqual(['a', 'b']);
  });

  it('takes the new total and skip from the page', () => {
    const next = mergeLanePage(initial(), board([lane('todo', ['b'], { total: 7, skip: 1 })]));

    expect(next.lanes[0].total).toBe(7);
    expect(next.lanes[0].skip).toBe(1);
  });

  it('matches the lane case-insensitively', () => {
    const next = mergeLanePage(initial(), board([lane('ToDo', ['b'], { total: 3, skip: 1 })]));

    expect(next.lanes[0].cards.map((c) => c.key)).toEqual(['a', 'b']);
  });

  it('ignores a lane it does not already hold', () => {
    const next = mergeLanePage(initial(), board([lane('archived', ['z'])]));

    expect(next.lanes.map((l) => l.value)).toEqual(['todo', 'doing']);
  });

  it('treats an empty page as proof the lane is exhausted', () => {
    const state = toBoardState(board([lane('todo', ['a'], { total: 99, totalIsExact: false })]));

    const next = mergeLanePage(state, board([lane('todo', [], { total: 99, totalIsExact: false, skip: 1 })]));

    expect(next.lanes[0].total).toBe(1);
    expect(next.lanes[0].totalIsExact).toBe(true);
    expect(laneHasMore(next.lanes[0])).toBe(false);
  });

  it('updates the board-level truncation from the page', () => {
    const next = mergeLanePage(initial(), board([lane('todo', ['b'], { total: 3, skip: 1 })], {
      truncated: true,
      childCount: 4000,
    }));

    expect(next.truncated).toBe(true);
    expect(next.childCount).toBe(4000);
  });

  it('does not mutate the state it was given', () => {
    const state = initial();

    mergeLanePage(state, board([lane('todo', ['b'], { total: 3, skip: 1 })]));

    expect(state.lanes[0].cards.map((c) => c.key)).toEqual(['a']);
  });
});

describe('laneHasMore', () => {
  it('is true while fewer cards are loaded than the total', () => {
    expect(laneHasMore(lane('todo', ['a'], { total: 3 }))).toBe(true);
  });

  it('is false once every card is loaded', () => {
    expect(laneHasMore(lane('todo', ['a', 'b']))).toBe(false);
  });

  it('is true when the total is only a lower bound, even if it looks satisfied', () => {
    expect(laneHasMore(lane('todo', ['a'], { total: 1, totalIsExact: false }))).toBe(true);
  });
});

describe('formatLaneTotal', () => {
  it('shows an exact total plainly', () => {
    expect(formatLaneTotal(lane('todo', [], { total: 12 }))).toBe('12');
  });

  it('marks a lower bound with a plus', () => {
    expect(formatLaneTotal(lane('todo', [], { total: 120, totalIsExact: false }))).toBe('120+');
  });
});

describe('nextSkip', () => {
  it('is the number of cards already loaded, never a running counter', () => {
    expect(nextSkip(lane('todo', ['a', 'b', 'c'], { total: 9, skip: 25 }))).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/Umbraco.Community.Kanban/Client && npm test`
Expected: FAIL — cannot resolve `./board.model.js`.

- [ ] **Step 3: Write the model**

`src/Umbraco.Community.Kanban/Client/src/core/board.model.ts`:

```ts
import type { KanbanBoardLaneModel, KanbanBoardModel } from '../data/kanban-board.types.js';

/** What the board element holds between requests. */
export interface KanbanBoardState {
  lanes: KanbanBoardLaneModel[];
  truncated: boolean;
  childCount: number;
}

export function toBoardState(board: KanbanBoardModel): KanbanBoardState {
  return { lanes: [...board.lanes], truncated: board.truncated, childCount: board.childCount };
}

/**
 * Folds a single-lane response into the board. Pure; never mutates its input.
 *
 * A returned page with no cards is the only reliable proof that a lane is exhausted — once
 * the child cap makes totals lower bounds, the total cannot be trusted to end the paging —
 * so an empty page pins the total to what is loaded and marks it exact, retiring the
 * "Show more" button.
 */
export function mergeLanePage(state: KanbanBoardState, page: KanbanBoardModel): KanbanBoardState {
  const lanes = state.lanes.map((lane) => {
    const incoming = page.lanes.find((candidate) => sameLane(candidate.value, lane.value));

    if (!incoming) return lane;

    if (incoming.cards.length === 0) {
      return { ...lane, skip: incoming.skip, total: lane.cards.length, totalIsExact: true };
    }

    const held = new Set(lane.cards.map((card) => card.key));

    return {
      ...lane,
      skip: incoming.skip,
      total: incoming.total,
      totalIsExact: incoming.totalIsExact,
      cards: [...lane.cards, ...incoming.cards.filter((card) => !held.has(card.key))],
    };
  });

  return { lanes, truncated: page.truncated, childCount: page.childCount };
}

/** True while the lane may hold cards that are not loaded. */
export function laneHasMore(lane: KanbanBoardLaneModel): boolean {
  return !lane.totalIsExact || lane.cards.length < lane.total;
}

/** The skip for this lane's next page — derived from what is held, never a counter. */
export function nextSkip(lane: KanbanBoardLaneModel): number {
  return lane.cards.length;
}

/** The lane header count: "12", or "120+" where the total is only a lower bound. */
export function formatLaneTotal(lane: KanbanBoardLaneModel): string {
  return lane.totalIsExact ? `${lane.total}` : `${lane.total}+`;
}

function sameLane(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
```

- [ ] **Step 4: Run the tests and build to verify they pass**

Run: `cd src/Umbraco.Community.Kanban/Client && npm test && npm run build`
Expected: tests PASS with 16 new tests; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core
git commit -m "feat: add board state and the page-merge reducer"
```

---

### Task 11: The card element

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/core/card.model.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts`
- Test: `src/Umbraco.Community.Kanban/Client/src/core/card.model.test.ts`

**Interfaces:**
- Consumes: `KanbanCardModel`, `KanbanCardState` (Task 9).
- Produces:
  - `cardStateTag(state: KanbanCardState): { color: string; term: string }` — pure, tested.
  - `<umb-community-kanban-card>` with a `card: KanbanCardModel` property, dispatching a bubbling, composed `kanban-card-clicked` event carrying `{ key }` in `detail`.

Three things come from Umbraco rather than from us, and none needs new plumbing:

- `<umb-value-summary-extension .valueType=${property.editorAlias} .value=${property.value}>` renders each summary property, falling back to the raw value when no `valueSummary` extension is registered for that editor. Only Slider, ColorPicker and DateTimeWithTimeZone ship one, so most properties render as their raw value — acceptable for the text, numbers and dropdowns a card summary is for, and the reason media thumbnails are out of scope for this milestone.
- `<umb-icon name=${card.icon}>` handles a `"icon-x color-y"` suffix itself.
- `<umb-entity-actions-bundle .entityType='document' .unique=${card.key} .label=${card.name}>` gives the standard actions menu.

None of these three are imported: they are global elements the backoffice shell registers. Importing them from a deep `dist-cms` path would be an unsupported dependency.

The state badge is copied rather than reused — there is no packaged publish-state element, so the built-in document table collection view builds its own `<uui-tag>` from a switch, and this does the same against our own three-value state.

- [ ] **Step 1: Write the failing test**

`src/Umbraco.Community.Kanban/Client/src/core/card.model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cardStateTag } from './card.model.js';

describe('cardStateTag', () => {
  it('shows a published card positively', () => {
    expect(cardStateTag('published')).toEqual({ color: 'positive', term: 'content_published' });
  });

  it('warns on a published card with pending changes', () => {
    expect(cardStateTag('publishedPendingChanges')).toEqual({
      color: 'warning',
      term: 'content_publishedPendingChanges',
    });
  });

  it('shows a draft neutrally', () => {
    expect(cardStateTag('draft')).toEqual({ color: 'default', term: 'content_unpublished' });
  });
});
```

The localisation keys are the ones Umbraco's own document table state column uses, so a card reads the same as the tree.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/Umbraco.Community.Kanban/Client && npm test`
Expected: FAIL — cannot resolve `./card.model.js`.

- [ ] **Step 3: Write the model**

`src/Umbraco.Community.Kanban/Client/src/core/card.model.ts`:

```ts
import type { KanbanCardState } from '../data/kanban-board.types.js';

/**
 * The tag colour and localisation key for a card's publish state. Copied from the built-in
 * document table collection view's state column: Umbraco ships no reusable publish-state
 * element, so matching its colours and terms by hand is how a card reads like a tree node.
 */
export function cardStateTag(state: KanbanCardState): { color: string; term: string } {
  switch (state) {
    case 'published':
      return { color: 'positive', term: 'content_published' };
    case 'publishedPendingChanges':
      return { color: 'warning', term: 'content_publishedPendingChanges' };
    default:
      return { color: 'default', term: 'content_unpublished' };
  }
}
```

- [ ] **Step 4: Write the element**

`src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts`:

```ts
import { css, customElement, html, nothing, property, repeat } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { cardStateTag } from './card.model.js';
import type { KanbanCardModel, KanbanCardPropertyModel } from '../data/kanban-board.types.js';

/**
 * One card on a board. Read-only in this milestone: it reports a click and nothing else.
 *
 * umb-icon, umb-value-summary-extension and umb-entity-actions-bundle are global elements
 * the backoffice shell registers, so they are used without import — reaching into
 * dist-cms to import them would be an unsupported dependency.
 */
@customElement('umb-community-kanban-card')
export class UmbCommunityKanbanCardElement extends UmbLitElement {
  @property({ attribute: false })
  card?: KanbanCardModel;

  #onClick() {
    if (!this.card) return;

    this.dispatchEvent(
      new CustomEvent('kanban-card-clicked', {
        detail: { key: this.card.key },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    if (!this.card) return nothing;

    const tag = cardStateTag(this.card.state);

    return html`
      <div class="card" role="button" tabindex="0" @click=${this.#onClick}>
        <div class="header">
          ${this.card.icon ? html`<umb-icon name=${this.card.icon}></umb-icon>` : nothing}
          <span class="name">${this.card.name}</span>
          <umb-entity-actions-bundle
            entity-type="document"
            .unique=${this.card.key}
            .label=${this.card.name}
            @click=${(event: Event) => event.stopPropagation()}>
          </umb-entity-actions-bundle>
        </div>
        ${this.card.properties.length
          ? html`<div class="properties">
              ${repeat(
                this.card.properties,
                (item) => item.alias,
                (item) => this.#renderProperty(item),
              )}
            </div>`
          : nothing}
        <div class="footer">
          <uui-tag color=${tag.color} look="secondary">${this.localize.term(tag.term)}</uui-tag>
        </div>
      </div>
    `;
  }

  #renderProperty(item: KanbanCardPropertyModel) {
    return html`
      <div class="property">
        <span class="label">${item.name}</span>
        <umb-value-summary-extension .valueType=${item.editorAlias} .value=${item.value}></umb-value-summary-extension>
      </div>
    `;
  }

  static override styles = [
    css`
      .card {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-2);
        padding: var(--uui-size-space-3);
        background: var(--uui-color-surface);
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius);
        cursor: pointer;
      }

      .card:hover {
        border-color: var(--uui-color-border-emphasis);
      }

      .header {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
      }

      .name {
        flex: 1;
        font-weight: bold;
        overflow-wrap: anywhere;
      }

      .properties {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-1);
        font-size: var(--uui-type-small-size);
      }

      .property {
        display: flex;
        gap: var(--uui-size-space-2);
      }

      .label {
        color: var(--uui-color-text-alt);
      }
    `,
  ];
}

export { UmbCommunityKanbanCardElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-card': UmbCommunityKanbanCardElement;
  }
}
```

The `stopPropagation` on the actions bundle matters: without it, opening the menu also fires a card click.

If `entity-type="document"` is not accepted as an attribute, set `.entityType=${'document'}` as a property instead — the verified declaration exposes both `entityType` and `unique` as properties (deprecated in favour of providing `UMB_ENTITY_CONTEXT`, but functional in 18.0.2, and this element has no entity context of its own to provide).

- [ ] **Step 5: Run the tests and build to verify they pass**

Run: `cd src/Umbraco.Community.Kanban/Client && npm test && npm run build`
Expected: tests PASS with 3 new tests; `tsc --noEmit` and the build succeed.

The element itself has no DOM test — Vitest runs in a Node environment with no custom-elements registry, per the global constraints. `tsc --noEmit` plus this plan's review is its coverage.

- [ ] **Step 6: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core
git commit -m "feat: add the kanban card element"
```

---

### Task 12: The lane and board elements

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/core/lane.model.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/core/kanban-lane.element.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`
- Test: `src/Umbraco.Community.Kanban/Client/src/core/lane.model.test.ts`

**Interfaces:**
- Consumes: `KanbanBoardState`, `mergeLanePage`, `toBoardState`, `laneHasMore`, `nextSkip`, `formatLaneTotal` (Task 10); `<umb-community-kanban-card>` (Task 11); `KanbanDataSource`, `KanbanBoardQuery` (Task 9).
- Produces:
  - `laneColourStyle(colour, toVariable): string | undefined` — pure, tested.
  - `<umb-community-kanban-lane>` with `lane` and `readonly` properties, dispatching `kanban-load-more` with `{ lane, skip }`.
  - `<umb-community-kanban-board>` with `parentId`, `configId`, `culture`, `readonly` and `datasource` properties, plus a public `load()`.

`laneColourStyle` takes the alias-to-variable resolver as an argument rather than importing `extractUmbColorVariable` directly, so it is testable in the Node Vitest environment without pulling the backoffice package's import graph into a test. The element supplies the real function.

`core/` must import nothing from `hosts/` or `workspace-views/`, and nothing from any collection or workspace package. Nothing enforces this — it is a review gate, and it is what makes the content-app and injected hosts cheap in later milestones.

- [ ] **Step 1: Write the failing test**

`src/Umbraco.Community.Kanban/Client/src/core/lane.model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { laneColourStyle } from './lane.model.js';

const known = (alias: string) => (alias === 'blue' ? '--uui-palette-violet-blue' : undefined);

describe('laneColourStyle', () => {
  it('resolves an Umbraco colour alias to its palette variable, so lanes track the theme', () => {
    expect(laneColourStyle('blue', known)).toBe('var(--uui-palette-violet-blue)');
  });

  it('passes an unrecognised value through as a raw CSS colour', () => {
    expect(laneColourStyle('#ff8800', known)).toBe('#ff8800');
  });

  it('has no colour for a lane that was not given one', () => {
    expect(laneColourStyle(null, known)).toBeUndefined();
    expect(laneColourStyle(undefined, known)).toBeUndefined();
    expect(laneColourStyle('', known)).toBeUndefined();
  });
});
```

The raw-passthrough case is the brand-colour escape hatch from the parent design: it costs theme awareness, which is why an alias is preferred and tried first.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/Umbraco.Community.Kanban/Client && npm test`
Expected: FAIL — cannot resolve `./lane.model.js`.

- [ ] **Step 3: Write the model**

`src/Umbraco.Community.Kanban/Client/src/core/lane.model.ts`:

```ts
/**
 * The CSS colour for a lane header.
 *
 * `toVariable` is injected rather than imported so this stays testable in the Node test
 * environment; the element passes Umbraco's own extractUmbColorVariable. An Umbraco colour
 * alias is preferred because it tracks light and dark mode; anything else is passed through
 * as a raw CSS colour, which supports brand colours at the cost of theme awareness.
 */
export function laneColourStyle(
  colour: string | null | undefined,
  toVariable: (alias: string) => string | undefined,
): string | undefined {
  if (!colour) return undefined;

  const variable = toVariable(colour);

  return variable ? `var(${variable})` : colour;
}
```

- [ ] **Step 4: Write the lane element**

`src/Umbraco.Community.Kanban/Client/src/core/kanban-lane.element.ts`:

```ts
import { css, customElement, html, nothing, property, repeat } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { extractUmbColorVariable } from '@umbraco-cms/backoffice/resources';
import { formatLaneTotal, laneHasMore, nextSkip } from './board.model.js';
import { laneColourStyle } from './lane.model.js';
import './kanban-card.element.js';
import type { KanbanBoardLaneModel } from '../data/kanban-board.types.js';

/** One lane column: a header carrying its colour and total, its cards, and a "Show more". */
@customElement('umb-community-kanban-lane')
export class UmbCommunityKanbanLaneElement extends UmbLitElement {
  @property({ attribute: false })
  lane?: KanbanBoardLaneModel;

  @property({ type: Boolean })
  readonly = true;

  #onLoadMore() {
    if (!this.lane) return;

    this.dispatchEvent(
      new CustomEvent('kanban-load-more', {
        detail: { lane: this.lane.value, skip: nextSkip(this.lane) },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    if (!this.lane) return nothing;

    const colour = laneColourStyle(this.lane.colour, extractUmbColorVariable);

    return html`
      <div class="lane">
        <div class="header" style=${colour ? `border-top-color: ${colour}` : ''}>
          ${this.lane.icon ? html`<umb-icon name=${this.lane.icon}></umb-icon>` : nothing}
          <span class="name">${this.lane.name}</span>
          <uui-badge look="secondary">${formatLaneTotal(this.lane)}</uui-badge>
        </div>
        <div class="cards">
          ${repeat(
            this.lane.cards,
            (card) => card.key,
            (card) => html`<umb-community-kanban-card .card=${card}></umb-community-kanban-card>`,
          )}
          ${this.lane.cards.length === 0
            ? html`<span class="empty">${this.localize.term('general_empty')}</span>`
            : nothing}
        </div>
        ${laneHasMore(this.lane)
          ? html`<uui-button
              look="placeholder"
              label=${this.localize.term('general_showMore')}
              @click=${this.#onLoadMore}></uui-button>`
          : nothing}
      </div>
    `;
  }

  static override styles = [
    css`
      .lane {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-3);
        min-width: 280px;
        max-width: 320px;
        flex: 0 0 auto;
      }

      .header {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
        padding: var(--uui-size-space-2) var(--uui-size-space-3);
        background: var(--uui-color-surface-alt);
        border-top: 3px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius);
      }

      .name {
        flex: 1;
        font-weight: bold;
      }

      .cards {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-2);
      }

      .empty {
        color: var(--uui-color-text-alt);
        font-size: var(--uui-type-small-size);
        padding: var(--uui-size-space-2);
      }
    `,
  ];
}

export { UmbCommunityKanbanLaneElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-lane': UmbCommunityKanbanLaneElement;
  }
}
```

If `general_empty` or `general_showMore` are not real localisation keys in 18.0.2, `localize.term` degrades to echoing the key, which is visible but wrong — check the installed `en.ts`/`en-us.ts` translation files for the right keys and use those, or pass literal English text. Do not leave a key that does not resolve.

- [ ] **Step 5: Write the board element**

`src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`:

```ts
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
```

Lanes are laid out with a horizontal scroll on `.lanes`, not on the page — a board with fifteen lanes must not make the whole workspace scroll sideways.

- [ ] **Step 6: Run the tests and build to verify they pass**

Run: `cd src/Umbraco.Community.Kanban/Client && npm test && npm run build`
Expected: tests PASS with 3 new tests; `tsc --noEmit` and the build succeed.

- [ ] **Step 7: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core
git commit -m "feat: add the lane and board elements"
```

---

### Task 13: The collection view host

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/hosts/collection-view-board.element.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/hosts/manifests.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/bundle.manifests.ts`
- Test: `src/Umbraco.Community.Kanban/Client/src/hosts/manifests.test.ts`

**Interfaces:**
- Consumes: `<umb-community-kanban-board>` (Task 12); `KanbanServerDataSource` (Task 9); the constants from Task 9.
- Produces: the `collectionView` extension `Umb.Community.Kanban.CollectionView.Board`, offered wherever a document collection is configured.

Three contexts, each verified:

- `UMB_ENTITY_CONTEXT` (`@umbraco-cms/backoffice/entity`) for the parent document's GUID. The collection context does **not** expose it — this is exactly how the collection context resolves its own parent.
- `UMB_VARIANT_CONTEXT` (`@umbraco-cms/backoffice/variant`) for `displayCulture`. Null on an invariant site, which the server correctly reads as invariant.
- `UMB_COLLECTION_CONTEXT` (`@umbraco-cms/backoffice/collection`) for its `items` observable, which emits whenever the collection reloads. That is this milestone's reactivity: an edit saved elsewhere in the workspace reloads the collection, and the board reloads with it. Milestone 5's real-time sync adds a second trigger for the same reload, with no change to this contract.

- [ ] **Step 1: Write the failing test**

`src/Umbraco.Community.Kanban/Client/src/hosts/manifests.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { manifests } from './manifests.js';
import {
  KANBAN_COLLECTION_VIEW_BOARD_ALIAS,
  KANBAN_DOCUMENT_COLLECTION_ALIAS,
} from '@/constants.js';

describe('collection view manifests', () => {
  const board = manifests.find((manifest) => manifest.alias === KANBAN_COLLECTION_VIEW_BOARD_ALIAS);

  it('registers a board collection view', () => {
    expect(board).toBeDefined();
    expect(board?.type).toBe('collectionView');
  });

  it('describes itself for the layout picker', () => {
    const meta = (board as { meta?: { label?: string; icon?: string; pathName?: string } }).meta;

    expect(meta?.label).toBeTruthy();
    expect(meta?.icon).toBeTruthy();
    expect(meta?.pathName).toBeTruthy();
  });

  it('is offered only for document collections', () => {
    const conditions = (board as { conditions?: Array<{ alias: string; match?: string }> }).conditions;

    expect(conditions).toEqual([
      { alias: 'Umb.Condition.CollectionAlias', match: KANBAN_DOCUMENT_COLLECTION_ALIAS },
    ]);
  });

  it('loads its element lazily', () => {
    expect(typeof (board as { element?: unknown }).element).toBe('function');
  });
});
```

`pathName` is required by the manifest type and is what the layout's URL segment becomes — an omitted one produces a broken layout tab, which is why it is asserted rather than assumed.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/Umbraco.Community.Kanban/Client && npm test`
Expected: FAIL — cannot resolve `./manifests.js`.

- [ ] **Step 3: Write the host element**

`src/Umbraco.Community.Kanban/Client/src/hosts/collection-view-board.element.ts`:

```ts
import { customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_COLLECTION_CONTEXT } from '@umbraco-cms/backoffice/collection';
import { UMB_ENTITY_CONTEXT } from '@umbraco-cms/backoffice/entity';
import { UMB_VARIANT_CONTEXT } from '@umbraco-cms/backoffice/variant';
import { KanbanServerDataSource } from '@/data/kanban-server-data-source.js';
import type { KanbanDataSource } from '@/data/kanban-data-source.js';
import '@/core/kanban-board.element.js';

/**
 * Adapts the board to the document Collection layout picker.
 *
 * It supplies three things and nothing else: the parent document, the display culture, and
 * a data source. It deliberately does not resolve which board configuration to use — the
 * server does that from the parent, because a collection view cannot be handed custom
 * configuration (UmbCollectionConfiguration forwards only a fixed set of aliases).
 */
@customElement('umb-community-kanban-collection-view-board')
export class UmbCommunityKanbanCollectionViewBoardElement extends UmbLitElement {
  #datasource: KanbanDataSource = new KanbanServerDataSource(this);

  @state()
  private _parentId?: string;

  @state()
  private _culture?: string | null;

  constructor() {
    super();

    // The parent GUID comes from the entity context, not the collection context — the
    // collection context has no parent member and resolves its own parent the same way.
    this.consumeContext(UMB_ENTITY_CONTEXT, (context) => {
      this.observe(context?.unique, (unique) => {
        this._parentId = unique ?? undefined;
      }, '_kanbanParentUnique');
    });

    this.consumeContext(UMB_VARIANT_CONTEXT, (context) => {
      this.observe(context?.displayCulture, (culture) => {
        this._culture = culture;
      }, '_kanbanDisplayCulture');
    });

    // items emits on every collection load, which is the reload signal for this milestone.
    this.consumeContext(UMB_COLLECTION_CONTEXT, (context) => {
      this.observe(context?.items, () => {
        this.#board?.load();
      }, '_kanbanCollectionItems');
    });
  }

  /** The parent/culture pair the board was last loaded for, so a re-render is not a re-fetch. */
  #loadedFor?: string;

  get #board() {
    return this.shadowRoot?.querySelector('umb-community-kanban-board') ?? undefined;
  }

  override updated() {
    // The parent arrives asynchronously, so the first load happens here rather than in the
    // constructor — but updated() runs on every render, so it must fire only when the
    // parent or culture has actually changed. The collection's items observable owns
    // reloading for anything else.
    if (!this._parentId) return;

    const key = `${this._parentId}|${this._culture ?? ''}`;

    if (key === this.#loadedFor) return;

    this.#loadedFor = key;
    this.#board?.load();
  }

  override render() {
    if (!this._parentId) return html`<uui-loader></uui-loader>`;

    return html`
      <umb-community-kanban-board
        parent-id=${this._parentId}
        .culture=${this._culture}
        .datasource=${this.#datasource}
        ?readonly=${true}></umb-community-kanban-board>
    `;
  }
}

export { UmbCommunityKanbanCollectionViewBoardElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-collection-view-board': UmbCommunityKanbanCollectionViewBoardElement;
  }
}
```

The `#loadedFor` guard is load-bearing, not defensive tidiness: `updated()` runs on every render, and without it every state change re-fetches the whole board. Verify in the network tab during the manual verification below — more than one `GET /board` per navigation is a defect.

`nothing` is imported above but ends up unused once the render branches are final — remove it, since an unused import fails `tsc --noEmit` under this project's settings.

- [ ] **Step 4: Write the manifest**

`src/Umbraco.Community.Kanban/Client/src/hosts/manifests.ts`:

```ts
import {
  KANBAN_COLLECTION_VIEW_BOARD_ALIAS,
  KANBAN_DOCUMENT_COLLECTION_ALIAS,
} from '@/constants.js';

export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'collectionView',
    alias: KANBAN_COLLECTION_VIEW_BOARD_ALIAS,
    name: 'Kanban Board Collection View',
    element: () => import('./collection-view-board.element.js'),
    weight: 250,
    meta: {
      label: 'Kanban',
      icon: 'icon-grid',
      pathName: 'kanban',
    },
    conditions: [
      {
        alias: 'Umb.Condition.CollectionAlias',
        match: KANBAN_DOCUMENT_COLLECTION_ALIAS,
      },
    ],
  },
];
```

Weight 250 sits below the built-in table (300) and above cards, so Kanban is offered but table stays the familiar default.

- [ ] **Step 5: Register it in the bundle**

In `src/Umbraco.Community.Kanban/Client/src/bundle.manifests.ts`, add the import and spread alongside the existing ones. Do not remove or reorder what is already there:

```ts
import { manifests as collectionViewManifests } from './hosts/manifests.js';
```

and add `...collectionViewManifests,` to the exported array.

- [ ] **Step 6: Run the tests and build to verify they pass**

Run: `cd src/Umbraco.Community.Kanban/Client && npm test && npm run build`
Expected: tests PASS with 4 new tests; `tsc --noEmit` and the build succeed, emitting a `collection-view-board.element` chunk.

- [ ] **Step 7: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src
git commit -m "feat: add the collection view board host"
```

---

### Task 14: The Data Type workspace Kanban tab

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Models/Api/KanbanConfigurationResponseModel.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Models/KanbanConfigurationKindSerialisationTests.cs`
- Create: `src/Umbraco.Community.Kanban/Client/src/data/kanban-configuration-data-source.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/workspace-views/data-type-kanban.element.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/workspace-views/manifests.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/bundle.manifests.ts`
- Test: `src/Umbraco.Community.Kanban/Client/src/workspace-views/manifests.test.ts`

**Interfaces:**
- Consumes: `KanbanConfigurationResponseModel` and `KanbanConfigurationKind` (milestone 1); `KANBAN_CONFIGURATIONS_ENDPOINT`, `KANBAN_BOARD_CONFIG_ID_KEY`, `KANBAN_DATA_TYPE_WORKSPACE_VIEW_ALIAS`, `KANBAN_COLLECTION_PROPERTY_EDITOR_UI_ALIAS` (Task 9).
- Produces: the `workspaceView` extension `Umb.Community.Kanban.WorkspaceView.DataType.Kanban`, which writes `kanban.boardConfigId` onto a Collection data type — the setting `GET /board` resolves through in Task 5.

Without this tab there is no way to select a configuration at all, which is why it is in this milestone rather than deferred.

Two verified constraints shape it:

- **There is no extension condition for a data type's property editor UI alias.** The view registers unconditionally on the data type workspace and renders nothing unless `propertyEditorUiAlias === 'Umb.PropertyEditorUi.Collection'`.
- **`setPropertyValue` upserts by alias with no schema filtering,** and the data type's `values` array round-trips unknown aliases, so `kanban.boardConfigId` survives save. Confirmed in the workspace context source.

It writes the board key only; `kanban.calendarConfigId` arrives with the calendar in milestone 4.

The two Umbraco condition aliases are written as literals in the manifest rather than imported. Importing them would pull the backoffice package's import graph into the Node test environment, and they are Umbraco's constants rather than ours — the "no magic strings" rule covers *our* aliases, which do come from `constants.ts`.

- [ ] **Step 1: Write the failing serialisation test**

The client needs `kind` as a readable string. `System.Text.Json` serialises an enum as a number by default, and whether Umbraco's Management API JSON options reach a `[MapToApi]` controller of ours is not something to leave to chance — pin it on the model.

`tests/Umbraco.Community.Kanban.Tests/Models/KanbanConfigurationKindSerialisationTests.cs`:

```csharp
using System.Text.Json;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Tests.Models;

public class KanbanConfigurationKindSerialisationTests
{
    private static KanbanConfigurationResponseModel Model(KanbanConfigurationKind kind) => new()
    {
        Key = Guid.Parse("11111111-1111-1111-1111-111111111111"),
        Name = "Tasks by status",
        Kind = kind,
    };

    [Theory]
    [InlineData(KanbanConfigurationKind.Board, "Board")]
    [InlineData(KanbanConfigurationKind.Calendar, "Calendar")]
    public void Serialises_the_kind_as_a_string_so_the_client_can_match_on_it(
        KanbanConfigurationKind kind,
        string expected)
    {
        var json = JsonSerializer.Serialize(Model(kind));

        json.Should().Contain($"\"{expected}\"");
        json.Should().NotContain("\"kind\":0").And.NotContain("\"Kind\":0");
    }

    [Fact]
    public void Round_trips_the_kind()
    {
        var json = JsonSerializer.Serialize(Model(KanbanConfigurationKind.Calendar));

        JsonSerializer.Deserialize<KanbanConfigurationResponseModel>(json)!.Kind
            .Should().Be(KanbanConfigurationKind.Calendar);
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `dotnet test --filter FullyQualifiedName~KanbanConfigurationKindSerialisationTests`
Expected: FAIL — the kind serialises as a number.

- [ ] **Step 3: Pin the enum to strings**

In `src/Umbraco.Community.Kanban/Models/Api/KanbanConfigurationResponseModel.cs`, add the using and the attribute. Nothing else in the file changes:

```csharp
using System.Text.Json.Serialization;

namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>
/// Serialised as a string, not an ordinal, so the client matches on "Board" rather than on a
/// number whose meaning would shift if this enum ever gained a member.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum KanbanConfigurationKind
{
    Board,
    Calendar,
}
```

- [ ] **Step 4: Run the server tests**

Run: `dotnet build && dotnet test`
Expected: all pass, 3 new test cases.

- [ ] **Step 5: Write the configuration data source**

`src/Umbraco.Community.Kanban/Client/src/data/kanban-configuration-data-source.ts`:

```ts
import { umbHttpClient } from '@umbraco-cms/backoffice/http-client';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { KANBAN_CONFIGURATIONS_ENDPOINT } from '@/constants.js';

/** Mirrors KanbanConfigurationResponseModel. */
export interface KanbanConfigurationModel {
  key: string;
  name: string;
  kind: 'Board' | 'Calendar';
  appliesTo: string[];
  tabName?: string | null;
  tabIcon?: string | null;
}

/** Every Kanban Board configuration, for the Data Type workspace picker. */
export async function getBoardConfigurations(host: UmbControllerHost): Promise<KanbanConfigurationModel[]> {
  const { data, error } = await tryExecute(
    host,
    umbHttpClient.get<KanbanConfigurationModel[]>({
      url: KANBAN_CONFIGURATIONS_ENDPOINT,
      security: [{ type: 'http', scheme: 'bearer' }],
    }),
  );

  if (error || !data) return [];

  return data.filter((configuration) => configuration.kind === 'Board');
}
```

- [ ] **Step 6: Write the failing manifest test**

`src/Umbraco.Community.Kanban/Client/src/workspace-views/manifests.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { manifests } from './manifests.js';
import { KANBAN_DATA_TYPE_WORKSPACE_VIEW_ALIAS } from '@/constants.js';

describe('data type workspace view manifests', () => {
  const view = manifests.find((manifest) => manifest.alias === KANBAN_DATA_TYPE_WORKSPACE_VIEW_ALIAS);

  it('registers a Kanban workspace view', () => {
    expect(view).toBeDefined();
    expect(view?.type).toBe('workspaceView');
  });

  it('names itself and gives itself a route segment', () => {
    const meta = (view as { meta?: { label?: string; pathname?: string; icon?: string } }).meta;

    expect(meta?.label).toBeTruthy();
    expect(meta?.pathname).toBeTruthy();
    expect(meta?.icon).toBeTruthy();
  });

  it('is scoped to the data type workspace', () => {
    const conditions = (view as { conditions?: Array<{ alias: string; match?: string }> }).conditions;

    expect(conditions).toEqual([
      { alias: 'Umb.Condition.WorkspaceAlias', match: 'Umb.Workspace.DataType' },
    ]);
  });

  it('loads its element lazily', () => {
    expect(typeof (view as { element?: unknown }).element).toBe('function');
  });
});
```

Note `pathname`, lower-case, as the data type workspace views use — unlike `collectionView`'s `pathName`. The inconsistency is Umbraco's; both are verified.

- [ ] **Step 7: Run it to verify it fails**

Run: `cd src/Umbraco.Community.Kanban/Client && npm test`
Expected: FAIL — cannot resolve `./manifests.js`.

- [ ] **Step 8: Write the view element**

`src/Umbraco.Community.Kanban/Client/src/workspace-views/data-type-kanban.element.ts`:

```ts
import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_DATA_TYPE_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/data-type';
import {
  KANBAN_BOARD_CONFIG_ID_KEY,
  KANBAN_COLLECTION_PROPERTY_EDITOR_UI_ALIAS,
} from '@/constants.js';
import { getBoardConfigurations, type KanbanConfigurationModel } from '@/data/kanban-configuration-data-source.js';

/**
 * Lets an editor choose which Kanban Board configuration a Collection data type's board
 * layout uses, writing it to `kanban.boardConfigId`. That key is what GET /board resolves
 * through, because a collection view cannot be handed custom configuration directly.
 *
 * There is no extension condition for a data type's property editor UI alias, so this
 * registers on every data type workspace and hides itself when the alias does not match.
 */
@customElement('umb-community-kanban-data-type-view')
export class UmbCommunityKanbanDataTypeViewElement extends UmbLitElement {
  #workspace?: typeof UMB_DATA_TYPE_WORKSPACE_CONTEXT.TYPE;

  @state()
  private _applies = false;

  @state()
  private _configurations: KanbanConfigurationModel[] = [];

  @state()
  private _selected = '';

  constructor() {
    super();

    this.consumeContext(UMB_DATA_TYPE_WORKSPACE_CONTEXT, (context) => {
      this.#workspace = context;

      if (!context) return;

      this.observe(context.propertyEditorUiAlias, (alias) => {
        this._applies = alias === KANBAN_COLLECTION_PROPERTY_EDITOR_UI_ALIAS;

        if (this._applies) this.#load();
      }, '_kanbanPropertyEditorUiAlias');
    });
  }

  async #load() {
    this._configurations = await getBoardConfigurations(this);
    this._selected = this.#workspace?.getPropertyValue<string>(KANBAN_BOARD_CONFIG_ID_KEY) ?? '';
  }

  async #onChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this._selected = value;

    // The empty option clears the setting, which returns the layout to "not configured"
    // rather than leaving a dangling key.
    await this.#workspace?.setPropertyValue(KANBAN_BOARD_CONFIG_ID_KEY, value || undefined);
  }

  override render() {
    if (!this._applies) return nothing;

    return html`
      <uui-box headline="Kanban">
        <umb-property-layout
          label="Board configuration"
          description="Which Kanban Board configuration this collection's Kanban layout uses.">
          ${this._configurations.length
            ? html`<uui-select
                slot="editor"
                label="Board configuration"
                .value=${this._selected}
                .options=${this.#options()}
                @change=${this.#onChange}></uui-select>`
            : html`<span slot="editor" class="empty"
                >No Kanban Board data types exist yet. Create one under Settings → Data Types.</span
              >`}
        </umb-property-layout>
      </uui-box>
    `;
  }

  #options() {
    return [
      { name: 'Not set', value: '', selected: this._selected === '' },
      ...this._configurations.map((configuration) => ({
        name: configuration.name,
        value: configuration.key,
        selected: configuration.key === this._selected,
      })),
    ];
  }

  static override styles = [
    css`
      :host {
        display: block;
        margin: var(--uui-size-layout-1);
      }

      .empty {
        color: var(--uui-color-text-alt);
      }
    `,
  ];
}

export { UmbCommunityKanbanDataTypeViewElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-data-type-view': UmbCommunityKanbanDataTypeViewElement;
  }
}
```

The "no Kanban Board data types exist yet" branch matters: an empty dropdown with no explanation is the worst version of this screen.

If `typeof UMB_DATA_TYPE_WORKSPACE_CONTEXT.TYPE` is not how the installed package exposes the context's type, import the context class type directly instead — the members used (`propertyEditorUiAlias`, `getPropertyValue`, `setPropertyValue`) are all verified to exist.

- [ ] **Step 9: Write the manifest and register it**

`src/Umbraco.Community.Kanban/Client/src/workspace-views/manifests.ts`:

```ts
import { KANBAN_DATA_TYPE_WORKSPACE_VIEW_ALIAS } from '@/constants.js';

export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'workspaceView',
    alias: KANBAN_DATA_TYPE_WORKSPACE_VIEW_ALIAS,
    name: 'Kanban Data Type Workspace View',
    element: () => import('./data-type-kanban.element.js'),
    weight: 80,
    meta: {
      label: 'Kanban',
      pathname: 'kanban',
      icon: 'icon-grid',
    },
    conditions: [
      {
        alias: 'Umb.Condition.WorkspaceAlias',
        match: 'Umb.Workspace.DataType',
      },
    ],
  },
];
```

In `src/Umbraco.Community.Kanban/Client/src/bundle.manifests.ts`, add the import and spread alongside the existing ones:

```ts
import { manifests as dataTypeWorkspaceViewManifests } from './workspace-views/manifests.js';
```

and add `...dataTypeWorkspaceViewManifests,` to the exported array.

- [ ] **Step 10: Run the full suite and build**

Run: `dotnet build && dotnet test && cd src/Umbraco.Community.Kanban/Client && npm test && npm run build`
Expected: everything passes; 4 new client tests.

- [ ] **Step 11: Commit**

```bash
git add src/Umbraco.Community.Kanban tests/Umbraco.Community.Kanban.Tests
git commit -m "feat: add the data type workspace Kanban tab"
```

---

## Manual verification

The whole milestone only proves itself on a running site. After Task 14:

1. In the your-it-team-cloud repo, add a `ProjectReference` to `Umbraco.Community.Kanban` from `src/YourITTeam/YourITTeam.csproj` if one is not already there. Build and start the site.
2. Settings → Data Types → Create → **Kanban Board**. Set the lane property to the alias of a dropdown property on a document type that has children, set a card property or two, and save. Note its name.
3. Open the Collection data type that document type uses (or create one and assign it). It should now show a **Kanban** tab. The tab must be **absent** on a data type using any other property editor — check a text box data type to confirm.
4. On the Kanban tab, pick the board configuration and save.
5. Under the same Collection data type's Layouts setting, add the **Kanban** layout.
6. Open a document of that type in Content. The Kanban layout should appear alongside Table. Switching to it should render one column per dropdown option, plus **(Unassigned)**, with cards for the children.
7. Confirm each of these:
   - lane header counts match the number of children in each lane
   - a lane with more children than the configured page size shows **Show more**, and clicking it appends only to that lane
   - clicking **Show more** twice in quick succession does not duplicate cards
   - card publish-state badges match what the content tree shows
   - the entity actions menu on a card opens, and opening it does not also trigger the card click
   - editing a child's lane property and saving, then returning to the board, shows the card in its new lane
   - exactly **one** `GET /board` request fires per navigation to the layout (see Task 13's guard)
8. Remove the configuration from the Kanban tab and reload the board: it must show the "no Kanban configuration yet" guidance, not an error toast.
9. Log in as a user restricted to a subtree and confirm children they cannot browse appear in neither the cards nor the lane counts.

## What this plan deliberately leaves out

These belong to later milestones and must not be built here:

- Drag, lane write-back, pending-changes state and publish-all — milestone 3
- The calendar layout and `GET /calendar` — milestone 4
- The content app host, the `backofficeEntryPoint` that registers one per configuration, and SignalR real-time sync — milestone 5
- The Contentment Data List lane source — milestone 6
- Inline (unsaved) configuration on `GET /board`; the injected host that would need it does not exist yet
- Media picker thumbnails on cards. No built-in `valueSummary` extension covers a media picker, so a thumbnail means authoring one plus media-URL resolution. Media properties configured as card properties render through the default value summary until then — a documented limitation, not a bug
- Wiring `POST /lanes/preview` into the lane override editor's `lanes` input. This is milestone 1's known gap, and it is a *settings* surface rather than a board surface. The consequence to accept for now: lane colours render from the cycled palette only, because the override editor cannot be used to author them. Scheduled for milestone 3
- Property-alias pickers for `laneProperty` and `cardProperties`, which remain text inputs
- A search-index-backed data source for parents past the child cap
