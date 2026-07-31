# Real-time Board Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A board reflects colleagues' changes within a moment of them happening — one `GET /card/{key}` fetch per server event, folded in by a pure reducer, with a brief highlight on the changed card.

**Architecture:** Umbraco 18's SignalR server-event bus (public context `UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT`) tells the client *which* document changed; a new `GET /card/{key}` endpoint says *what it is now* (or that it is no longer this board's child); a pure reducer (`realtime.model.ts`) folds the answer into `KanbanBoardState`; a thin controller (`kanban-realtime.controller.ts`) owns the subscription, in-flight coalescing, drag pause/queue and reconnect resync. Sync lives in `core/`, so every host gets it.

**Tech Stack:** .NET 10 / Umbraco CMS 18.x (server), Lit 3 + TypeScript + Vite (client), xUnit + AwesomeAssertions (server tests), Vitest in Node — no DOM (client tests).

**Spec:** `docs/superpowers/specs/2026-07-31-realtime-board-sync-design.md`

## Global Constraints

- Repo rules: no mocking frameworks — hand-written fakes only; C# uses file-scoped namespaces, primary constructors, **no** underscore prefix on private fields; Lit elements use `#name` private members and `_name` for `@state()` fields.
- Client imports **never** reach into `@umbraco-cms/backoffice/dist-cms/...` — public export paths only. The server-event context is public: `UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT` from `@umbraco-cms/backoffice/management-api`.
- Client Vitest runs in Node with no DOM: pure models get tests; elements and controllers are verified by `tsc --noEmit` + `npm run build`.
- No backticks inside `css` template literal comments (breaks `tsc` — see milestone-4 plan history).
- Event source/type strings are exactly `'Umbraco:CMS:Document'` and `'Created' | 'Updated' | 'Deleted' | 'Trashed'`.
- A transient fetch failure must never remove a card.
- All commands run from the repo root `/Users/gandalf/Source/Repos/Umbraco.Community.Kanban` unless a `cd` says otherwise. Client commands run in `src/Umbraco.Community.Kanban/Client`.

## File Structure

```
src/Umbraco.Community.Kanban/
├── Services/IKanbanCardService.cs                     MODIFY  add GetCardAsync + KanbanCardRequest/Result/Status
├── Services/KanbanCardService.cs                      MODIFY  implement GetCardAsync (gains IKanbanPropertyValueReader)
├── Models/Api/KanbanCardRequestModel.cs               CREATE  query model for GET /card/{key}
├── Models/Api/KanbanCardResponseModel.cs              CREATE  { IsChild, LaneValue, Card }
├── Controllers/CardController.cs                      MODIFY  add GET card/{key:guid} action
└── Client/src/
    ├── constants.ts                                   MODIFY  KANBAN_CARD_ENDPOINT
    ├── data/kanban-data-source.ts                     MODIFY  KanbanCardQuery/Outcome, buildCardQuery, getCard
    ├── data/kanban-server-data-source.ts              MODIFY  implement getCard
    ├── data/kanban-data-source.test.ts                MODIFY  buildCardQuery tests
    ├── core/board.model.ts                            MODIFY  export sameLane
    ├── core/realtime.model.ts                         CREATE  applyCardResult reducer
    ├── core/realtime.model.test.ts                    CREATE  reducer tests
    ├── core/realtime-queue.model.ts                   CREATE  latest-per-key event queue
    ├── core/realtime-queue.model.test.ts              CREATE  queue tests
    ├── core/kanban-realtime.controller.ts             CREATE  subscription/coalesce/pause/resync controller
    ├── core/kanban-board.element.ts                   MODIFY  wire controller, highlight set, pause/resume
    ├── core/kanban-lane.element.ts                    MODIFY  pass highlight down to cards
    └── core/kanban-card.element.ts                    MODIFY  highlight property + CSS pulse
tests/Umbraco.Community.Kanban.Tests/
└── Services/KanbanCardServiceTests.cs                 MODIFY  GetCardAsync tests (harness gains value reader)
docs/TODO.md                                           MODIFY  record milestone 5a
```

---

### Task 1: Server — `GetCardAsync` on the card service

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Services/IKanbanCardService.cs`
- Modify: `src/Umbraco.Community.Kanban/Services/KanbanCardService.cs`
- Test: `tests/Umbraco.Community.Kanban.Tests/Services/KanbanCardServiceTests.cs`

**Interfaces:**
- Consumes: `IKanbanContentLoader` (`GetById(Guid)`, `GetById(int)`, `GetGrandchildren(int parentId, int level, int cap, Ordering)`), `IKanbanBoardConfigurationResolver.ResolveAsync(Guid? configId, Guid? listViewKey)`, `IContentPermissionAuthorizer` (`IsDeniedAsync`, `FilterAuthorizedAsync`), `KanbanCardMapper.Map(content, cardProperties, culture, canUpdate, valueReader, canCreate, children)`, `KanbanLaneValueReader.Read(content, laneProperty, culture)`, `KanbanCardChildAssembler.Assemble(grandchildren, browseable, capped, culture, displayCap)`, `KanbanChildOrdering.From(sortBy, direction, culture)`.
- Produces (Task 2 relies on these exact names):
  - `enum KanbanCardStatus { Success, NotChild, CardNotFound, ParentNotFound, ParentAccessDenied, ConfigurationNotFound, NotConfigured }`
  - `sealed record KanbanCardRequest(Guid CardKey, Guid ParentId, Guid? ConfigId, string? Culture)`
  - `sealed record KanbanCardResult(KanbanCardStatus Status, string? LaneValue, KanbanCardModel? Card)`
  - `Task<KanbanCardResult> GetCardAsync(KanbanCardRequest request, IUser user)` on `IKanbanCardService`
  - **Breaking-ish:** `KanbanCardService`'s primary constructor gains a fifth parameter `IKanbanPropertyValueReader propertyValueReader` (DI resolves it automatically; only the test harness constructs by hand).

- [ ] **Step 1: Write the failing tests**

Append to `tests/Umbraco.Community.Kanban.Tests/Services/KanbanCardServiceTests.cs`, inside the existing class. The existing `Harness` record and `Configured(...)` helper construct `KanbanCardService` — first extend the harness construction (this is part of making the tests compile): add `new FakePropertyValueReader()` as the last constructor argument in `Configured(...)`:

```csharp
        var service = new KanbanCardService(
            loader,
            writer,
            new KanbanBoardConfigurationResolver(dataTypes, configurations),
            permissions,
            new FakePropertyValueReader());
