# Card Workspace Modal and Child Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a Kanban card open its document in the backoffice workspace modal, list its children with an edit button each, create a new child in the same modal, and switch the package's icon to `icon-columns`.

**Architecture:** One `UmbModalRouteRegistrationController` on the board host serves editing and creating alike — the path passed to `open()` decides which. Cards stay ignorant of modals: they raise `kanban-open-document` and `kanban-create-child`, both bubbling to the host. Children come from a single level-filtered `GetPagedDescendants` query per board, capped, ordered by two new board settings, grouped per card by a pure assembler.

**Tech Stack:** .NET 10 / Umbraco 18 (`Umbraco.Cms.Core`), xUnit + FluentAssertions, Lit 3 web components against `@umbraco-cms/backoffice` 18, vitest.

**Spec:** [docs/superpowers/specs/2026-07-29-card-workspace-modal-and-child-items-design.md](../specs/2026-07-29-card-workspace-modal-and-child-items-design.md)

## Global Constraints

- **File-scoped namespaces**, **primary constructors**, and **no underscore prefix on private fields** — the repo's .NET style, no exceptions.
- **Private members on Lit elements use `#name`** (native private), `@state()` fields use a leading underscore (`_status`) — match the existing elements exactly.
- **Never import from `@umbraco-cms/backoffice/dist-cms/...`** — only public subpath exports (`/document`, `/document-type`, `/document-blueprint`, `/modal`, `/router`, `/lit-element`, `/external/lit`).
- **Every new public C# member gets an XML doc comment** explaining *why*, not what — the existing files are the tone to match.
- **Server tests are xUnit + FluentAssertions** (`.Should().Be(...)`), named in `Sentence_case_with_underscores` for service tests and `Member_DescribesBehaviour` for model tests. Follow the file you are editing.
- **Client tests are vitest** (`describe`/`it`/`expect`).
- **Existing call sites must keep compiling.** New parameters on `KanbanCardMapper.Map` and `KanbanBoardComposerRequest` are **optional with defaults** for exactly this reason — do not make them required.
- Server test command: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj`
- Client test command: `cd src/Umbraco.Community.Kanban/Client && npm run test`
- Client type-check + build: `cd src/Umbraco.Community.Kanban/Client && npm run build`
- Repo root for every path below: `/Users/gandalf/Source/Repos/Umbraco.Community.Kanban`

## File Structure

**New — server**

| File | Responsibility |
| --- | --- |
| `src/Umbraco.Community.Kanban/Services/KanbanChildOrdering.cs` | Maps the two child-sort settings onto an Umbraco `Ordering`. Pure. |
| `src/Umbraco.Community.Kanban/Services/KanbanCardChildAssembler.cs` | Groups grandchildren by parent id into per-card child lists with totals. Pure. |
| `tests/Umbraco.Community.Kanban.Tests/Services/KanbanChildOrderingTests.cs` | Tests for the above. |
| `tests/Umbraco.Community.Kanban.Tests/Services/KanbanCardChildAssemblerTests.cs` | Tests for the above. |

**New — client**

| File | Responsibility |
| --- | --- |
| `src/Umbraco.Community.Kanban/Client/src/core/card-children.model.ts` | `formatChildOverflow` — the "+N more" line. Pure. |
| `src/Umbraco.Community.Kanban/Client/src/core/card-children.model.test.ts` | Tests for the above. |
| `src/Umbraco.Community.Kanban/Client/src/core/kanban-card-children.element.ts` | The child list, the Add button, the type/blueprint popovers. Owns two core repositories. |

**Modified** — the table in the spec's *Files* section is the authority; each task below names its own.

---

### Task 1: The board icon becomes `icon-columns`

Independent of everything else. Do it first so it is not tangled with the rest.

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/property-editors/board/manifests.ts:27`
- Modify: `src/Umbraco.Community.Kanban/Client/src/hosts/manifests.ts:15`
- Modify: `src/Umbraco.Community.Kanban/Client/src/workspace-views/manifests.ts:22`
- Modify: `src/Umbraco.Community.Kanban/Client/src/workspace-views/data-type-kanban.element.ts:219`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. No other task depends on this.

- [ ] **Step 1: Change all four occurrences**

Each is the literal string `icon-grid` becoming `icon-columns`. In the three manifest files it is the value of `meta.icon`:

```ts
      icon: 'icon-columns',
```

In `data-type-kanban.element.ts` it is the ref node's icon:

```ts
        <uui-icon slot="icon" name="icon-columns"></uui-icon>
```

Do **not** touch `tabIcon` anywhere: those are per-configuration values an editor picks, and the only `icon-grid` occurrences left in the repo after this task are in `docs/superpowers/plans/` (historical) and test fixtures for `tabIcon`.

- [ ] **Step 2: Verify nothing else references the old icon**

Run: `grep -rn "icon-grid" src/Umbraco.Community.Kanban/Client/src`
Expected: no output.

- [ ] **Step 3: Type-check and test**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: build succeeds, all tests pass (no test asserts an icon).

- [ ] **Step 4: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src
git commit -m "feat: use icon-columns for the Kanban board, not icon-grid"
```

---

### Task 2: Child item settings and the sort ordering

Three new board settings and the pure mapper that turns two of them into an `Ordering`. Nothing reads the settings yet — Task 4 wires them in.

**Files:**
- Create: `src/Umbraco.Community.Kanban/Services/KanbanChildOrdering.cs`
- Create: `tests/Umbraco.Community.Kanban.Tests/Services/KanbanChildOrderingTests.cs`
- Modify: `src/Umbraco.Community.Kanban/Models/KanbanBoardConfiguration.cs` (after `CardProperties`, before `LanePageSize`)
- Modify: `src/Umbraco.Community.Kanban/Client/src/property-editors/board/manifests.ts` (settings list and `defaultData`)
- Modify: `src/Umbraco.Community.Kanban/Constants.cs`
- Modify: `tests/Umbraco.Community.Kanban.Tests/Models/KanbanBoardConfigurationTests.cs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `KanbanBoardConfiguration.ShowChildItems` (`bool`), `.ChildItemsSortBy` (`string?`), `.ChildItemsSortDirection` (`string?`)
  - `Umbraco.Community.Kanban.Services.KanbanChildOrdering.From(string? sortBy, string? direction, string? culture)` → `Umbraco.Cms.Core.Services.Ordering`
  - `Constants.CardChildDisplayCap` (`int` = 5), `Constants.DefaultGrandchildCap` (`int` = 2000)

- [ ] **Step 1: Write the failing tests**

Create `tests/Umbraco.Community.Kanban.Tests/Services/KanbanChildOrderingTests.cs`:

```csharp
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanChildOrderingTests
{
    [Theory]
    [InlineData("sortOrder", "sortOrder")]
    [InlineData("name", "name")]
    [InlineData("updateDate", "updateDate")]
    [InlineData("createDate", "createDate")]
    public void From_MapsEachOfferedField(string sortBy, string expected)
    {
        KanbanChildOrdering.From(sortBy, null, null).OrderBy.Should().Be(expected);
    }

    [Theory]
    [InlineData("NAME")]
    [InlineData(" name ")]
    public void From_IsForgivingAboutCasingAndPadding(string sortBy)
    {
        KanbanChildOrdering.From(sortBy, null, null).OrderBy.Should().Be("name");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("nonsense")]
    public void From_FallsBackToSortOrder_SoAHandEditedConfigurationCannotFailABoard(string? sortBy)
    {
        KanbanChildOrdering.From(sortBy, null, null).OrderBy.Should().Be("sortOrder");
    }

    [Fact]
    public void From_IsAscendingUnlessDescendingIsAsked()
    {
        KanbanChildOrdering.From("name", null, null).Direction.Should().Be(Direction.Ascending);
        KanbanChildOrdering.From("name", "asc", null).Direction.Should().Be(Direction.Ascending);
        KanbanChildOrdering.From("name", "nonsense", null).Direction.Should().Be(Direction.Ascending);
        KanbanChildOrdering.From("name", "DESC", null).Direction.Should().Be(Direction.Descending);
    }

    [Fact]
    public void From_PassesTheCultureForANameOrdering_BecauseANameIsStoredPerCulture()
    {
        Ordering ordering = KanbanChildOrdering.From("name", null, "da-DK");

        ordering.Culture.Should().Be("da-DK");
    }

    [Fact]
    public void From_LeavesEveryOtherFieldInvariant()
    {
        // A date or a sort order is stored once per document, so ordering it by culture is meaningless
        // and Ordering would carry a culture that changes nothing.
        KanbanChildOrdering.From("updateDate", null, "da-DK").Culture.Should().BeEmpty();
        KanbanChildOrdering.From("sortOrder", null, "da-DK").Culture.Should().BeEmpty();
    }
}
```

Note `Culture.Should().BeEmpty()`, not `BeNull()`: `Ordering`'s constructor turns a null culture into `string.Empty`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj --filter FullyQualifiedName~KanbanChildOrderingTests`
Expected: compile error — `KanbanChildOrdering` does not exist.

- [ ] **Step 3: Write the ordering mapper**

Create `src/Umbraco.Community.Kanban/Services/KanbanChildOrdering.cs`:

