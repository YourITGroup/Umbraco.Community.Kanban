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