```

(`FakePropertyValueReader` already exists in `tests/.../Fakes/` — the board service tests use it.)

Then add the new tests:

```csharp
    // ---- GetCardAsync -------------------------------------------------------------------------

    private static KanbanCardRequest CardRequest(Guid cardKey, string? culture = null) =>
        new(cardKey, ParentKey, null, culture);

    [Fact]
    public async Task Returns_the_card_and_its_lane_value_for_a_child_of_the_parent()
    {
        Harness harness = Configured();
        Content card = Card(harness);
        card.SetValue("status", "doing");

        KanbanCardResult result = await harness.Service.GetCardAsync(CardRequest(card.Key), User);

        result.Status.Should().Be(KanbanCardStatus.Success);
        result.LaneValue.Should().Be("doing");
        result.Card.Should().NotBeNull();
        result.Card!.Name.Should().Be("Write the spec");
    }

    [Fact]
    public async Task Reports_not_child_when_the_document_belongs_to_a_different_parent()
    {
        Harness harness = Configured();
        var stranger = new Content("Elsewhere", 999, harness.CardContentType)
        {
            Id = 8888,
            Key = Guid.Parse("77777777-7777-7777-7777-777777777777"),
        };
        harness.Loader.Content[stranger.Key] = stranger;

        KanbanCardResult result = await harness.Service.GetCardAsync(CardRequest(stranger.Key), User);

        result.Status.Should().Be(KanbanCardStatus.NotChild);
        result.Card.Should().BeNull();
    }

    [Fact]
    public async Task Reports_not_child_when_the_user_may_not_browse_the_card()
    {
        // Deliberately the SAME status as "different parent": distinguishing them would leak the
        // existence of documents the user cannot browse.
        Harness harness = Configured();
        Content card = Card(harness);
        harness.Permissions.Allowed[ActionBrowse.ActionLetter] = [ParentKey];

        KanbanCardResult result = await harness.Service.GetCardAsync(CardRequest(card.Key), User);

        result.Status.Should().Be(KanbanCardStatus.NotChild);
    }

    [Fact]
    public async Task Reports_not_child_when_the_card_is_trashed()
    {
        Harness harness = Configured();
        Content card = Card(harness);
        card.Trashed = true;

        KanbanCardResult result = await harness.Service.GetCardAsync(CardRequest(card.Key), User);

        result.Status.Should().Be(KanbanCardStatus.NotChild);
    }

    [Fact]
    public async Task Reports_card_not_found_for_an_unknown_key()
    {
        Harness harness = Configured();

        KanbanCardResult result = await harness.Service.GetCardAsync(
            CardRequest(Guid.Parse("99999999-9999-9999-9999-999999999999")), User);

        result.Status.Should().Be(KanbanCardStatus.CardNotFound);
    }

    [Fact]
    public async Task Reports_parent_not_found_for_an_unknown_parent()
    {
        Harness harness = Configured();
        Content card = Card(harness);

        KanbanCardResult result = await harness.Service.GetCardAsync(
            new KanbanCardRequest(card.Key, Guid.Parse("88888888-8888-8888-8888-888888888888"), null, null), User);

        result.Status.Should().Be(KanbanCardStatus.ParentNotFound);
    }

    [Fact]
    public async Task Reports_access_denied_when_the_user_may_not_browse_the_parent()
    {
        Harness harness = Configured();
        Content card = Card(harness);
        harness.Permissions.Allowed[ActionBrowse.ActionLetter] = [card.Key];

        KanbanCardResult result = await harness.Service.GetCardAsync(CardRequest(card.Key), User);

        result.Status.Should().Be(KanbanCardStatus.ParentAccessDenied);
    }

    [Fact]
    public async Task Reports_the_cards_update_and_create_permissions()
    {
        Harness harness = Configured();
        Content card = Card(harness);
        harness.Permissions.Allowed[ActionUpdate.ActionLetter] = [];
        harness.Permissions.Allowed[ActionNew.ActionLetter] = [card.Key];

        KanbanCardResult result = await harness.Service.GetCardAsync(CardRequest(card.Key), User);

        result.Card!.CanUpdate.Should().BeFalse();
        result.Card.CanCreate.Should().BeTrue();
    }

    [Fact]
    public async Task Reads_the_lane_value_for_the_requested_culture()
    {
        Harness harness = Configured(
            documentVariations: ContentVariation.Culture,
            propertyVariations: ContentVariation.Culture);
        Content card = Card(harness);
        card.SetCultureName("Write the spec", "en-US");
        card.SetCultureName("Skriv spesifikasjonen", "nb-NO");
        card.SetValue("status", "doing", "en-US");
        card.SetValue("status", "done", "nb-NO");

        KanbanCardResult result = await harness.Service.GetCardAsync(CardRequest(card.Key, "nb-NO"), User);

        result.LaneValue.Should().Be("done");
        result.Card!.Name.Should().Be("Skriv spesifikasjonen");
    }

    [Fact]
    public async Task Composes_the_cards_children_when_the_board_shows_them()
    {
        Harness harness = Configured(new KanbanBoardConfiguration
        {
            LaneProperty = "status",
            AllowDrag = true,
            ShowChildItems = true,
        });
        Content card = Card(harness);
        var child = new Content("Subtask", card.Id, harness.CardContentType)
        {
            Id = 5555,
            Key = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
        };
        harness.Loader.Grandchildren.Add(child);

        KanbanCardResult result = await harness.Service.GetCardAsync(CardRequest(card.Key), User);

        result.Card!.Children.Should().ContainSingle(c => c.Name == "Subtask");
        harness.Loader.GrandchildRequests.Should().ContainSingle()
            .Which.ParentId.Should().Be(card.Id);
    }

    [Fact]
    public async Task Skips_the_child_query_when_the_board_does_not_show_children()
    {
        Harness harness = Configured();
        Content card = Card(harness);

        await harness.Service.GetCardAsync(CardRequest(card.Key), User);

        harness.Loader.GrandchildRequests.Should().BeEmpty();
    }

    [Fact]
    public async Task Get_reports_configuration_not_found_when_the_named_configuration_is_missing()
    {
        Harness harness = Configured();
        Content card = Card(harness);
        harness.Configurations.BoardConfigurations.Clear();

        KanbanCardResult result = await harness.Service.GetCardAsync(CardRequest(card.Key), User);

        result.Status.Should().Be(KanbanCardStatus.ConfigurationNotFound);
    }

    [Fact]
    public async Task An_explicit_config_id_wins_over_the_parents_list_view()
    {
        // The same precedence GetBoardAsync has, through the same resolver — a board and its
        // reconciliation fetches must never disagree about which configuration is in force.
        Harness harness = Configured();
        Content card = Card(harness);
        var explicitKey = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        harness.Configurations.BoardConfigurations[explicitKey] = new KanbanBoardConfiguration
        {
            LaneProperty = "status",
            AllowDrag = true,
        };
        harness.Configurations.BoardConfigurations.Remove(BoardConfigKey);

        KanbanCardResult result = await harness.Service.GetCardAsync(
            new KanbanCardRequest(card.Key, ParentKey, explicitKey, null), User);

        // The list-view configuration is gone; only the explicit one can have satisfied this.
        result.Status.Should().Be(KanbanCardStatus.Success);
    }
```

Note on `Reports_the_cards_update_and_create_permissions`: `FakeContentPermissionAuthorizer.Allowed` treats an **absent** letter as "all allowed" and an **empty set** as "denied to everyone" — setting `Allowed[ActionUpdate.ActionLetter] = []` denies update.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests --filter "FullyQualifiedName~KanbanCardServiceTests" 2>&1 | tail -20`
Expected: compile errors — `KanbanCardRequest`, `KanbanCardStatus`, `GetCardAsync` do not exist.

- [ ] **Step 3: Add the contract to `IKanbanCardService.cs`**

Append to `src/Umbraco.Community.Kanban/Services/IKanbanCardService.cs` (same file as the lane types, following its layout):

```csharp
public enum KanbanCardStatus
{
    Success,

    /// <summary>
    /// The document exists but is not a browseable child of the requested parent — moved elsewhere,
    /// trashed, or browse-denied. One status for all three, deliberately: either way the client must
    /// not show it, and distinguishing them would leak the existence of documents the user cannot see.
    /// </summary>
    NotChild,

    /// <summary>No document with that key — deleted, or never existed.</summary>
    CardNotFound,

    /// <summary>No document with the requested parent key.</summary>
    ParentNotFound,

    /// <summary>The user may not browse the parent, so there is no board to reconcile against.</summary>
    ParentAccessDenied,

    /// <summary>A configuration was named, but it is missing or is not a Kanban Board.</summary>
    ConfigurationNotFound,

    /// <summary>The parent's collection names no Kanban configuration.</summary>
    NotConfigured,
}

/// <param name="ConfigId">An explicit configuration, or null to resolve from the parent's list view.</param>
/// <param name="Culture">The culture to read for, or null for invariant.</param>
public sealed record KanbanCardRequest(Guid CardKey, Guid ParentId, Guid? ConfigId, string? Culture);

/// <param name="LaneValue">
/// The card's raw lane value, read the same way the board reads it — the client matches it to a lane
/// case-insensitively, falling back to the unassigned lane. Null on any non-success status.
/// </param>
/// <param name="Card">The card as the board would compose it. Null on any non-success status.</param>
public sealed record KanbanCardResult(KanbanCardStatus Status, string? LaneValue, Models.Api.KanbanCardModel? Card);
```