```csharp
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// Maps a board's child-item sort settings onto an Umbraco <see cref="Ordering" />. Pure, so the
/// mapping is tested without a database.
/// </summary>
/// <remarks>
/// Settings are stored as strings rather than an enum, like every other Board setting, which means
/// anything unrecognised — a hand-edited configuration, a value from a future version — must degrade
/// rather than fail. Sort order ascending is the fallback because it is what Umbraco itself lists
/// children by.
/// </remarks>
public static class KanbanChildOrdering
{
    public const string SortOrderField = "sortOrder";
    public const string NameField = "name";
    public const string UpdateDateField = "updateDate";
    public const string CreateDateField = "createDate";

    public const string Ascending = "asc";
    public const string Descending = "desc";

    public static Ordering From(string? sortBy, string? direction, string? culture)
    {
        var field = Field(sortBy);
        Direction sortDirection = IsDescending(direction) ? Direction.Descending : Direction.Ascending;

        // Only a name is stored per culture; ordering any other field by culture would carry a culture
        // that changes nothing.
        return field == NameField
            ? Ordering.By(field, sortDirection, culture)
            : Ordering.By(field, sortDirection);
    }

    private static string Field(string? sortBy) => sortBy?.Trim().ToLowerInvariant() switch
    {
        "name" => NameField,
        "updatedate" => UpdateDateField,
        "createdate" => CreateDateField,
        _ => SortOrderField,
    };

    private static bool IsDescending(string? direction) =>
        string.Equals(direction?.Trim(), Descending, StringComparison.OrdinalIgnoreCase);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj --filter FullyQualifiedName~KanbanChildOrderingTests`
Expected: PASS.

- [ ] **Step 5: Write the failing configuration test**

Append to `tests/Umbraco.Community.Kanban.Tests/Models/KanbanBoardConfigurationTests.cs`, inside the class:

```csharp
    [Fact]
    public void ChildItems_AreOffAndUnsortedByDefault_SoAnExistingBoardIsUnchanged()
    {
        var configuration = new KanbanBoardConfiguration();

        configuration.ShowChildItems.Should().BeFalse();
        configuration.ChildItemsSortBy.Should().BeNull();
        configuration.ChildItemsSortDirection.Should().BeNull();
    }
```

- [ ] **Step 6: Run it to verify it fails**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj --filter FullyQualifiedName~KanbanBoardConfigurationTests`
Expected: compile error — `ShowChildItems` does not exist.

- [ ] **Step 7: Add the three configuration fields**

In `src/Umbraco.Community.Kanban/Models/KanbanBoardConfiguration.cs`, after the `CardProperties` property:

```csharp
    /// <summary>
    /// Whether each card lists its own children. Off by default, and the board skips the query that
    /// reads them entirely when it is off — so a board whose cards have no meaningful children pays
    /// nothing for the feature.
    /// </summary>
    [ConfigurationField("showChildItems")]
    public bool ShowChildItems { get; set; }

    /// <summary>
    /// Which field child items are ordered by: one of the fields
    /// <see cref="Services.KanbanChildOrdering" /> understands. Null means sort order.
    /// </summary>
    [ConfigurationField("childItemsSortBy")]
    public string? ChildItemsSortBy { get; set; }

    /// <summary>"asc" or "desc". Null means ascending.</summary>
    [ConfigurationField("childItemsSortDirection")]
    public string? ChildItemsSortDirection { get; set; }
```

- [ ] **Step 8: Add the two caps to Constants**

In `src/Umbraco.Community.Kanban/Constants.cs`, after `DefaultChildCap`:

```csharp
    /// <summary>
    /// How many grandchildren a board reads to fill its cards' child lists. Deliberately larger than
    /// <see cref="DefaultChildCap" />: it covers every card's children at once, in one query.
    /// </summary>
    public const int DefaultGrandchildCap = 2000;

    /// <summary>
    /// How many children a card lists. A card is a summary, so there is no "show more" — the rest are
    /// reported as a count and seen by opening the card.
    /// </summary>
    public const int CardChildDisplayCap = 5;
```

- [ ] **Step 9: Run the whole server suite**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj`
Expected: PASS.

- [ ] **Step 10: Add the three settings to the property editor UI**

In `src/Umbraco.Community.Kanban/Client/src/property-editors/board/manifests.ts`, insert into `settings.properties` immediately after the `cardProperties` entry:

```ts
          {
            alias: 'showChildItems',
            label: 'Show child items',
            description: 'List each card’s own children on the card, with an edit button and an add button.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
          },
          {
            alias: 'childItemsSortBy',
            label: 'Sort child items by',
            description: 'Used only when child items are shown.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.Dropdown',
            config: [
              {
                alias: 'items',
                value: [
                  { name: 'Sort order', value: 'sortOrder' },
                  { name: 'Name', value: 'name' },
                  { name: 'Last edited', value: 'updateDate' },
                  { name: 'Created', value: 'createDate' },
                ],
              },
            ],
          },
          {
            alias: 'childItemsSortDirection',
            label: 'Sort child items',
            description: 'Used only when child items are shown.',
            propertyEditorUiAlias: 'Umb.PropertyEditorUi.Dropdown',
            config: [
              {
                alias: 'items',
                value: [
                  { name: 'Ascending', value: 'asc' },
                  { name: 'Descending', value: 'desc' },
                ],
              },
            ],
          },
```

And add the two defaults to `settings.defaultData`, after the `cardProperties` entry:

```ts
          { alias: 'childItemsSortBy', value: 'sortOrder' },
          { alias: 'childItemsSortDirection', value: 'asc' },
```

`showChildItems` gets **no** default: absent means false, and a default of `false` would be noise. Defaults apply to newly created data types only, so no existing board changes.

- [ ] **Step 11: Type-check and test the client**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: build succeeds, tests pass.

- [ ] **Step 12: Verify the dropdown renders in the backoffice**

The `items` config shape for `Umb.PropertyEditorUi.Dropdown` is the one thing here that cannot be unit-tested. Open a Kanban Board data type in the backoffice and confirm **Sort child items by** shows four named options and saves the underlying value (`sortOrder`, not `Sort order`). If the dropdown renders empty, the config alias is wrong — check `Umb.PropertyEditorUi.Dropdown`'s manifest in `@umbraco-cms/backoffice` for the expected shape and fix the `config` block, nothing else.

- [ ] **Step 13: Commit**

```bash
git add src/Umbraco.Community.Kanban tests/Umbraco.Community.Kanban.Tests
git commit -m "feat: add child item settings and their sort ordering mapper"
```

---

### Task 3: Per-card children on the card model

The pure part of item 6: the models the response carries, and the assembler that groups a flat list of grandchildren into them. Still nothing queries anything.

**Files:**
- Create: `src/Umbraco.Community.Kanban/Services/KanbanCardChildAssembler.cs`
- Create: `tests/Umbraco.Community.Kanban.Tests/Services/KanbanCardChildAssemblerTests.cs`
- Modify: `src/Umbraco.Community.Kanban/Models/Api/KanbanBoardResponseModel.cs`
- Modify: `src/Umbraco.Community.Kanban/Services/KanbanCardMapper.cs`
- Modify: `tests/Umbraco.Community.Kanban.Tests/Services/KanbanCardMapperTests.cs`

**Interfaces:**
- Consumes: `Constants.CardChildDisplayCap` (Task 2).
- Produces:
  - `KanbanCardChildModel { Guid Key; string Name; string? Icon }`
  - `KanbanCardChildren(IReadOnlyList<KanbanCardChildModel> Children, int Total, bool TotalIsExact)` with `KanbanCardChildren.None`
  - `KanbanCardModel.ContentTypeKey` (`Guid`), `.CanCreate` (`bool`), `.Children`, `.ChildTotal`, `.ChildTotalIsExact`
  - `KanbanCardChildAssembler.Assemble(IEnumerable<IContent> grandchildren, ISet<Guid> browseable, bool capped, string? culture, int displayCap)` → `IReadOnlyDictionary<int, KanbanCardChildren>` keyed by **parent id** (`IContent.ParentId`)
  - `KanbanCardMapper.Map(..., bool canCreate = false, KanbanCardChildren? children = null)`
  - `KanbanCardMapper.ResolveName(IContent content, string? culture)` — now public

- [ ] **Step 1: Write the failing assembler tests**

Create `tests/Umbraco.Community.Kanban.Tests/Services/KanbanCardChildAssemblerTests.cs`:

```csharp
using Umbraco.Cms.Core.Models;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanCardChildAssemblerTests
{
    private static readonly FakeShortStringHelper ShortStrings = new();

    private static ContentType LineItemType(ContentVariation variations = ContentVariation.Nothing) =>
        new(ShortStrings, -1)
        {
            Alias = "lineItem",
            Name = "Line item",
            Icon = "icon-receipt color-blue",
            Variations = variations,
        };

    /// <param name="parentId">The card's integer id — what the assembler groups by.</param>
    private static Content Child(string name, int parentId, ContentType? contentType = null) =>
        new(name, parentId, contentType ?? LineItemType()) { Key = Guid.NewGuid() };

    private static ISet<Guid> All(params IContent[] content) => content.Select(c => c.Key).ToHashSet();

    [Fact]
    public void Groups_children_under_the_card_they_belong_to()
    {
        Content first = Child("A", 10);
        Content second = Child("B", 10);
        Content other = Child("C", 20);

        IReadOnlyDictionary<int, KanbanCardChildren> assembled = KanbanCardChildAssembler.Assemble(
            [first, second, other], All(first, second, other), capped: false, culture: null, displayCap: 5);

        assembled[10].Children.Select(child => child.Name).Should().Equal("A", "B");
        assembled[20].Children.Select(child => child.Name).Should().Equal("C");
    }

    [Fact]
    public void Preserves_the_order_it_was_given()
    {
        // The query orders globally and grouping preserves order within a group, which is what makes
        // one ordered query enough for every card.
        Content second = Child("B", 10);
        Content first = Child("A", 10);

        KanbanCardChildAssembler.Assemble([second, first], All(second, first), false, null, 5)[10]
            .Children.Select(child => child.Name).Should().Equal("B", "A");
    }

    [Fact]
    public void Carries_the_key_and_the_content_type_icon_untouched()
    {
        Content child = Child("A", 10);

        KanbanCardChildModel model = KanbanCardChildAssembler.Assemble([child], All(child), false, null, 5)[10]
            .Children.Single();

        model.Key.Should().Be(child.Key);
        model.Icon.Should().Be("icon-receipt color-blue");
    }

    [Fact]
    public void Truncates_the_list_at_the_display_cap_but_counts_every_row()
    {
        List<Content> children = Enumerable.Range(0, 7).Select(index => Child($"C{index}", 10)).ToList();

        KanbanCardChildren assembled = KanbanCardChildAssembler.Assemble(
            children, All([.. children]), capped: false, culture: null, displayCap: 5)[10];

        assembled.Children.Should().HaveCount(5);
        assembled.Total.Should().Be(7);
        assembled.TotalIsExact.Should().BeTrue();
    }

    [Fact]
    public void Reports_the_total_as_a_lower_bound_when_the_query_was_capped()
    {
        Content child = Child("A", 10);

        KanbanCardChildAssembler.Assemble([child], All(child), capped: true, culture: null, displayCap: 5)[10]
            .TotalIsExact.Should().BeFalse();
    }

    [Fact]
    public void Drops_children_the_user_may_not_browse_from_the_list_and_the_total()
    {
        // The count must never disclose a node the user cannot see.
        Content visible = Child("A", 10);
        Content hidden = Child("B", 10);

        KanbanCardChildren assembled = KanbanCardChildAssembler.Assemble(
            [visible, hidden], All(visible), capped: false, culture: null, displayCap: 5)[10];

        assembled.Children.Select(child => child.Name).Should().Equal("A");
        assembled.Total.Should().Be(1);
    }

    [Fact]
    public void Omits_a_card_that_ends_up_with_no_visible_children()
    {
        Content hidden = Child("B", 10);

        KanbanCardChildAssembler.Assemble([hidden], new HashSet<Guid>(), false, null, 5)
            .Should().BeEmpty();
    }

    [Fact]
    public void Reads_the_name_for_the_requested_culture()
    {
        var child = new Content("fallback", 10, LineItemType(ContentVariation.Culture)) { Key = Guid.NewGuid() };
        child.SetCultureName("Linje", "da-DK");

        KanbanCardChildAssembler.Assemble([child], All(child), false, "da-DK", 5)[10]
            .Children.Single().Name.Should().Be("Linje");
    }

    [Fact]
    public void None_is_an_empty_exact_result()
    {
        KanbanCardChildren.None.Children.Should().BeEmpty();
        KanbanCardChildren.None.Total.Should().Be(0);
        KanbanCardChildren.None.TotalIsExact.Should().BeTrue();
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj --filter FullyQualifiedName~KanbanCardChildAssemblerTests`
Expected: compile error — `KanbanCardChildAssembler` and `KanbanCardChildModel` do not exist.

- [ ] **Step 3: Add the models**

In `src/Umbraco.Community.Kanban/Models/Api/KanbanBoardResponseModel.cs`, above `KanbanCardModel`:

```csharp
/// <summary>One child of a card — enough to list it and open it, and nothing more.</summary>
public sealed class KanbanCardChildModel
{
    public required Guid Key { get; init; }

    public required string Name { get; init; }

    /// <summary>The content type icon verbatim, colour suffix and all, as a card's own icon is.</summary>
    public string? Icon { get; init; }
}
```

Then, inside `KanbanCardModel`, after `CanUpdate`:

```csharp
    /// <summary>
    /// Whether the current user may create under this card. Gates the card's add button, so the
    /// button never appears for a user the workspace would then refuse.
    /// </summary>
    public bool CanCreate { get; init; }

    /// <summary>
    /// The card's content type key. Carried alongside the alias because resolving which types may be
    /// created under this card needs the key: the client asks Umbraco's own document type structure
    /// repository, which is keyed by GUID.
    /// </summary>
    public required Guid ContentTypeKey { get; init; }

    /// <summary>
    /// The first few children of this card, in the board's configured child order. Empty unless the
    /// board's <c>showChildItems</c> setting is on.
    /// </summary>
    public IReadOnlyList<KanbanCardChildModel> Children { get; init; } = [];

    /// <summary>
    /// How many children of this card the board read and the user may browse. Unlike
    /// <see cref="KanbanBoardResponseModel.ChildCount" /> this IS permission-filtered and is meant to
    /// be displayed.
    /// </summary>
    public int ChildTotal { get; init; }

    /// <summary>
    /// False when the board hit its grandchild cap, making <see cref="ChildTotal" /> a lower bound —
    /// the same distinction <see cref="KanbanBoardLaneModel.TotalIsExact" /> draws for a lane.
    /// </summary>
    public bool ChildTotalIsExact { get; init; } = true;
```

`ContentTypeKey` is `required`, which is safe: `KanbanCardMapper` is the only thing that constructs a `KanbanCardModel`.

Finally, on `KanbanBoardResponseModel`, after `ChildCount`:

```csharp
    /// <summary>
    /// Whether this board lists each card's children. Board-wide state rather than per-card data, and
    /// stated explicitly because a card with no children is otherwise indistinguishable from a board
    /// that does not show them.
    /// </summary>
    public bool ShowChildItems { get; init; }
```

- [ ] **Step 4: Write the assembler**

Create `src/Umbraco.Community.Kanban/Services/KanbanCardChildAssembler.cs`:

```csharp
using Umbraco.Cms.Core.Models;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

/// <param name="Children">The children to list, capped for display.</param>
/// <param name="Total">Every browse-permitted child the board read for this card.</param>
/// <param name="TotalIsExact">False when the board's grandchild cap was hit.</param>
public sealed record KanbanCardChildren(
    IReadOnlyList<KanbanCardChildModel> Children,
    int Total,
    bool TotalIsExact)
{
    /// <summary>A card with no children — a board with child items switched off, or a childless card.</summary>
    public static KanbanCardChildren None { get; } = new([], 0, true);
}

/// <summary>
/// Groups one flat, ordered page of grandchildren into per-card child lists. Pure, so the grouping,
/// the display cap and the permission filtering are tested without a database.
/// </summary>
/// <remarks>
/// Keyed by integer parent id rather than GUID because that is what a loaded child carries — matching
/// it to a card is then a dictionary lookup on <c>IContent.Id</c>, with no second query to translate.
/// </remarks>
public static class KanbanCardChildAssembler
{
    public static IReadOnlyDictionary<int, KanbanCardChildren> Assemble(
        IEnumerable<IContent> grandchildren,
        ISet<Guid> browseable,
        bool capped,
        string? culture,
        int displayCap)
    {
        var byCard = new Dictionary<int, List<KanbanCardChildModel>>();

        foreach (IContent grandchild in grandchildren)
        {
            // Filtered before counting, so the total never discloses a node the user cannot see.
            if (browseable.Contains(grandchild.Key) == false)
            {
                continue;
            }

            if (byCard.TryGetValue(grandchild.ParentId, out List<KanbanCardChildModel>? children) == false)
            {
                children = [];
                byCard[grandchild.ParentId] = children;
            }

            children.Add(new KanbanCardChildModel
            {
                Key = grandchild.Key,
                Name = KanbanCardMapper.ResolveName(grandchild, culture),
                Icon = grandchild.ContentType.Icon,
            });
        }

        return byCard.ToDictionary(
            entry => entry.Key,
            entry => new KanbanCardChildren(
                entry.Value.Take(displayCap).ToList(),
                entry.Value.Count,
                capped == false));
    }
}
```

- [ ] **Step 5: Make `ResolveName` public and fold the variation check into it**

In `src/Umbraco.Community.Kanban/Services/KanbanCardMapper.cs`, replace the private `ResolveName`:

```csharp
    /// <summary>
    /// The document's name for a culture, or its invariant name where the document does not vary.
    /// Public because a card's children resolve their names by exactly the same rule.
    /// </summary>
    public static string ResolveName(IContent content, string? culture)
    {
        var effective = content.ContentType.Variations.HasFlag(ContentVariation.Culture) ? culture : null;

        return effective is null
            ? content.Name ?? string.Empty
            : content.GetCultureName(effective) ?? content.Name ?? string.Empty;
    }
```

The `Map` method already computes `effectiveCulture` for state and properties; leave that alone and change its `Name` assignment to pass the raw culture, since `ResolveName` now applies the variation check itself:

```csharp
            Name = ResolveName(content, culture),
```

- [ ] **Step 6: Run the assembler tests to verify they pass**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj --filter FullyQualifiedName~KanbanCardChildAssemblerTests`
Expected: compile error on `KanbanCardModel.ContentTypeKey` being required but unset in `KanbanCardMapper.Map` — fix it in the next step. If the mapper already compiles, expect PASS.

- [ ] **Step 7: Write the failing mapper tests**

Append to `tests/Umbraco.Community.Kanban.Tests/Services/KanbanCardMapperTests.cs`, inside the class. Note `ContentTypeWith` builds a `ContentType` with no explicit `Key`, so assert against `contentType.Key` rather than a literal:

```csharp
    [Fact]
    public void Maps_the_content_type_key_so_the_client_can_resolve_allowed_child_types()
    {
        ContentType contentType = ContentTypeWith(ContentVariation.Nothing);
        var content = new Content("A", -1, contentType);

        KanbanCardMapper.Map(content, [], null, false, FakePropertyValueReader.Stored()).ContentTypeKey
            .Should().Be(contentType.Key);
    }

    [Fact]
    public void Reports_no_create_permission_and_no_children_by_default()
    {
        var content = new Content("A", -1, ContentTypeWith(ContentVariation.Nothing));

        KanbanCardModel card = KanbanCardMapper.Map(content, [], null, false, FakePropertyValueReader.Stored());

        card.CanCreate.Should().BeFalse();
        card.Children.Should().BeEmpty();
        card.ChildTotal.Should().Be(0);
        card.ChildTotalIsExact.Should().BeTrue();
    }

    [Fact]
    public void Carries_create_permission_and_children_when_given_them()
    {
        var content = new Content("A", -1, ContentTypeWith(ContentVariation.Nothing));
        var children = new KanbanCardChildren(
            [new KanbanCardChildModel { Key = Guid.NewGuid(), Name = "Line 1", Icon = "icon-receipt" }],
            Total: 4,
            TotalIsExact: false);

        KanbanCardModel card = KanbanCardMapper.Map(
            content, [], null, false, FakePropertyValueReader.Stored(), canCreate: true, children: children);

        card.CanCreate.Should().BeTrue();
        card.Children.Single().Name.Should().Be("Line 1");
        card.ChildTotal.Should().Be(4);
        card.ChildTotalIsExact.Should().BeFalse();
    }