And add to the `IKanbanCardService` interface:

```csharp
    /// <summary>
    /// One card, composed exactly as <c>GET /board</c> would compose it, for real-time reconciliation:
    /// a server event names a key, and this answers what that document is on this board now.
    /// </summary>
    Task<KanbanCardResult> GetCardAsync(KanbanCardRequest request, IUser user);
```

- [ ] **Step 4: Implement `GetCardAsync` in `KanbanCardService.cs`**

Extend the primary constructor with `IKanbanPropertyValueReader propertyValueReader` (fifth parameter), add the permission sets and the method:

```csharp
    private static readonly ISet<string> BrowsePermission = new HashSet<string> { ActionBrowse.ActionLetter };
    private static readonly ISet<string> CreatePermission = new HashSet<string> { ActionNew.ActionLetter };

    public async Task<KanbanCardResult> GetCardAsync(KanbanCardRequest request, IUser user)
    {
        IContent? parent = contentLoader.GetById(request.ParentId);

        if (parent is null)
        {
            return NotFound(KanbanCardStatus.ParentNotFound);
        }

        if (await permissionAuthorizer.IsDeniedAsync(user, [parent.Key], BrowsePermission))
        {
            return NotFound(KanbanCardStatus.ParentAccessDenied);
        }

        KanbanBoardConfigurationResult configuration = await configurationResolver.ResolveAsync(
            request.ConfigId,
            parent.ContentType.ListView);

        if (configuration.Status != KanbanBoardConfigurationStatus.Success || configuration.Configuration is null)
        {
            return NotFound(ToCardStatus(configuration.Status));
        }

        KanbanBoardConfiguration board = configuration.Configuration;

        IContent? card = contentLoader.GetById(request.CardKey);

        if (card is null)
        {
            return NotFound(KanbanCardStatus.CardNotFound);
        }

        // Trashed, moved elsewhere, and browse-denied all collapse to NotChild — see the enum's remarks.
        if (card.Trashed || card.ParentId != parent.Id)
        {
            return NotFound(KanbanCardStatus.NotChild);
        }

        if (await permissionAuthorizer.IsDeniedAsync(user, [card.Key], BrowsePermission))
        {
            return NotFound(KanbanCardStatus.NotChild);
        }

        var canUpdate = await permissionAuthorizer.IsDeniedAsync(user, [card.Key], UpdatePermission) == false;
        var canCreate = await permissionAuthorizer.IsDeniedAsync(user, [card.Key], CreatePermission) == false;

        KanbanCardChildren children = board.ShowChildItems
            ? await ComposeChildrenAsync(card, board, request.Culture, user)
            : KanbanCardChildren.None;

        return new KanbanCardResult(
            KanbanCardStatus.Success,
            KanbanLaneValueReader.Read(card, board.LaneProperty, request.Culture),
            KanbanCardMapper.Map(
                card,
                board.CardProperties,
                request.Culture,
                canUpdate,
                propertyValueReader,
                canCreate,
                children));
    }

    /// <summary>
    /// The card's children through the same query shape the board uses — its descendants one level
    /// down, in the configured child order — so a reconciled card lists children identically to a
    /// board-loaded one.
    /// </summary>
    private async Task<KanbanCardChildren> ComposeChildrenAsync(
        IContent card,
        KanbanBoardConfiguration board,
        string? culture,
        IUser user)
    {
        KanbanGrandchildPage page = contentLoader.GetGrandchildren(
            card.Id,
            card.Level + 1,
            Constants.DefaultGrandchildCap,
            KanbanChildOrdering.From(board.ChildItemsSortBy, board.ChildItemsSortDirection, culture));

        ISet<Guid> browseable = await permissionAuthorizer.FilterAuthorizedAsync(
            user,
            page.Grandchildren.Select(child => child.Key),
            BrowsePermission);

        IReadOnlyDictionary<int, KanbanCardChildren> byCard = KanbanCardChildAssembler.Assemble(
            page.Grandchildren,
            browseable,
            page.Capped,
            culture,
            Constants.CardChildDisplayCap);

        return byCard.GetValueOrDefault(card.Id) ?? KanbanCardChildren.None;
    }

    private static KanbanCardResult NotFound(KanbanCardStatus status) => new(status, null, null);

    private static KanbanCardStatus ToCardStatus(KanbanBoardConfigurationStatus status) => status switch
    {
        KanbanBoardConfigurationStatus.ConfigurationNotFound => KanbanCardStatus.ConfigurationNotFound,
        _ => KanbanCardStatus.NotConfigured,
    };
```