```

- [ ] **Step 8: Extend `Map` with the two optional parameters**

In `src/Umbraco.Community.Kanban/Services/KanbanCardMapper.cs`, change the signature and the object it builds. Both new parameters are optional so every existing call site — and every existing test — keeps compiling:

```csharp
    public static KanbanCardModel Map(
        IContent content,
        IReadOnlyList<KanbanCardProperty> cardProperties,
        string? culture,
        bool canUpdate,
        IKanbanPropertyValueReader valueReader,
        bool canCreate = false,
        KanbanCardChildren? children = null)
    {
        var variesByCulture = content.ContentType.Variations.HasFlag(ContentVariation.Culture);
        var effectiveCulture = variesByCulture ? culture : null;
        KanbanCardChildren childItems = children ?? KanbanCardChildren.None;

        return new KanbanCardModel
        {
            Key = content.Key,
            Name = ResolveName(content, culture),
            ContentTypeAlias = content.ContentType.Alias,
            ContentTypeKey = content.ContentType.Key,
            Icon = content.ContentType.Icon,
            State = ResolveState(content, effectiveCulture),
            CanUpdate = canUpdate,
            CanCreate = canCreate,
            Children = childItems.Children,
            ChildTotal = childItems.Total,
            ChildTotalIsExact = childItems.TotalIsExact,
            Properties = MapProperties(content, cardProperties, effectiveCulture, valueReader),
        };
    }
```

- [ ] **Step 9: Run the whole server suite**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj`
Expected: PASS — including every pre-existing `KanbanCardMapperTests` and `KanbanBoardServiceTests` case, untouched.

- [ ] **Step 10: Commit**

```bash
git add src/Umbraco.Community.Kanban tests/Umbraco.Community.Kanban.Tests
git commit -m "feat: model a card's children, create permission and content type key"
```

---

### Task 4: The board reads children

Wires Tasks 2 and 3 into the board: one extra query, one extra permission filter, the flag on the response.

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Services/IKanbanContentLoader.cs`
- Modify: `src/Umbraco.Community.Kanban/Services/KanbanContentLoader.cs`
- Modify: `src/Umbraco.Community.Kanban/Services/KanbanBoardComposer.cs`
- Modify: `src/Umbraco.Community.Kanban/Services/KanbanBoardService.cs`
- Modify: `tests/Umbraco.Community.Kanban.Tests/Fakes/FakeKanbanContentLoader.cs`
- Modify: `tests/Umbraco.Community.Kanban.Tests/Services/KanbanBoardServiceTests.cs`

**Interfaces:**
- Consumes: `KanbanChildOrdering.From` (Task 2), `KanbanCardChildAssembler.Assemble`, `KanbanCardChildren`, the new card fields (Task 3), `Constants.DefaultGrandchildCap`, `Constants.CardChildDisplayCap`.
- Produces:
  - `KanbanGrandchildPage(IReadOnlyList<IContent> Grandchildren, bool Capped)`
  - `IKanbanContentLoader.GetGrandchildren(int parentId, int level, int cap, Ordering ordering)`
  - `KanbanBoardComposerRequest`'s new trailing parameter `bool ShowChildItems = false`
  - `GET /board` responses carrying `showChildItems`, and cards carrying children.

- [ ] **Step 1: Extend the loader interface**

In `src/Umbraco.Community.Kanban/Services/IKanbanContentLoader.cs`, add the record beside `KanbanChildPage` and the method to the interface:

```csharp
/// <param name="Grandchildren">The grandchildren that were read, capped.</param>
/// <param name="Capped">True when more exist than were read, making per-card totals lower bounds.</param>
public sealed record KanbanGrandchildPage(IReadOnlyList<IContent> Grandchildren, bool Capped);
```

```csharp
    /// <summary>
    /// Every document at <paramref name="level" /> below the tree rooted at
    /// <paramref name="parentId" /> — the children of the board's cards — at most
    /// <paramref name="cap" /> of them, in <paramref name="ordering" /> order.
    /// </summary>
    /// <remarks>
    /// One query for every card's children, because IContentService offers no "children of these ids".
    /// The level filter is what keeps the cap meaningful: without it one deep subtree elsewhere under
    /// the parent would consume the page and starve the cards that have children.
    /// </remarks>
    KanbanGrandchildPage GetGrandchildren(int parentId, int level, int cap, Ordering ordering);
```

Add `using Umbraco.Cms.Core.Services;` at the top of the file for `Ordering`.

- [ ] **Step 2: Implement it**

Replace `src/Umbraco.Community.Kanban/Services/KanbanContentLoader.cs`'s class declaration and add the method. The primary constructor gains `ICoreScopeProvider`, which is what builds an `IQuery<IContent>`; DI supplies it with no registration change:

```csharp
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Persistence.Querying;
using Umbraco.Cms.Core.Scoping;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.Kanban.Services;

/// <inheritdoc />
public sealed class KanbanContentLoader(
    IContentService contentService,
    ICoreScopeProvider scopeProvider) : IKanbanContentLoader
{
    // ... GetById and GetChildren unchanged ...

    public KanbanGrandchildPage GetGrandchildren(int parentId, int level, int cap, Ordering ordering)
    {
        // Level is a mapped column on the node table, so this filters in SQL rather than in memory.
        IQuery<IContent> filter = scopeProvider.CreateQuery<IContent>().Where(content => content.Level == level);

        List<IContent> grandchildren = contentService.GetPagedDescendants(
            parentId,
            pageIndex: 0,
            pageSize: cap,
            out var totalRecords,
            filter,
            ordering).ToList();

        return new KanbanGrandchildPage(grandchildren, totalRecords > grandchildren.Count);
    }
}
```

- [ ] **Step 3: Extend the composer with the flag**

In `src/Umbraco.Community.Kanban/Services/KanbanBoardComposer.cs`, add a trailing parameter to `KanbanBoardComposerRequest` — **with a default**, so the existing `KanbanBoardComposerTests` keep constructing it positionally:

```csharp
/// <param name="ShowChildItems">Whether cards list their children, echoed to the client.</param>
public sealed record KanbanBoardComposerRequest(
    IReadOnlyList<KanbanLane> Lanes,
    IReadOnlyList<KanbanCardAssignment> Cards,
    int ChildCount,
    bool Truncated,
    int PageSize,
    string? Lane,
    int Skip,
    bool ShowChildItems = false);
```

and set it on the response inside `Compose`:

```csharp
        return new KanbanBoardResponseModel
        {
            Truncated = request.Truncated,
            ChildCount = request.ChildCount,
            ShowChildItems = request.ShowChildItems,
            Lanes = lanes
```

- [ ] **Step 4: Teach the fake loader the new method**

In `tests/Umbraco.Community.Kanban.Tests/Fakes/FakeKanbanContentLoader.cs`, add `using Umbraco.Cms.Core.Services;` and:

```csharp
    /// <summary>Grandchildren the fake returns, in the order given — the fake does not sort.</summary>
    public List<IContent> Grandchildren { get; } = [];

    /// <summary>Overrides the reported total, to simulate more grandchildren than were read.</summary>
    public int? GrandchildTotalOverride { get; set; }

    /// <summary>Every GetGrandchildren call, so a test can assert one query — or none at all.</summary>
    public List<(int ParentId, int Level, int Cap, Ordering Ordering)> GrandchildRequests { get; } = [];

    public KanbanGrandchildPage GetGrandchildren(int parentId, int level, int cap, Ordering ordering)
    {
        GrandchildRequests.Add((parentId, level, cap, ordering));

        List<IContent> page = Grandchildren.Take(cap).ToList();

        return new KanbanGrandchildPage(page, (GrandchildTotalOverride ?? Grandchildren.Count) > page.Count);
    }
```

- [ ] **Step 5: Write the failing board service tests**

Append to `tests/Umbraco.Community.Kanban.Tests/Services/KanbanBoardServiceTests.cs`, inside the class, and add two usings at the top of the file — `using Umbraco.Cms.Core;` for `Direction` and `using Umbraco.Cms.Core.Services;` for `Ordering`.

First, give the existing `Child` helper an optional id. Cards are created with no explicit `Id`, so every card's `Id` is `0` today — which is invisible until children have to be grouped *by* that id. Existing callers are unaffected:

```csharp
    private static Content Child(Harness harness, string name, string? status, Guid? key = null, int id = 0)
    {
        var child = new Content(name, 1234, harness.ChildContentType) { Key = key ?? Guid.NewGuid(), Id = id };

        if (status is not null)
        {
            child.SetValue("status", status);
        }

        harness.Loader.Children.Add(child);

        return child;
    }
```

Then add the new helpers. The parent's `Level` is `0` in these fixtures, so cards sit at level 1 and their children at level 2:

```csharp
    private static Content Grandchild(Harness harness, string name, Content card)
    {
        var grandchild = new Content(name, card.Id, harness.ChildContentType) { Key = Guid.NewGuid() };

        harness.Loader.Grandchildren.Add(grandchild);

        return grandchild;
    }

    private static KanbanBoardConfiguration WithChildItems(string? sortBy = null, string? direction = null) =>
        new()
        {
            LaneProperty = "status",
            CardProperties = CardPropertyList.Of("status"),
            LanePageSize = 25,
            ShowChildItems = true,
            ChildItemsSortBy = sortBy,
            ChildItemsSortDirection = direction,
        };

    [Fact]
    public async Task Does_not_read_grandchildren_when_child_items_are_off()
    {
        Harness harness = Configured();
        Child(harness, "One", "todo", key: Guid.NewGuid());

        await harness.Service.GetBoardAsync(Request(), User);

        harness.Loader.GrandchildRequests.Should().BeEmpty();
    }

    [Fact]
    public async Task Reports_child_items_as_off_on_the_response_when_they_are_off()
    {
        Harness harness = Configured();

        KanbanBoardResult result = await harness.Service.GetBoardAsync(Request(), User);

        result.Board!.ShowChildItems.Should().BeFalse();
    }

    [Fact]
    public async Task Reads_grandchildren_once_for_the_whole_board()
    {
        Harness harness = Configured(WithChildItems());
        Content card = Child(harness, "One", "todo", id: 10);
        Grandchild(harness, "Line 1", card);

        KanbanBoardResult result = await harness.Service.GetBoardAsync(Request(), User);

        harness.Loader.GrandchildRequests.Should().HaveCount(1);
        result.Board!.ShowChildItems.Should().BeTrue();
    }

    [Fact]
    public async Task Asks_for_the_grandchild_level_and_the_configured_order()
    {
        Harness harness = Configured(WithChildItems("name", "desc"));
        Child(harness, "One", "todo");

        await harness.Service.GetBoardAsync(Request(), User);

        (int parentId, int level, int cap, Ordering ordering) = harness.Loader.GrandchildRequests.Single();

        parentId.Should().Be(1234);
        level.Should().Be(2);
        cap.Should().Be(Constants.DefaultGrandchildCap);
        ordering.OrderBy.Should().Be("name");
        ordering.Direction.Should().Be(Direction.Descending);
    }

    [Fact]
    public async Task Attaches_each_cards_own_children()
    {
        Harness harness = Configured(WithChildItems());
        Content first = Child(harness, "One", "todo", id: 10);
        Content second = Child(harness, "Two", "todo", id: 20);
        Grandchild(harness, "Line 1", first);
        Grandchild(harness, "Line 2", second);

        KanbanBoardResult result = await harness.Service.GetBoardAsync(Request(), User);

        KanbanBoardLaneModel lane = result.Board!.Lanes.Single(candidate => candidate.Value == "todo");

        lane.Cards.Single(card => card.Name == "One").Children.Select(child => child.Name).Should().Equal("Line 1");
        lane.Cards.Single(card => card.Name == "Two").Children.Select(child => child.Name).Should().Equal("Line 2");
    }

    [Fact]
    public async Task Hides_children_the_user_cannot_browse()
    {
        Harness harness = Configured(WithChildItems());
        Content card = Child(harness, "One", "todo", id: 10);
        Content visible = Grandchild(harness, "Line 1", card);
        Grandchild(harness, "Line 2", card);

        harness.Permissions.Allowed[ActionBrowse.ActionLetter] = [ParentKey, card.Key, visible.Key];

        KanbanBoardResult result = await harness.Service.GetBoardAsync(Request(), User);

        KanbanCardModel model = result.Board!.Lanes.Single(lane => lane.Value == "todo").Cards.Single();

        model.Children.Select(child => child.Name).Should().Equal("Line 1");
        model.ChildTotal.Should().Be(1);
    }

    [Fact]
    public async Task Filters_browse_permission_in_one_bulk_call_covering_children_and_grandchildren()
    {
        Harness harness = Configured(WithChildItems());
        Content card = Child(harness, "One", "todo", id: 10);
        Grandchild(harness, "Line 1", card);

        await harness.Service.GetBoardAsync(Request(), User);

        // One browse filter for two children + one grandchild is the point: never one call per node.
        harness.Permissions.FilterCalls
            .Where(call => call.Permission == ActionBrowse.ActionLetter)
            .Should().ContainSingle().Which.KeyCount.Should().Be(2);
    }

    [Fact]
    public async Task Reports_create_permission_per_card()
    {
        Harness harness = Configured();
        Content allowed = Child(harness, "One", "todo");
        Content denied = Child(harness, "Two", "todo");

        harness.Permissions.Allowed[ActionNew.ActionLetter] = [allowed.Key];

        KanbanBoardResult result = await harness.Service.GetBoardAsync(Request(), User);

        IReadOnlyList<KanbanCardModel> cards = result.Board!.Lanes.Single(lane => lane.Value == "todo").Cards;

        cards.Single(card => card.Name == "One").CanCreate.Should().BeTrue();
        cards.Single(card => card.Name == "Two").CanCreate.Should().BeFalse();
    }
```

The browse-call test expects `KeyCount` `2`: two documents (one card, one grandchild) — the parent's own browse check goes through `IsDeniedAsync`, which the fake does not record in `FilterCalls`. If the assertion is off by one when you run it, count the fixtures rather than changing the production code.

- [ ] **Step 6: Run them to verify they fail**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj --filter FullyQualifiedName~KanbanBoardServiceTests`
Expected: FAIL — no grandchild query is made, `ShowChildItems` is always false, `CanCreate` is always false.

- [ ] **Step 7: Wire the board service**

In `src/Umbraco.Community.Kanban/Services/KanbanBoardService.cs`, add the permission set beside the existing two:

```csharp
    private static readonly ISet<string> CreatePermission = new HashSet<string> { ActionNew.ActionLetter };
```

Then replace the body of `ComposeAsync` from the `GetChildren` call to the `Compose` call:

```csharp
        KanbanChildPage page = contentLoader.GetChildren(parent.Id, Constants.DefaultChildCap);
        List<Guid> keys = page.Children.Select(child => child.Key).ToList();

        // Children of the cards, for the per-card child list. Skipped entirely when the board does not
        // show them, so a board that lists no children pays for neither the query nor the payload.
        KanbanGrandchildPage grandchildren = configuration.ShowChildItems
            ? contentLoader.GetGrandchildren(
                parent.Id,
                parent.Level + 2,
                Constants.DefaultGrandchildCap,
                KanbanChildOrdering.From(
                    configuration.ChildItemsSortBy,
                    configuration.ChildItemsSortDirection,
                    request.Culture))
            : new KanbanGrandchildPage([], false);

        // One bulk call per permission, never one per node — a board may hold a thousand children.
        // Browse covers cards and their children together rather than in two round trips.
        ISet<Guid> browseable = await permissionAuthorizer.FilterAuthorizedAsync(
            user,
            [.. keys, .. grandchildren.Grandchildren.Select(grandchild => grandchild.Key)],
            BrowsePermission);
        ISet<Guid> updatable = await permissionAuthorizer.FilterAuthorizedAsync(user, keys, UpdatePermission);
        ISet<Guid> creatable = await permissionAuthorizer.FilterAuthorizedAsync(user, keys, CreatePermission);

        IReadOnlyDictionary<int, KanbanCardChildren> childrenByCard = KanbanCardChildAssembler.Assemble(
            grandchildren.Grandchildren,
            browseable,
            grandchildren.Capped,
            request.Culture,
            Constants.CardChildDisplayCap);

        List<KanbanCardAssignment> assignments = page.Children
            .Where(child => browseable.Contains(child.Key))
            .Select(child => new KanbanCardAssignment(
                KanbanLaneValueReader.Read(child, configuration.LaneProperty, request.Culture),
                KanbanCardMapper.Map(
                    child,
                    configuration.CardProperties,
                    request.Culture,
                    updatable.Contains(child.Key),
                    propertyValueReader,
                    creatable.Contains(child.Key),
                    childrenByCard.GetValueOrDefault(child.Id) ?? KanbanCardChildren.None)))
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
            request.Skip ?? 0,
            configuration.ShowChildItems));
```

- [ ] **Step 8: Run the whole server suite**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj`
Expected: PASS.

- [ ] **Step 9: Verify the query really filters by level against a database**

`Level` is mapped for `IContent` (`ContentMapper` maps `Content.Level` to `NodeDto.Level`), so the filter translates to SQL — but nothing in the unit suite proves it. Build the package into the test site, switch a board's **Show child items** on, and load it. Expected: children appear under their own cards and the server log shows no `NotSupportedException` from the query mapper.

Run: `dotnet build src/Umbraco.Community.Kanban/Umbraco.Community.Kanban.csproj`
Expected: builds clean.

- [ ] **Step 10: Commit**

```bash
git add src/Umbraco.Community.Kanban tests/Umbraco.Community.Kanban.Tests
git commit -m "feat: read each card's children in one query per board"
```

---

### Task 5: Client models

The client's mirror of Tasks 3 and 4, plus the overflow line's pure function. No visible change yet.

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/data/kanban-board.types.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/board.model.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/board.model.test.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/core/card-children.model.ts`
- Create: `src/Umbraco.Community.Kanban/Client/src/core/card-children.model.test.ts`

**Interfaces:**
- Consumes: the server fields from Tasks 3 and 4.
- Produces:
  - `KanbanCardChildModel { key: string; name: string; icon?: string | null }`
  - `KanbanCardModel.contentTypeKey`, `.canCreate`, `.children`, `.childTotal`, `.childTotalIsExact`
  - `KanbanBoardModel.showChildItems`, `KanbanBoardState.showChildItems`
  - `formatChildOverflow(childTotal: number, shown: number, isExact: boolean): string | undefined`

- [ ] **Step 1: Write the failing overflow test**

Create `src/Umbraco.Community.Kanban/Client/src/core/card-children.model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatChildOverflow } from './card-children.model.js';

describe('formatChildOverflow', () => {
  it('is nothing when every child is shown', () => {
    expect(formatChildOverflow(3, 3, true)).toBeUndefined();
  });

  it('is nothing when there are no children at all', () => {
    expect(formatChildOverflow(0, 0, true)).toBeUndefined();
  });

  it('counts the children beyond the ones shown', () => {
    expect(formatChildOverflow(8, 5, true)).toBe('+3 more');
  });

  it('says "or more" when the total is only a lower bound', () => {
    expect(formatChildOverflow(8, 5, false)).toBe('+3 or more');
  });

  it('still reports more when a capped total matches what is shown', () => {
    // The board hit its grandchild cap, so five loaded means "at least five" — there may be a sixth.
    expect(formatChildOverflow(5, 5, false)).toBe('and more');
  });

  it('never reports a negative overflow', () => {
    expect(formatChildOverflow(2, 5, true)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/core/card-children.model.test.ts`
Expected: FAIL — cannot resolve `./card-children.model.js`.

- [ ] **Step 3: Write the model**

Create `src/Umbraco.Community.Kanban/Client/src/core/card-children.model.ts`:

```ts
/**
 * The line under a card's child list, or nothing when there is no more to say.
 *
 * A card lists a fixed few children and never pages, so the rest are reported as a count. The count
 * itself may be a lower bound — the board caps how many children it reads across the whole board —
 * which is why an exact overflow and a bounded one read differently, exactly as a lane's badge
 * distinguishes "12" from "12+".
 */
export function formatChildOverflow(childTotal: number, shown: number, isExact: boolean): string | undefined {
  const remaining = childTotal - shown;

  if (remaining > 0) return isExact ? `+${remaining} more` : `+${remaining} or more`;

  // Nothing beyond what is shown was counted, but a capped count cannot promise that is all there is.
  return isExact ? undefined : 'and more';
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/core/card-children.model.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the response types**

In `src/Umbraco.Community.Kanban/Client/src/data/kanban-board.types.ts`, add above `KanbanCardModel`:

```ts
/** Mirrors KanbanCardChildModel. */
export interface KanbanCardChildModel {
  key: string;
  name: string;
  /** Verbatim from the content type, colour suffix and all — umb-icon parses it. */
  icon?: string | null;
}
```

Inside `KanbanCardModel`, after `canUpdate`:

```ts
  /** Whether the current user may create under this card; gates the add button. */
  canCreate: boolean;
  /** The card's content type key — what the allowed-child-types lookup is keyed by. */
  contentTypeKey: string;
  /** The first few children, in the board's configured child order. Empty unless the board shows them. */
  children: KanbanCardChildModel[];
  /** Browse-filtered, and safe to display — unlike KanbanBoardModel.childCount. */
  childTotal: number;
  /** False when the board hit its grandchild cap, making childTotal a lower bound. */
  childTotalIsExact: boolean;
```

And inside `KanbanBoardModel`, after `childCount`:

```ts
  /** Whether cards on this board list their children. Board-wide, so it is not on the card. */
  showChildItems: boolean;
```

- [ ] **Step 6: Write the failing board state tests**

In `src/Umbraco.Community.Kanban/Client/src/core/board.model.test.ts`, extend the two fixture factories so they satisfy the new required fields, then add the assertions.

In `card`:

```ts
const card = (key: string): KanbanCardModel => ({
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
});
```

In `board`:

```ts
const board = (lanes: KanbanBoardLaneModel[], overrides: Partial<KanbanBoardModel> = {}): KanbanBoardModel => ({
  lanes,
  truncated: false,
  childCount: lanes.reduce((sum, l) => sum + l.total, 0),
  showChildItems: false,
  ...overrides,
});
```

Then add, inside the `toBoardState` describe block:

```ts
  it('carries the child items flag across', () => {
    expect(toBoardState(board([], { showChildItems: true })).showChildItems).toBe(true);
  });
```

and inside the `mergeLanePage` describe block:

```ts
  it('keeps the child items flag when a lane page is merged in', () => {
    // Easy to lose: mergeLanePage rebuilds the board state object from the incoming page.
    const state = toBoardState(board([lane('todo', ['a'], { total: 3 })], { showChildItems: true }));

    const next = mergeLanePage(state, board([lane('todo', ['b'], { total: 3, skip: 1 })], { showChildItems: true }));

    expect(next.showChildItems).toBe(true);
  });
```

- [ ] **Step 7: Run them to verify they fail**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/core/board.model.test.ts`
Expected: FAIL — `showChildItems` is not on `KanbanBoardState`.

- [ ] **Step 8: Carry the flag through the board state**

In `src/Umbraco.Community.Kanban/Client/src/core/board.model.ts`:

```ts
export interface KanbanBoardState {
  lanes: KanbanBoardLaneModel[];
  truncated: boolean;
  childCount: number;
  showChildItems: boolean;
}

export function toBoardState(board: KanbanBoardModel): KanbanBoardState {
  return {
    lanes: [...board.lanes],
    truncated: board.truncated,
    childCount: board.childCount,
    showChildItems: board.showChildItems,
  };
}
```

and in `mergeLanePage`'s return:

```ts
  return {
    lanes,
    truncated: page.truncated,
    childCount: page.childCount,
    showChildItems: page.showChildItems,
  };
```

- [ ] **Step 9: Run the full client suite and type-check**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run test && npm run build`
Expected: PASS and a clean build.

- [ ] **Step 10: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src
git commit -m "feat: mirror card children and the child items flag on the client"
```

---

### Task 6: A card title opens its document (item 1)

The first visible change: the modal registration, and a title that uses it.

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/hosts/collection-view-board.element.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - The `kanban-open-document` event: `CustomEvent<{ key: string }>`, bubbling and composed.
  - On the host: `#documentModal` (an `UmbModalRouteRegistrationController` for `UMB_WORKSPACE_MODAL` at additional path `kanban-document`) and `#modalReady`.

- [ ] **Step 1: Replace the card's click handler with a title button**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts`, replace `#onClick` with:

```ts
  #onOpen() {
    if (!this.card) return;

    this.dispatchEvent(
      new CustomEvent('kanban-open-document', {
        detail: { key: this.card.key },
        bubbles: true,
        composed: true,
      }),
    );
  }
```

Change the card's markup so the *title* is the control. `.card` stops being a button, which is what leaves room for milestone 3's drag, and the `stopPropagation` guard on the entity actions bundle goes away with the handler it was guarding:

```ts
    return html`
      <div class="card">
        <div class="header">
          ${this.card.icon ? html`<umb-icon name=${this.card.icon}></umb-icon>` : nothing}
          <button type="button" class="name" @click=${this.#onOpen}>${this.card.name}</button>
          <umb-entity-actions-bundle .label=${this.card.name}></umb-entity-actions-bundle>
        </div>
```

Update the styles: drop `cursor: pointer` from `.card`, and make `.name` a button that looks like the text it replaced:

```css
      .name {
        flex: 1;
        font-weight: bold;
        overflow-wrap: anywhere;
        /* A real button, so it is keyboard-reachable without hand-rolled key handling — styled back
           down to the text it replaced. */
        appearance: none;
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        font: inherit;
        font-weight: bold;
        color: inherit;
        text-align: left;
        cursor: pointer;
      }

      .name:hover {
        text-decoration: underline;
      }
```

Also update the class comment at the top of the file: it says "Read-only in this milestone: it reports a click and nothing else", which is no longer the whole story — it now reports "open this document".

- [ ] **Step 2: Register the modal on the host and open it**

In `src/Umbraco.Community.Kanban/Client/src/hosts/collection-view-board.element.ts`, add the imports:

```ts
import { UmbModalRouteRegistrationController } from '@umbraco-cms/backoffice/router';
import { UMB_WORKSPACE_MODAL } from '@umbraco-cms/backoffice/workspace';
import { UMB_DOCUMENT_ENTITY_TYPE, UMB_EDIT_DOCUMENT_WORKSPACE_PATH_PATTERN } from '@umbraco-cms/backoffice/document';
```

Add the fields and the registration. Put the registration at the end of the constructor, after the three `consumeContext` calls:

```ts
  /**
   * Opens a card's document in Umbraco's own document workspace as a sidebar modal, so editing a card
   * never means leaving the board.
   *
   * A modal *route* registration rather than `UMB_MODAL_MANAGER_CONTEXT.open()` because the document
   * workspace is route-driven: edit, create and create-from-blueprint are three routes into it, and
   * opening the modal directly would render a workspace with no route to resolve. One registration
   * serves all three — the path passed to `open()` decides which. This is the same pattern, and the
   * same reasoning, as the data type workspace view's.
   */
  #documentModal: UmbModalRouteRegistrationController<
    typeof UMB_WORKSPACE_MODAL.DATA,
    typeof UMB_WORKSPACE_MODAL.VALUE
  >;

  /**
   * Whether the router has handed over a route builder yet. `open()` silently does nothing until it
   * has, so an event arriving first is dropped rather than looking like a broken button. Kept here
   * rather than gating the controls: the registration completes long before the board's first response
   * renders a card, so threading a flag down to every card would buy nothing.
   */
  #modalReady = false;
```

```ts
    this.#documentModal = new UmbModalRouteRegistrationController(this, UMB_WORKSPACE_MODAL)
      // The token's alias is the generic `Umb.Modal.Workspace`, so a distinct segment is what keeps
      // our route unambiguous among any other workspace modal in the same routing scope.
      .addAdditionalPath('kanban-document')
      .onSetup(() => ({ data: { entityType: UMB_DOCUMENT_ENTITY_TYPE, preset: {} } }))
      .onSubmit(() => {
        // The collection context has no idea a document was saved inside our modal, so its `items`
        // observable will not fire; the board has to reload itself. The board's own load token makes a
        // redundant load harmless if that ever changes.
        this.#board?.load();
      })
      .observeRouteBuilder(() => {
        this.#modalReady = true;
      });
```

Add the handler:

```ts
  #onOpenDocument(event: CustomEvent<{ key: string }>) {
    if (!this.#modalReady) return;

    // The second argument is the inner workspace's own route, appended to the modal path. Without it
    // the modal opens on no route at all and renders nothing.
    this.#documentModal.open(
      {},
      UMB_EDIT_DOCUMENT_WORKSPACE_PATH_PATTERN.generateLocal({ unique: event.detail.key }),
    );
  }
```

and listen for it on the board element in `render()`:

```ts
      <umb-community-kanban-board
        parent-id=${this._parentId}
        .culture=${this._culture}
        .datasource=${this.#datasource}
        ?readonly=${true}
        @kanban-open-document=${this.#onOpenDocument}></umb-community-kanban-board>
```

- [ ] **Step 3: Type-check and test**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: clean build, all tests pass.

If `@umbraco-cms/backoffice/workspace` does not export `UMB_WORKSPACE_MODAL`, check the package's `package.json` exports map for the subpath that does and import from there — the token lives in `packages/core/workspace/modals/workspace-modal.token.ts` upstream. Do not reach into `dist-cms`.

- [ ] **Step 4: Verify by hand in the backoffice**

Build the client into the test site and open a document whose collection uses the Kanban layout.

Expected: clicking a card's **title** opens that document in a large sidebar modal; the rest of the card does not; the card's ⋯ actions menu still works; saving in the modal and closing it leaves the board showing the new values; dismissing the modal changes nothing.

- [ ] **Step 5: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src
git commit -m "feat: open a card's document in the workspace modal from its title"
```

---

### Task 7: Children listed on a card (item 6)

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/core/kanban-card-children.element.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-lane.element.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`

**Interfaces:**
- Consumes: `KanbanCardModel.children/childTotal/childTotalIsExact` and `KanbanBoardState.showChildItems` (Task 5); `formatChildOverflow` (Task 5); the `kanban-open-document` event (Task 6).
- Produces: `<umb-community-kanban-card-children .card=${card}>`, and a `showChildItems` boolean property on the board, lane and card elements.

- [ ] **Step 1: Write the child list element**

Create `src/Umbraco.Community.Kanban/Client/src/core/kanban-card-children.element.ts`. This step adds the list only — the add button is Task 8:

```ts
import { css, customElement, html, nothing, property, repeat } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { formatChildOverflow } from './card-children.model.js';
import type { KanbanCardChildModel, KanbanCardModel } from '../data/kanban-board.types.js';

/**
 * A card's own children: icon, name, and a button opening each in the workspace modal.
 *
 * Its own element rather than more markup inside the card, because it owns fetching and menu state of
 * its own once the add button lands, and the card element is already the busiest file in core/.
 *
 * umb-icon is a global element the backoffice shell registers, so it is used without import.
 */
@customElement('umb-community-kanban-card-children')
export class UmbCommunityKanbanCardChildrenElement extends UmbLitElement {
  @property({ attribute: false })
  card?: KanbanCardModel;

  #onOpen(child: KanbanCardChildModel) {
    // The same event the card's title raises: the host does not care which control asked.
    this.dispatchEvent(
      new CustomEvent('kanban-open-document', {
        detail: { key: child.key },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    if (!this.card) return nothing;

    const overflow = formatChildOverflow(
      this.card.childTotal,
      this.card.children.length,
      this.card.childTotalIsExact,
    );

    return html`
      <div class="children">
        ${repeat(this.card.children, (child) => child.key, (child) => this.#renderChild(child))}
        ${overflow ? html`<span class="overflow">${overflow}</span>` : nothing}
      </div>
    `;
  }

  #renderChild(child: KanbanCardChildModel) {
    return html`
      <div class="child">
        ${child.icon ? html`<umb-icon name=${child.icon}></umb-icon>` : nothing}
        <span class="child-name">${child.name}</span>
        <uui-button
          compact
          look="default"
          label=${this.localize.term('general_edit')}
          @click=${() => this.#onOpen(child)}>
          <uui-icon name="icon-edit"></uui-icon>
        </uui-button>
      </div>
    `;
  }

  static override styles = [
    css`
      .children {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-1);
        border-top: 1px solid var(--uui-color-divider);
        padding-top: var(--uui-size-space-2);
        font-size: var(--uui-type-small-size);
      }

      .child {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
      }

      .child-name {
        flex: 1;
        overflow-wrap: anywhere;
      }

      .overflow {
        color: var(--uui-color-text-alt);
      }
    `,
  ];
}

export { UmbCommunityKanbanCardChildrenElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umb-community-kanban-card-children': UmbCommunityKanbanCardChildrenElement;
  }
}
```

- [ ] **Step 2: Render it from the card, gated on the board setting**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts`, add the import beside the ufm one:

```ts
import './kanban-card-children.element.js';
```

Add the property:

```ts
  /**
   * Whether this board lists a card's children. Board-wide state forwarded down, the way `readonly`
   * is — it is a property of the board's configuration, not of this card.
   */
  @property({ type: Boolean, attribute: 'show-child-items' })
  showChildItems = false;
```

and render the section between the properties block and the footer:

```ts
        ${this.#renderChildren()}
        <div class="footer">
```

```ts
  #renderChildren() {
    if (!this.showChildItems || !this.card) return nothing;

    // Nothing to list and nothing to add: no section at all, rather than an empty rule across the card.
    if (this.card.children.length === 0 && this.card.canCreate === false) return nothing;

    return html`<umb-community-kanban-card-children .card=${this.card}></umb-community-kanban-card-children>`;
  }
```

- [ ] **Step 3: Forward the flag through the lane**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-lane.element.ts`, add the property beside `readonly`:

```ts
  @property({ type: Boolean, attribute: 'show-child-items' })
  showChildItems = false;
```

and pass it to each card:

```ts
            (card) => html`<umb-community-kanban-card
              .card=${card}
              ?show-child-items=${this.showChildItems}></umb-community-kanban-card>`,
```

- [ ] **Step 4: Forward it from the board**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`, pass the response's flag straight from board state to each lane — the board does not need a property of its own, because the value arrives with the data:

```ts
        ${this._board.lanes.map(
          (lane) => html`<umb-community-kanban-lane
            .lane=${lane}
            ?readonly=${this.readonly}
            ?show-child-items=${this._board?.showChildItems ?? false}></umb-community-kanban-lane>`,
        )}
```

- [ ] **Step 5: Type-check and test**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: clean build, all tests pass.

- [ ] **Step 6: Verify by hand in the backoffice**

Turn **Show child items** on for the board's data type, and give one card some children.

Expected: that card lists up to five children with an icon and a name; the edit button opens the child in the sidebar modal; a card with no children shows no divider or empty list; a sixth child produces "+1 more"; switching the setting off restores exactly the previous appearance. Change **Sort child items by** to Name descending and confirm the order flips.

- [ ] **Step 7: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src
git commit -m "feat: list a card's children with an edit button each"
```

---

### Task 8: Creating a child from a card (item 5)

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-card-children.element.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/hosts/collection-view-board.element.ts`

**Interfaces:**
- Consumes: `KanbanCardModel.canCreate/contentTypeKey` (Task 5); `#documentModal` and `#modalReady` (Task 6).
- Produces: the `kanban-create-child` event: `CustomEvent<{ parentKey: string; documentTypeUnique: string; blueprintUnique?: string }>`, bubbling and composed.

- [ ] **Step 1: Add the add button, the type menu and the blueprint menu**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-card-children.element.ts`, add `state` to the **existing** lit import rather than adding a second import from the same module:

```ts
import { css, customElement, html, nothing, property, repeat, state } from '@umbraco-cms/backoffice/external/lit';
```

and add the repository imports:

```ts
import { UmbDocumentTypeStructureRepository } from '@umbraco-cms/backoffice/document-type';
import type { UmbAllowedDocumentTypeModel } from '@umbraco-cms/backoffice/document-type';
import { UmbDocumentBlueprintItemRepository } from '@umbraco-cms/backoffice/document-blueprint';
import type { UmbDocumentBlueprintItemBaseModel } from '@umbraco-cms/backoffice/document-blueprint';
```

Add the repositories and state to the class:

```ts
  /**
   * Core's own repositories, so which types may be created under this card — including rules that
   * depend on the parent document — stays core's answer rather than a reimplementation.
   */
  #documentTypes = new UmbDocumentTypeStructureRepository(this);
  #blueprints = new UmbDocumentBlueprintItemRepository(this);

  /** Which menu, if any, the add button is currently offering. */
  @state()
  private _menu: 'none' | 'types' | 'blueprints' = 'none';

  @state()
  private _busy = false;

  /** True once a fetch has come back with nothing creatable, which is only knowable on click. */
  @state()
  private _noTypes = false;

  @state()
  private _types: Array<UmbAllowedDocumentTypeModel> = [];

  @state()
  private _blueprints: Array<UmbDocumentBlueprintItemBaseModel> = [];

  /** The type a blueprint is being chosen for. */
  #pendingType?: string;
```

Add the flow. Both fetches happen on explicit user action and are deliberately not cached: a cache keyed by content type would go stale the moment someone edits a document type's allowed children, and core's own create action re-fetches on every open for the same reason.

```ts
  async #onAdd() {
    if (!this.card || this._busy) return;

    this._busy = true;
    this._menu = 'none';
    this._noTypes = false;

    const { data } = await this.#documentTypes.requestAllowedChildrenOf(
      this.card.contentTypeKey,
      this.card.key,
    );

    this._types = data?.items ?? [];
    this._busy = false;

    if (this._types.length === 0) {
      this._noTypes = true;
      return;
    }

    if (this._types.length === 1) {
      await this.#chooseType(this._types[0].unique);
      return;
    }

    await this.#openMenu('types');
  }

  async #chooseType(documentTypeUnique?: string) {
    if (!documentTypeUnique) return;

    this.#pendingType = documentTypeUnique;
    this._menu = 'none';
    this._busy = true;

    const { data } = await this.#blueprints.requestItemsByDocumentType(documentTypeUnique);

    this._blueprints = data ?? [];
    this._busy = false;

    if (this._blueprints.length === 0) {
      this.#create(documentTypeUnique);
      return;
    }

    await this.#openMenu('blueprints');
  }

  #create(documentTypeUnique: string, blueprintUnique?: string) {
    if (!this.card) return;

    this._menu = 'none';

    this.dispatchEvent(
      new CustomEvent('kanban-create-child', {
        detail: { parentKey: this.card.key, documentTypeUnique, blueprintUnique },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Shows a menu after its content is known.
   *
   * The popover is opened programmatically rather than by the button's own `popovertarget`, because
   * the choice of *whether* there is a menu is only known after a fetch — a declarative target would
   * flash an empty menu on every click. `uui-popover-container` positions itself against whichever
   * element carries `popovertarget` for its id, so the render must land before the popover opens;
   * awaiting `updateComplete` is what guarantees it.
   */
  async #openMenu(menu: 'types' | 'blueprints') {
    this._menu = menu;

    await this.updateComplete;

    this.shadowRoot?.querySelector<HTMLElement>(`#kanban-child-${menu}`)?.showPopover();
  }
```

Render the button and the two menus. Add `${this.#renderAdd()}` inside `.children`, after the overflow line:

```ts
  #renderAdd() {
    if (!this.card?.canCreate) return nothing;

    if (this._noTypes) {
      return html`<span class="overflow">${this.localize.term('content_noAllowedChildren') ||
      'Nothing can be created here'}</span>`;
    }

    return html`
      <uui-button
        compact
        look="placeholder"
        label=${this.localize.term('general_add')}
        .state=${this._busy ? 'waiting' : undefined}
        popovertarget=${this._menu !== 'none' ? `kanban-child-${this._menu}` : nothing}
        @click=${this.#onAdd}></uui-button>
      ${this._menu === 'types' ? this.#renderTypeMenu() : nothing}
      ${this._menu === 'blueprints' ? this.#renderBlueprintMenu() : nothing}
    `;
  }

  #renderTypeMenu() {
    return html`
      <uui-popover-container id="kanban-child-types" placement="bottom-start">
        <umb-popover-layout>
          ${repeat(
            this._types,
            (type) => type.unique,
            (type) => html`
              <uui-menu-item
                label=${this.localize.string(type.name)}
                @click=${() => this.#chooseType(type.unique)}>
                <umb-icon slot="icon" name=${type.icon ?? 'icon-document'}></umb-icon>
              </uui-menu-item>
            `,
          )}
        </umb-popover-layout>
      </uui-popover-container>
    `;
  }

  #renderBlueprintMenu() {
    const documentTypeUnique = this.#pendingType;

    return html`
      <uui-popover-container id="kanban-child-blueprints" placement="bottom-start">
        <umb-popover-layout>
          <uui-menu-item
            label=${this.localize.term('blueprints_blankBlueprint') || 'Blank'}
            @click=${() => documentTypeUnique && this.#create(documentTypeUnique)}>
            <umb-icon slot="icon" name="icon-document"></umb-icon>
          </uui-menu-item>
          ${repeat(
            this._blueprints,
            (blueprint) => blueprint.unique,
            (blueprint) => html`
              <uui-menu-item
                label=${blueprint.name}
                @click=${() => documentTypeUnique && this.#create(documentTypeUnique, blueprint.unique)}>
                <umb-icon slot="icon" name="icon-blueprint"></umb-icon>
              </uui-menu-item>
            `,
          )}
        </umb-popover-layout>
      </uui-popover-container>
    `;
  }
```

`umb-popover-layout` and `uui-menu-item` are global elements the backoffice shell registers, like `umb-icon` — no import.

- [ ] **Step 2: Handle the event on the host**

In `src/Umbraco.Community.Kanban/Client/src/hosts/collection-view-board.element.ts`, extend the document imports:

```ts
import {
  UMB_CREATE_DOCUMENT_WORKSPACE_PATH_PATTERN,
  UMB_CREATE_FROM_BLUEPRINT_DOCUMENT_WORKSPACE_PATH_PATTERN,
  UMB_DOCUMENT_ENTITY_TYPE,
  UMB_EDIT_DOCUMENT_WORKSPACE_PATH_PATTERN,
} from '@umbraco-cms/backoffice/document';
```

Add the handler beside `#onOpenDocument`:

```ts
  #onCreateChild(event: CustomEvent<{ parentKey: string; documentTypeUnique: string; blueprintUnique?: string }>) {
    if (!this.#modalReady) return;

    const { parentKey, documentTypeUnique, blueprintUnique } = event.detail;

    // The document type is part of the path, which is why the card resolves it before asking: a
    // create route cannot be generated without knowing what is being created.
    const path = blueprintUnique
      ? UMB_CREATE_FROM_BLUEPRINT_DOCUMENT_WORKSPACE_PATH_PATTERN.generateLocal({
          parentEntityType: UMB_DOCUMENT_ENTITY_TYPE,
          parentUnique: parentKey,
          documentTypeUnique,
          blueprintUnique,
        })
      : UMB_CREATE_DOCUMENT_WORKSPACE_PATH_PATTERN.generateLocal({
          parentEntityType: UMB_DOCUMENT_ENTITY_TYPE,
          parentUnique: parentKey,
          documentTypeUnique,
        });

    this.#documentModal.open({}, path);
  }
```

and listen for it on the board element in `render()`, beside the existing listener:

```ts
        @kanban-open-document=${this.#onOpenDocument}
        @kanban-create-child=${this.#onCreateChild}></umb-community-kanban-board>
```

- [ ] **Step 3: Type-check and test**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build && npm run test`
Expected: clean build, all tests pass.

If `requestAllowedChildrenOf`'s result shape does not match `data?.items`, check `UmbDocumentTypeStructureRepository` in the installed `@umbraco-cms/backoffice` types — core's `create-document-collection-action.element.ts` reads `data.items`, so it should — and adjust only that expression.

- [ ] **Step 4: Verify by hand in the backoffice**

Four cases, all on a board with **Show child items** on:

1. A card whose content type allows exactly one child type with no blueprints: **Add** goes straight to a new document in the sidebar modal, parented to the card. Saving it makes it appear in the card's child list.
2. A card allowing several child types: **Add** opens a menu of them with icons; choosing one opens the create modal.
3. A child type with blueprints: after choosing the type, a second menu offers **Blank** plus each blueprint; choosing a blueprint opens a pre-filled new document.
4. A user without create permission on a card: no **Add** button on that card at all.

- [ ] **Step 5: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src
git commit -m "feat: create a child under a card in the workspace modal"
```

---

### Task 9: Mark the enhancements done

**Files:**
- Modify: `docs/ENHANCEMENTS.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Rewrite the four entries**

In `docs/ENHANCEMENTS.md`, delete sections `## 1.`, `## 4.`, `## 5.` and `## 6.` in full and put **one** combined done entry where item 1 was — the four were built as one feature, and splitting the record across four stubs would hide that. Keep items 2 & 3, 7, 8 and 9 exactly as they are, in place.

Replace from the `## 1. Open a card in the workspace modal` heading through the end of item 1 with:

```markdown
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
```

Then, in the entries that remain:

- **Item 8** opens "Depends on item 5 (create in the workspace modal)" — leave the dependency, it is
  still true, but it is now a *satisfied* one: change it to "Builds on item 5, now done (create in the
  workspace modal), and needs one thing verified first".
- **Item 9**'s first bullet says "item 1 makes that click open the workspace modal". Change "makes" to
  "made", and note that the click target is the title, not the card — which is *why* it is the title,
  and the constraint milestone 3's drag now inherits.

- [ ] **Step 2: Verify the file reads consistently**

Run: `grep -n "^## " docs/ENHANCEMENTS.md`
Expected: items 7, 8 and 9 remain as open entries; 1, 2 & 3, 4, 5 and 6 read as done.

- [ ] **Step 3: Commit**

```bash
git add docs/ENHANCEMENTS.md
git commit -m "docs: mark enhancements 1, 4, 5 and 6 done"
```

---

## Verification checklist

Run before calling the whole thing finished:

- [ ] `dotnet build Umbraco.Community.Kanban.slnx` — clean
- [ ] `dotnet test tests/Umbraco.Community.Kanban.Tests/Umbraco.Community.Kanban.Tests.csproj` — all pass
- [ ] `dotnet test tests/Umbraco.Community.Kanban.Contentment.Tests/Umbraco.Community.Kanban.Contentment.Tests.csproj` — all pass (nothing here touches it; prove it)
- [ ] `cd src/Umbraco.Community.Kanban/Client && npm run build` — `tsc --noEmit` clean and vite builds
- [ ] `cd src/Umbraco.Community.Kanban/Client && npm run test` — all pass
- [ ] `grep -rn "icon-grid" src/Umbraco.Community.Kanban/Client/src` — no output
- [ ] In the backoffice: a board with child items **off** looks exactly as it did before this work, and a card title still opens the modal.