Add the missing usings if not present: `using Umbraco.Community.Kanban.Models.Api;` is NOT needed (result type references it fully-qualified in the record; alternatively add the using and shorten — match the file's existing usings, which already include `Umbraco.Community.Kanban.Models`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test tests/Umbraco.Community.Kanban.Tests --filter "FullyQualifiedName~KanbanCardServiceTests" 2>&1 | tail -5`
Expected: PASS, all (existing lane tests plus the ~12 new ones).

- [ ] **Step 6: Run the whole server suite**

Run: `dotnet test 2>&1 | tail -5`
Expected: PASS — nothing else constructs `KanbanCardService` by hand except this harness; if `RegistrationTests` fail, the DI container is missing `IKanbanPropertyValueReader` (it is not — the board service already takes one).

- [ ] **Step 7: Commit**

```bash
git add src/Umbraco.Community.Kanban/Services/IKanbanCardService.cs src/Umbraco.Community.Kanban/Services/KanbanCardService.cs tests/Umbraco.Community.Kanban.Tests/Services/KanbanCardServiceTests.cs
git commit -m "feat: GetCardAsync composes one card for real-time reconciliation"
```

---

### Task 2: Server — `GET /card/{key}` endpoint

**Files:**
- Create: `src/Umbraco.Community.Kanban/Models/Api/KanbanCardRequestModel.cs`
- Create: `src/Umbraco.Community.Kanban/Models/Api/KanbanCardResponseModel.cs`
- Modify: `src/Umbraco.Community.Kanban/Controllers/CardController.cs`

**Interfaces:**
- Consumes: `IKanbanCardService.GetCardAsync(KanbanCardRequest, IUser)` → `KanbanCardResult` (Task 1).
- Produces (Task 3's client mirrors this JSON): `GET {api}/v1/card/{key}?parentId=&configId=&culture=` → `200 { isChild: true, laneValue, card } | 200 { isChild: false } | 404 | 403 | 400 ProblemDetails`.

- [ ] **Step 1: Create the request model**

`src/Umbraco.Community.Kanban/Models/Api/KanbanCardRequestModel.cs`:

```csharp
using Microsoft.AspNetCore.Mvc;

namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>Query parameters of GET /card/{key} — the key itself is a route value.</summary>
public sealed class KanbanCardRequestModel
{
    /// <summary>The board's parent document. A card is only returned if it is a child of this.</summary>
    [FromQuery(Name = "parentId")]
    public required Guid ParentId { get; init; }

    /// <summary>An explicit configuration, or null to resolve from the parent's list view.</summary>
    [FromQuery(Name = "configId")]
    public Guid? ConfigId { get; init; }

    [FromQuery(Name = "culture")]
    public string? Culture { get; init; }
}
```

(Match `KanbanBoardRequestModel.cs`'s attribute style — open it and copy the `[FromQuery]` pattern exactly if it differs.)

- [ ] **Step 2: Create the response model**

`src/Umbraco.Community.Kanban/Models/Api/KanbanCardResponseModel.cs`:

```csharp
namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>
/// The answer to "what is this document on this board now": the card and its lane, or not-a-child.
/// </summary>
public sealed class KanbanCardResponseModel
{
    /// <summary>
    /// False when the document exists but must not be shown on this board — moved elsewhere, trashed,
    /// or not browseable. One shape for all three, so the response leaks nothing.
    /// </summary>
    public required bool IsChild { get; init; }

    /// <summary>The card's raw lane value. Null when <see cref="IsChild" /> is false.</summary>
    public string? LaneValue { get; init; }

    /// <summary>The card as the board composes it. Null when <see cref="IsChild" /> is false.</summary>
    public KanbanCardModel? Card { get; init; }
}
```

- [ ] **Step 3: Add the action to `CardController`**

Append to `src/Umbraco.Community.Kanban/Controllers/CardController.cs`, inside the class:

```csharp
    /// <summary>
    /// One card, for real-time reconciliation: a server event says a document changed, and this says
    /// what it is on this board now. isChild false means "remove it if you are showing it".
    /// </summary>
    [HttpGet("card/{key:guid}")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(KanbanCardResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetCard(Guid key, KanbanCardRequestModel request)
    {
        KanbanCardResult result = await cardService.GetCardAsync(
            new KanbanCardRequest(key, request.ParentId, request.ConfigId, request.Culture),
            CurrentUser(backOfficeSecurityAccessor));

        return result.Status switch
        {
            KanbanCardStatus.Success => Ok(new KanbanCardResponseModel
            {
                IsChild = true,
                LaneValue = result.LaneValue,
                Card = result.Card,
            }),
            KanbanCardStatus.NotChild => Ok(new KanbanCardResponseModel { IsChild = false }),
            KanbanCardStatus.CardNotFound => NotFound(),
            KanbanCardStatus.ParentNotFound => NotFound(),
            KanbanCardStatus.ParentAccessDenied => Forbidden(),
            KanbanCardStatus.ConfigurationNotFound => BadRequest(new ProblemDetailsBuilder()
                .WithTitle("Kanban configuration not found")
                .WithDetail("The Kanban configuration this collection points at no longer exists. Choose one on the Kanban tab of the collection's data type.")
                .Build()),
            _ => BadRequest(new ProblemDetailsBuilder()
                .WithTitle("No Kanban configuration")
                .WithDetail($"This card's collection has no usable Kanban configuration. Set '{Constants.BoardConfigIdKey}' and a lane property on the Kanban tab of the collection's data type.")
                .Build()),
        };
    }
```

`CurrentUser`, `Forbidden`, `ProblemDetailsBuilder` are already in use by `SetLane` in this same file — no new usings needed.

- [ ] **Step 4: Build and run the whole server suite**

Run: `dotnet build Umbraco.Community.Kanban.slnx 2>&1 | tail -3 && dotnet test 2>&1 | tail -5`
Expected: build succeeds, all tests pass. (Controllers carry no direct tests in this repo — the service layer is the tested seam; the controller is a mapping this plan spells out completely.)

- [ ] **Step 5: Commit**

```bash
git add src/Umbraco.Community.Kanban/Models/Api/KanbanCardRequestModel.cs src/Umbraco.Community.Kanban/Models/Api/KanbanCardResponseModel.cs src/Umbraco.Community.Kanban/Controllers/CardController.cs
git commit -m "feat: GET /card/{key} answers what a document is on this board now"
```

---

### Task 3: Client — `getCard` on the data source

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/constants.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/data/kanban-data-source.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/data/kanban-server-data-source.ts`
- Test: `src/Umbraco.Community.Kanban/Client/src/data/kanban-data-source.test.ts`

**Interfaces:**
- Consumes: Task 2's JSON shape (`isChild`, `laneValue`, `card` — camelCased by the Management API's serializer, like every existing endpoint).
- Produces (Tasks 4 and 6 rely on these exact names):
  - `interface KanbanCardQuery { key: string; parentId: string; configId?: string; culture?: string | null }`
  - `type KanbanCardOutcome = { kind: 'child'; laneValue: string; card: KanbanCardModel } | { kind: 'not-child' } | { kind: 'gone' } | { kind: 'error' }`
  - `buildCardQuery(query: KanbanCardQuery): Record<string, string>`
  - `getCard(query: KanbanCardQuery): Promise<KanbanCardOutcome>` on `KanbanDataSource`

- [ ] **Step 1: Write the failing tests**

Append to `src/Umbraco.Community.Kanban/Client/src/data/kanban-data-source.test.ts` (it already imports from `./kanban-data-source.js` — extend the import with `buildCardQuery`):

```ts
describe('buildCardQuery', () => {
  it('sends the parent and omits everything optional that is absent', () => {
    expect(buildCardQuery({ key: 'k1', parentId: 'p1' })).toEqual({ parentId: 'p1' });
  });

  it('sends configId and culture when present', () => {
    expect(buildCardQuery({ key: 'k1', parentId: 'p1', configId: 'c1', culture: 'nb-NO' })).toEqual({
      parentId: 'p1',
      configId: 'c1',
      culture: 'nb-NO',
    });
  });

  it('omits an empty culture, which means "no culture", not a culture named empty string', () => {
    expect(buildCardQuery({ key: 'k1', parentId: 'p1', culture: '' })).toEqual({ parentId: 'p1' });
  });

  it('does not put the key in the query string — it is a route value', () => {
    expect(Object.keys(buildCardQuery({ key: 'k1', parentId: 'p1' }))).not.toContain('key');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/data/kanban-data-source.test.ts 2>&1 | tail -5`
Expected: FAIL — `buildCardQuery` is not exported.

- [ ] **Step 3: Add the endpoint constant, types, builder and interface member**

In `src/Umbraco.Community.Kanban/Client/src/constants.ts`, next to `KANBAN_CARD_LANE_ENDPOINT`:

```ts
export const KANBAN_CARD_ENDPOINT = (key: string): string => `${KANBAN_API_PATH}/card/${key}`;
```

In `src/Umbraco.Community.Kanban/Client/src/data/kanban-data-source.ts`:

```ts
/** Identifies one card on one board — the same coordinates GET /board uses, plus the card's key. */
export interface KanbanCardQuery {
  key: string;
  parentId: string;
  configId?: string;
  culture?: string | null;
}

/**
 * What a document is on this board now. `not-child` and `gone` both mean "remove it if held" — the
 * server deliberately does not distinguish moved-away from not-browseable, and a 404 adds deleted.
 * `error` is transient and must change nothing: a failed fetch never removes a card.
 */
export type KanbanCardOutcome =
  | { kind: 'child'; laneValue: string; card: KanbanCardModel }
  | { kind: 'not-child' }
  | { kind: 'gone' }
  | { kind: 'error' };

/** Builds the query string for GET /card/{key}. The key travels in the route, never the query. */
export function buildCardQuery(query: KanbanCardQuery): Record<string, string> {
  const built: Record<string, string> = { parentId: query.parentId };

  if (query.configId) built.configId = query.configId;
  if (query.culture) built.culture = query.culture;

  return built;
}
```

Add to the `KanbanDataSource` interface:

```ts
  getCard(query: KanbanCardQuery): Promise<KanbanCardOutcome>;
```

The `KanbanCardModel` import already exists in this file's type imports (extend it if the name is missing).

- [ ] **Step 4: Implement `getCard` on the server data source**

In `src/Umbraco.Community.Kanban/Client/src/data/kanban-server-data-source.ts`, extend the imports (`KANBAN_CARD_ENDPOINT` from constants; `buildCardQuery`, `KanbanCardOutcome`, `KanbanCardQuery` from `./kanban-data-source.js`; `KanbanCardModel` type), add the response interface beside `KanbanCardLaneResponseModel` and the method to the class:

```ts
/**
 * Response body of GET /card/{key}. An interface for the same RequestResult-collapse reason
 * KanbanCardLaneResponseModel documents above.
 */
interface KanbanCardResponseModel {
  isChild: boolean;
  laneValue?: string | null;
  card?: KanbanCardModel | null;
}
```

```ts
  async getCard(query: KanbanCardQuery): Promise<KanbanCardOutcome> {
    const { data, error } = await tryExecute(
      this.#host,
      umbHttpClient.get<KanbanCardResponseModel>({
        url: KANBAN_CARD_ENDPOINT(query.key),
        query: buildCardQuery(query),
        security: [{ type: 'http', scheme: 'bearer' }],
      }),
      // Reconciliation is background work; a toast per failed background fetch would be noise.
      { disableNotifications: true },
    );

    if (error) {
      // 404 is an answer — the document is gone — not a fault. Everything else is transient.
      return (error as { status?: number }).status === 404 ? { kind: 'gone' } : { kind: 'error' };
    }

    if (!data) return { kind: 'error' };

    return data.isChild && data.card
      ? { kind: 'child', laneValue: data.laneValue ?? '', card: data.card }
      : { kind: 'not-child' };
  }
```

- [ ] **Step 5: Run tests and type-check**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/data/kanban-data-source.test.ts 2>&1 | tail -5 && npx tsc --noEmit`
Expected: tests PASS; `tsc` clean (no other class implements `KanbanDataSource`, so the new interface member breaks nothing else).

- [ ] **Step 6: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/constants.ts src/Umbraco.Community.Kanban/Client/src/data/kanban-data-source.ts src/Umbraco.Community.Kanban/Client/src/data/kanban-server-data-source.ts src/Umbraco.Community.Kanban/Client/src/data/kanban-data-source.test.ts
git commit -m "feat: getCard fetches one card for real-time reconciliation"
```

---

### Task 4: Client — the reconciliation reducer

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/board.model.ts` (export `sameLane`)
- Create: `src/Umbraco.Community.Kanban/Client/src/core/realtime.model.ts`
- Test: `src/Umbraco.Community.Kanban/Client/src/core/realtime.model.test.ts`

**Interfaces:**
- Consumes: `KanbanBoardState`, `KanbanBoardLaneModel`, `sameLane` from `board.model.ts`; `KanbanCardOutcome` from Task 3.
- Produces (Task 7 relies on): `applyCardResult(state: KanbanBoardState, key: string, outcome: KanbanCardOutcome): { state: KanbanBoardState; changed: boolean }`.

- [ ] **Step 1: Export `sameLane` from `board.model.ts`**

Change the private helper at the bottom of `src/Umbraco.Community.Kanban/Client/src/core/board.model.ts` from `function sameLane(` to `export function sameLane(`. (Its doc lives on the call sites; add one line above it: `/** Lane values compare case-insensitively everywhere — the server matches them the same way. */`)

- [ ] **Step 2: Write the failing tests**

Create `src/Umbraco.Community.Kanban/Client/src/core/realtime.model.test.ts`. The `board(...)`/`lane(...)`/`card(...)` helpers mirror the ones `board.model.test.ts` uses — copy the shapes exactly as below (they build full `KanbanCardModel`s so `tsc` is satisfied):

```ts
import { describe, it, expect } from 'vitest';
import { toBoardState } from './board.model.js';
import { applyCardResult } from './realtime.model.js';
import type { KanbanCardOutcome } from '../data/kanban-data-source.js';
import type { KanbanBoardModel, KanbanCardModel } from '../data/kanban-board.types.js';

function card(key: string, overrides: Partial<KanbanCardModel> = {}): KanbanCardModel {
  return {
    key,
    name: `Card ${key}`,
    contentTypeAlias: 'task',
    contentTypeKey: 'ct-1',
    state: 'published',
    canUpdate: true,
    canCreate: false,
    children: [],
    childTotal: 0,
    childTotalIsExact: true,
    properties: [],
    ...overrides,
  };
}

function lane(
  value: string,
  cardKeys: string[],
  overrides: Partial<KanbanBoardModel['lanes'][number]> = {},
) {
  return {
    value,
    name: value || 'Unassigned',
    isUnassigned: value === '',
    acceptsDrops: value !== '',
    total: cardKeys.length,
    totalIsExact: true,
    skip: 0,
    cards: cardKeys.map((key) => card(key)),
    ...overrides,
  };
}

function board(lanes: ReturnType<typeof lane>[]): KanbanBoardModel {
  return { lanes, truncated: false, childCount: 0, showChildItems: false, allowDrag: true };
}

const child = (laneValue: string, c: KanbanCardModel): KanbanCardOutcome => ({
  kind: 'child',
  laneValue,
  card: c,
});

describe('applyCardResult', () => {
  const initial = () => toBoardState(board([lane('todo', ['a', 'b']), lane('doing', ['x']), lane('', [])]));

  it('replaces a held card in place when its lane is unchanged', () => {
    const fresh = card('a', { name: 'Renamed', state: 'publishedPendingChanges' });

    const result = applyCardResult(initial(), 'a', child('todo', fresh));

    expect(result.changed).toBe(true);
    const todo = result.state.lanes.find((l) => l.value === 'todo')!;
    expect(todo.cards.map((c) => c.key)).toEqual(['a', 'b']);
    expect(todo.cards[0].name).toBe('Renamed');
    expect(todo.total).toBe(2);
  });

  it('moves a held card between lanes, carrying the totals with it', () => {
    const result = applyCardResult(initial(), 'a', child('doing', card('a')));

    const todo = result.state.lanes.find((l) => l.value === 'todo')!;
    const doing = result.state.lanes.find((l) => l.value === 'doing')!;
    expect(todo.cards.map((c) => c.key)).toEqual(['b']);
    expect(todo.total).toBe(1);
    expect(doing.cards.map((c) => c.key)).toEqual(['x', 'a']);
    expect(doing.total).toBe(2);
  });

  it('matches the lane case-insensitively, as the server does', () => {
    const result = applyCardResult(initial(), 'a', child('DOING', card('a')));

    expect(result.state.lanes.find((l) => l.value === 'doing')!.cards.map((c) => c.key)).toEqual(['x', 'a']);
  });

  it('appends an unknown card to the end of its lane', () => {
    const result = applyCardResult(initial(), 'new', child('todo', card('new')));

    const todo = result.state.lanes.find((l) => l.value === 'todo')!;
    expect(todo.cards.map((c) => c.key)).toEqual(['a', 'b', 'new']);
    expect(todo.total).toBe(3);
  });

  it('routes an unmatched lane value to the unassigned lane, as the board composer does', () => {
    const result = applyCardResult(initial(), 'new', child('archived', card('new')));

    const unassigned = result.state.lanes.find((l) => l.isUnassigned)!;
    expect(unassigned.cards.map((c) => c.key)).toEqual(['new']);
    expect(unassigned.total).toBe(1);
  });

  it('removes a held card on not-child', () => {
    const result = applyCardResult(initial(), 'a', { kind: 'not-child' });

    expect(result.changed).toBe(true);
    const todo = result.state.lanes.find((l) => l.value === 'todo')!;
    expect(todo.cards.map((c) => c.key)).toEqual(['b']);
    expect(todo.total).toBe(1);
  });

  it('removes a held card on gone', () => {
    const result = applyCardResult(initial(), 'x', { kind: 'gone' });

    expect(result.state.lanes.find((l) => l.value === 'doing')!.cards).toEqual([]);
  });

  it('does nothing for an unheld key on gone', () => {
    const state = initial();

    const result = applyCardResult(state, 'stranger', { kind: 'gone' });

    expect(result.changed).toBe(false);
    expect(result.state).toBe(state);
  });

  it('does nothing on error — a failed fetch never removes a card', () => {
    const state = initial();

    const result = applyCardResult(state, 'a', { kind: 'error' });

    expect(result.changed).toBe(false);
    expect(result.state).toBe(state);
  });

  it('leaves a card with a write in flight alone — that is our own echo', () => {
    const state = toBoardState(
      board([lane('todo', [], { cards: [card('a', { saving: true })], total: 1 })]),
    );

    const result = applyCardResult(state, 'a', child('todo', card('a', { name: 'Echo' })));

    expect(result.changed).toBe(false);
    expect(result.state.lanes[0].cards[0].name).toBe('Card a');
  });

  it('preserves totalIsExact through a move', () => {
    const state = toBoardState(
      board([lane('todo', ['a'], { total: 30, totalIsExact: false }), lane('doing', ['x'])]),
    );

    const result = applyCardResult(state, 'a', child('doing', card('a')));

    const todo = result.state.lanes.find((l) => l.value === 'todo')!;
    expect(todo.total).toBe(29);
    expect(todo.totalIsExact).toBe(false);
  });

  it('does nothing when the board has no lane for the value and no unassigned lane', () => {
    const state = toBoardState(board([lane('todo', ['a'])]));

    const result = applyCardResult(state, 'new', child('archived', card('new')));

    expect(result.changed).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/core/realtime.model.test.ts 2>&1 | tail -5`
Expected: FAIL — cannot resolve `./realtime.model.js`.

- [ ] **Step 4: Implement the reducer**

Create `src/Umbraco.Community.Kanban/Client/src/core/realtime.model.ts`:

```ts
import { sameLane, type KanbanBoardState } from './board.model.js';
import type { KanbanCardOutcome } from '../data/kanban-data-source.js';
import type { KanbanBoardLaneModel } from '../data/kanban-board.types.js';

/** The reconciled board, and whether anything actually changed — `changed` drives the highlight. */
export interface KanbanRealtimeResult {
  state: KanbanBoardState;
  changed: boolean;
}

/**
 * Folds one fetched card into the board. Pure; never mutates its input.
 *
 * The rules, in the order they are checked:
 * - an `error` outcome changes nothing — a transient fetch failure must never remove a card;
 * - a held card with a write in flight is left alone — that is our own optimistic write's echo
 *   arriving before the PUT resolves, and the write's completion path owns that card's state;
 * - `not-child` and `gone` both remove the card if held (deleted, trashed, moved to another parent,
 *   or permission lost — the server deliberately conflates them), and are a no-op if not;
 * - a `child` in the lane the card already occupies replaces it in place;
 * - a `child` in a different lane moves it, totals adjusted the way moveCard adjusts them;
 * - an unheld `child` appends to its lane — the end, not a guessed sort position; the next full load
 *   restores true order. A lane value matching no lane belongs to the unassigned lane, the same rule
 *   the server's board composer applies.
 *
 * Every applied `child` result reports `changed: true` rather than diffing the card's fields —
 * a re-pulsed highlight is cheaper than a wrong "nothing changed".
 */
export function applyCardResult(
  state: KanbanBoardState,
  key: string,
  outcome: KanbanCardOutcome,
): KanbanRealtimeResult {
  if (outcome.kind === 'error') return unchanged(state);

  const holding = state.lanes.find((lane) => lane.cards.some((card) => card.key === key));
  const held = holding?.cards.find((card) => card.key === key);

  if (held?.saving) return unchanged(state);

  if (outcome.kind === 'not-child' || outcome.kind === 'gone') {
    if (!holding) return unchanged(state);

    return { state: removeFrom(state, holding, key), changed: true };
  }

  const target =
    state.lanes.find((lane) => sameLane(lane.value, outcome.laneValue)) ??
    state.lanes.find((lane) => lane.isUnassigned);

  if (!target) return unchanged(state);

  if (holding && sameLane(holding.value, target.value)) {
    return {
      state: {
        ...state,
        lanes: state.lanes.map((lane) =>
          lane === holding
            ? { ...lane, cards: lane.cards.map((card) => (card.key === key ? outcome.card : card)) }
            : lane,
        ),
      },
      changed: true,
    };
  }

  const removed = holding ? removeFrom(state, holding, key) : state;

  return {
    state: {
      ...removed,
      lanes: removed.lanes.map((lane) =>
        sameLane(lane.value, target.value)
          ? { ...lane, cards: [...lane.cards, outcome.card], total: lane.total + 1 }
          : lane,
      ),
    },
    changed: true,
  };
}

function unchanged(state: KanbanBoardState): KanbanRealtimeResult {
  return { state, changed: false };
}

function removeFrom(state: KanbanBoardState, holding: KanbanBoardLaneModel, key: string): KanbanBoardState {
  return {
    ...state,
    lanes: state.lanes.map((lane) =>
      lane === holding
        ? { ...lane, cards: lane.cards.filter((card) => card.key !== key), total: lane.total - 1 }
        : lane,
    ),
  };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/core/realtime.model.test.ts src/core/board.model.test.ts 2>&1 | tail -5`
Expected: PASS (both files — the `sameLane` export must not disturb `board.model.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core/board.model.ts src/Umbraco.Community.Kanban/Client/src/core/realtime.model.ts src/Umbraco.Community.Kanban/Client/src/core/realtime.model.test.ts
git commit -m "feat: reconciliation reducer folds one fetched card into the board"
```

---

### Task 5: Client — the paused-event queue

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/core/realtime-queue.model.ts`
- Test: `src/Umbraco.Community.Kanban/Client/src/core/realtime-queue.model.test.ts`

**Interfaces:**
- Produces (Task 6 relies on): `interface KanbanRealtimeEvent { key: string; kind: 'changed' | 'gone' }`, `enqueueEvent(queue: readonly KanbanRealtimeEvent[], event: KanbanRealtimeEvent): KanbanRealtimeEvent[]`.

- [ ] **Step 1: Write the failing tests**

Create `src/Umbraco.Community.Kanban/Client/src/core/realtime-queue.model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { enqueueEvent, type KanbanRealtimeEvent } from './realtime-queue.model.js';

describe('enqueueEvent', () => {
  const changed = (key: string): KanbanRealtimeEvent => ({ key, kind: 'changed' });
  const gone = (key: string): KanbanRealtimeEvent => ({ key, kind: 'gone' });

  it('appends events for distinct keys in arrival order', () => {
    const queue = enqueueEvent(enqueueEvent([], changed('a')), changed('b'));

    expect(queue.map((e) => e.key)).toEqual(['a', 'b']);
  });

  it('keeps only the latest event per key — a save then a delete is just the delete', () => {
    const queue = enqueueEvent(enqueueEvent([changed('b')], changed('a')), gone('a'));

    expect(queue).toEqual([changed('b'), gone('a')]);
  });

  it('moves a re-raised key to the back, preserving overall arrival order', () => {
    const queue = enqueueEvent([changed('a'), changed('b')], changed('a'));

    expect(queue.map((e) => e.key)).toEqual(['b', 'a']);
  });

  it('never mutates its input', () => {
    const original: KanbanRealtimeEvent[] = [changed('a')];

    enqueueEvent(original, gone('a'));

    expect(original).toEqual([changed('a')]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/core/realtime-queue.model.test.ts 2>&1 | tail -5`
Expected: FAIL — cannot resolve `./realtime-queue.model.js`.

- [ ] **Step 3: Implement**

Create `src/Umbraco.Community.Kanban/Client/src/core/realtime-queue.model.ts`:

```ts
/**
 * One server event, reduced to what reconciliation needs: which document, and whether it still
 * exists. 'gone' covers Deleted and Trashed — both skip the fetch; 'changed' covers Created and
 * Updated — both cost one fetch to learn the answer.
 */
export interface KanbanRealtimeEvent {
  key: string;
  kind: 'changed' | 'gone';
}

/**
 * Queues an event while the board is paused (mid-drag), keeping only the latest event per key.
 * Pure, so latest-wins is tested directly: ten saves of one document while a drag is held open
 * flush as one fetch, and a save followed by a delete flushes as just the delete.
 */
export function enqueueEvent(
  queue: readonly KanbanRealtimeEvent[],
  event: KanbanRealtimeEvent,
): KanbanRealtimeEvent[] {
  return [...queue.filter((held) => held.key !== event.key), event];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd src/Umbraco.Community.Kanban/Client && npx vitest run src/core/realtime-queue.model.test.ts 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core/realtime-queue.model.ts src/Umbraco.Community.Kanban/Client/src/core/realtime-queue.model.test.ts
git commit -m "feat: latest-per-key queue for events arriving mid-drag"
```

---

### Task 6: Client — the realtime controller

**Files:**
- Create: `src/Umbraco.Community.Kanban/Client/src/core/kanban-realtime.controller.ts`

**Interfaces:**
- Consumes: `UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT` from `@umbraco-cms/backoffice/management-api` (`byEventSourcesAndEventTypes(sources, types)` → rxjs Observable, `isConnected` → Observable<boolean | undefined>); `KanbanDataSource.getCard` (Task 3); `enqueueEvent` (Task 5).
- Produces (Task 7 relies on):
  - `interface KanbanRealtimeCallbacks { onCardOutcome: (key: string, outcome: KanbanCardOutcome) => void; onResync: () => void }`
  - `interface KanbanRealtimeQuery { parentId: string; configId?: string; culture?: string | null; datasource: KanbanDataSource }`
  - `class KanbanRealtimeController extends UmbControllerBase` with `constructor(host: UmbControllerHost, callbacks: KanbanRealtimeCallbacks)`, `configure(query: KanbanRealtimeQuery): void`, `pause(): void`, `resume(): void`.

No unit test file: this controller is deliberately thin — every decision it makes beyond plumbing lives in the two tested pure models. Verification is `tsc --noEmit` + build, the repo's convention for controllers and elements.

- [ ] **Step 1: Implement the controller**

Create `src/Umbraco.Community.Kanban/Client/src/core/kanban-realtime.controller.ts`:

```ts
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT } from '@umbraco-cms/backoffice/management-api';
import { enqueueEvent, type KanbanRealtimeEvent } from './realtime-queue.model.js';
import type { KanbanCardOutcome, KanbanDataSource } from '../data/kanban-data-source.js';

/** The event source and types Umbraco broadcasts for documents — the same four core's own
 * cache invalidation subscribes to, over the same authorised channel. */
const DOCUMENT_EVENT_SOURCE = 'Umbraco:CMS:Document';
const DOCUMENT_EVENT_TYPES = ['Created', 'Updated', 'Deleted', 'Trashed'];
const GONE_EVENT_TYPES = new Set(['Deleted', 'Trashed']);

export interface KanbanRealtimeCallbacks {
  /** One reconciliation answer, ready for the reducer. Called once per event that survives coalescing. */
  onCardOutcome: (key: string, outcome: KanbanCardOutcome) => void;
  /** The hub reconnected after a drop: events were missed, not queued — reload everything. */
  onResync: () => void;
}

export interface KanbanRealtimeQuery {
  parentId: string;
  configId?: string;
  culture?: string | null;
  datasource: KanbanDataSource;
}

/**
 * Subscribes the board to Umbraco's document server events and turns each into at most one small
 * fetch. Everything with behaviour worth testing is delegated: latest-per-key queueing to
 * realtime-queue.model.ts, and what an answer does to the board to realtime.model.ts — this class
 * is plumbing.
 *
 * Unconfigured (before the board's first load) it drops events: there is no board to reconcile.
 */
export class KanbanRealtimeController extends UmbControllerBase {
  #callbacks: KanbanRealtimeCallbacks;
  #query?: KanbanRealtimeQuery;

  /** True while a drag is live — events queue rather than reorganising the board under the pointer. */
  #paused = false;

  #queue: KanbanRealtimeEvent[] = [];

  /** Keys with a fetch already in flight. A second event for one of these is dropped: the pending
   * response is about to land, and a change after that raises another event anyway. */
  #inFlight = new Set<string>();

  /** The last isConnected value seen, so a reconnect (false to true) is told apart from the initial
   * connect (undefined to true), which needs no resync. */
  #wasConnected?: boolean;

  constructor(host: UmbControllerHost, callbacks: KanbanRealtimeCallbacks) {
    super(host);

    this.#callbacks = callbacks;

    this.consumeContext(UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT, (context) => {
      this.observe(
        context?.byEventSourcesAndEventTypes([DOCUMENT_EVENT_SOURCE], DOCUMENT_EVENT_TYPES),
        (event) => {
          if (event) this.#onEvent(event.eventType, event.key);
        },
        '_kanbanServerEvents',
      );

      this.observe(
        context?.isConnected,
        (connected) => {
          if (connected === undefined) return;

          if (connected && this.#wasConnected === false) this.#callbacks.onResync();

          this.#wasConnected = connected;
        },
        '_kanbanServerEventConnection',
      );
    });
  }

  /** (Re)supplies the board's coordinates. Called from every load, so parent, culture and
   * configuration changes are picked up without a lifecycle of their own. */
  configure(query: KanbanRealtimeQuery): void {
    this.#query = query;
  }

  pause(): void {
    this.#paused = true;
  }

  resume(): void {
    this.#paused = false;

    const queued = this.#queue;
    this.#queue = [];

    for (const event of queued) this.#dispatch(event);
  }

  #onEvent(eventType: string, key: string): void {
    if (!this.#query) return;

    // The parent's own lifecycle belongs to the workspace above the board, not to reconciliation.
    if (key.toLowerCase() === this.#query.parentId.toLowerCase()) return;

    const event: KanbanRealtimeEvent = { key, kind: GONE_EVENT_TYPES.has(eventType) ? 'gone' : 'changed' };

    if (this.#paused) {
      this.#queue = enqueueEvent(this.#queue, event);
      return;
    }

    this.#dispatch(event);
  }

  #dispatch(event: KanbanRealtimeEvent): void {
    if (event.kind === 'gone') {
      this.#callbacks.onCardOutcome(event.key, { kind: 'gone' });
      return;
    }

    void this.#fetch(event.key);
  }

  async #fetch(key: string): Promise<void> {
    const query = this.#query;

    if (!query || this.#inFlight.has(key)) return;

    this.#inFlight.add(key);

    try {
      const outcome = await query.datasource.getCard({
        key,
        parentId: query.parentId,
        configId: query.configId,
        culture: query.culture,
      });

      this.#callbacks.onCardOutcome(key, outcome);
    } finally {
      this.#inFlight.delete(key);
    }
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd src/Umbraco.Community.Kanban/Client && npx tsc --noEmit`
Expected: clean. If `UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT` fails to resolve, the import path is wrong — it is exported from `@umbraco-cms/backoffice/management-api` (verified against the installed 18.0.2 dist); do not fall back to a `dist-cms` path.

- [ ] **Step 3: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core/kanban-realtime.controller.ts
git commit -m "feat: realtime controller turns document server events into card fetches"
```

---

### Task 7: Client — board wiring and the highlight

**Files:**
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-lane.element.ts`
- Modify: `src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts`

**Interfaces:**
- Consumes: `KanbanRealtimeController` (Task 6), `applyCardResult` (Task 4).
- Produces: lane property `highlightKeys?: ReadonlySet<string>`; card property `highlight: boolean` (reflected attribute).

- [ ] **Step 1: Wire the controller into the board element**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts`:

Add imports:

```ts
import { applyCardResult } from './realtime.model.js';
import { KanbanRealtimeController } from './kanban-realtime.controller.js';
```

Add fields (beside the other private fields):

```ts
  /**
   * Cards changed by a colleague in the last moment — drives the highlight pulse. Reassigned, never
   * mutated, because Lit change-detects @state by reference.
   */
  @state()
  private _recentlyChanged: ReadonlySet<string> = new Set();

  /** The pending highlight-clear timers, so a card changed twice re-pulses instead of half-clearing. */
  #highlightTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * The server-event subscription. Lives on the board rather than a host so every host — collection
   * view today, workspace view and injected later — gets sync without wiring of its own.
   */
  #realtime = new KanbanRealtimeController(this, {
    onCardOutcome: (key, outcome) => this.#onRealtimeOutcome(key, outcome),
    onResync: () => this.load(),
  });
```

The `outcome` parameter type is inferred from `KanbanRealtimeCallbacks`; no extra import is needed beyond the two above (if `tsc` asks, import `type { KanbanCardOutcome } from '../data/kanban-data-source.js'` and annotate).

In `load()`, immediately after the `if (!this.parentId || !this.datasource) return;` guard, add:

```ts
    // Every load re-supplies the realtime coordinates, so parent, culture and configuration changes
    // are picked up without a lifecycle of their own.
    this.#realtime.configure({
      parentId: this.parentId,
      configId: this.configId,
      culture: this.culture,
      datasource: this.datasource,
    });
```

Add the handler methods (near `#applyMove`):

```ts
  /** One reconciliation answer. The reducer decides everything; this applies it and pulses the card. */
  #onRealtimeOutcome(key: string, outcome: Parameters<typeof applyCardResult>[2]): void {
    if (!this._board) return;

    const result = applyCardResult(this._board, key, outcome);

    if (!result.changed) return;

    this._board = result.state;
    this.#markChanged(key);
  }

  /** Flags a card as just-changed for long enough for its pulse to read, then clears it. */
  #markChanged(key: string): void {
    const existing = this.#highlightTimers.get(key);

    if (existing !== undefined) clearTimeout(existing);

    this._recentlyChanged = new Set([...this._recentlyChanged, key]);

    this.#highlightTimers.set(
      key,
      setTimeout(() => {
        this.#highlightTimers.delete(key);
        const next = new Set(this._recentlyChanged);
        next.delete(key);
        this._recentlyChanged = next;
      }, 2000),
    );
  }
```

Pause and resume around a drag — one line each:
- In `#onDragStart`, after `this._drag = { ...event.detail };` add `this.#realtime.pause();`
- In `#onDragEnd`, after the gesture-state clearing block (after `this.#pointer = undefined;`) add `this.#realtime.resume();`
- In `#onDragCancel`, after `this.#pointer = undefined;` add `this.#realtime.resume();`

Clear the timers on disconnect. The element already has (or gains) a `disconnectedCallback` — if one exists (it removes the resize listener), extend it; otherwise add:

```ts
  override disconnectedCallback(): void {
    super.disconnectedCallback();

    for (const timer of this.#highlightTimers.values()) clearTimeout(timer);
    this.#highlightTimers.clear();
  }
```

(Check first: `grep -n "disconnectedCallback" src/core/kanban-board.element.ts` — extend rather than duplicate.)

In `#renderBoard()`, pass the set to each lane — add one line to the lane binding:

```ts
              .highlightKeys=${this._recentlyChanged}
```

(next to `?show-child-items=...` in the `umb-community-kanban-lane` template).

- [ ] **Step 2: Pass the highlight through the lane**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-lane.element.ts`, add a property (beside `showChildItems`):

```ts
  /** Cards to pulse as just-changed by a colleague. Owned by the board; the lane only passes it down. */
  @property({ attribute: false })
  highlightKeys?: ReadonlySet<string>;
```

And in the card template inside `.cards`, add:

```ts
              ?highlight=${this.highlightKeys?.has(card.key) ?? false}
```

(next to the card's `?show-child-items=` binding).

- [ ] **Step 3: The card's pulse**

In `src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts`:

Add the property (beside `allowDrag`):

```ts
  /**
   * True briefly after a colleague's change landed on this card, so the change is visible rather than
   * silent. Reflected because the pulse is a :host([highlight]) CSS animation.
   */
  @property({ type: Boolean, reflect: true })
  highlight = false;
```

Add to the styles (after the `.card.saving` rule; note — no backticks inside these comments):

```css
      /* A colleague's change just landed here. The animation restarts because the attribute drops
         off and returns, which is why the board clears and re-adds the key rather than extending. */
      :host([highlight]) .card {
        animation: kanban-remote-change 1.6s ease-out;
      }

      @keyframes kanban-remote-change {
        0% {
          background-color: color-mix(in srgb, var(--uui-color-selected) 18%, var(--uui-color-surface));
          border-color: var(--uui-color-selected);
        }
        100% {
          background-color: var(--uui-color-surface);
          border-color: var(--uui-color-border);
        }
      }

      /* The same signal without motion: a steady tinted border for the highlight's duration. */
      @media (prefers-reduced-motion: reduce) {
        :host([highlight]) .card {
          animation: none;
          border-color: var(--uui-color-selected);
        }
      }
```

- [ ] **Step 4: Type-check, build, full client suite**

Run: `cd src/Umbraco.Community.Kanban/Client && npm run build 2>&1 | tail -5 && npm run test 2>&1 | tail -5`
Expected: build clean, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/Umbraco.Community.Kanban/Client/src/core/kanban-board.element.ts src/Umbraco.Community.Kanban/Client/src/core/kanban-lane.element.ts src/Umbraco.Community.Kanban/Client/src/core/kanban-card.element.ts
git commit -m "feat: board reconciles colleague changes live, with a highlight pulse"
```

---

### Task 8: Docs and final verification

**Files:**
- Modify: `docs/TODO.md`

- [ ] **Step 1: Record milestone 5a in `docs/TODO.md`**

In the `## Milestone 5 — Content app host and real-time sync ❌ Not built` section: retitle it
`## Milestone 5 — Content app host and real-time sync — 5a (real-time) ✅ done, 5b (content app) ❌ not built`,
replace the `**Real-time sync.**` bullet with:

```markdown
- [x] **Real-time sync (5a).** Built 2026-07-31 from
  [its design](superpowers/specs/2026-07-31-realtime-board-sync-design.md). `GET /card/{key}` answers
  what a document is on this board now; `applyCardResult` (core/realtime.model.ts) folds it in;
  `KanbanRealtimeController` subscribes to `UMB_MANAGEMENT_API_SERVER_EVENT_CONTEXT` (the public 18.x
  token — the parent design's `UMB_SERVER_EVENT_CONTEXT` name was stale), coalesces in-flight keys,
  queues events mid-drag (latest-per-key), and triggers a full reload on hub reconnect. Changed cards
  pulse for ~2s (`prefers-reduced-motion` gets a steady border tint instead). Needs hand-verification
  with two browser sessions: move/save/trash/delete/create in one, watch the other.
```

and reword the remaining content-app bullet to say it is **5b**, awaiting its own spec.

- [ ] **Step 2: Full verification — both stacks**

Run: `dotnet build Umbraco.Community.Kanban.slnx 2>&1 | tail -3 && dotnet test 2>&1 | tail -4 && cd src/Umbraco.Community.Kanban/Client && npm run build 2>&1 | tail -3 && npm run test 2>&1 | tail -4`
Expected: everything green.

- [ ] **Step 3: Confirm the built bundle actually contains the new code**

Run: `grep -cl "serverEvent\|byEventSourcesAndEventTypes" src/Umbraco.Community.Kanban/wwwroot/App_Plugins/UmbracoCommunityKanban/*.js | head -3`
Expected: at least one bundle file matches. (This is the stale-bundle check that caught the milestone-3 failure mode.)

- [ ] **Step 4: Commit**

```bash
git add docs/TODO.md
git commit -m "docs: record real-time sync (milestone 5a) in the TODO"
```

---

## Hand-verification (after implementation, needs the running site)

Not part of the automated plan — record outcomes in `docs/TODO.md`:

1. Two backoffice sessions on the same board. In session A: save a card → session B sees its badge flip with a pulse. Move a card between lanes → B sees it move, both lane counts adjust. Trash a card → it disappears in B. Create a child → it appears at the end of its lane in B.
2. Drag a card in B while A saves a different card → nothing moves under the pointer; the change lands right after the drop.
3. Kill the site (or drop the network) and restore it → B's board reloads once on reconnect.
