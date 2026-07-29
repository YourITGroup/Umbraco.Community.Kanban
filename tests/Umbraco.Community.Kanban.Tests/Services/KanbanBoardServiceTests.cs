using Umbraco.Cms.Core.Actions;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.Membership;
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
            CardProperties = CardPropertyList.Of("status"),
            LanePageSize = 25,
        };

        var service = new KanbanBoardService(
            loader,
            new KanbanBoardConfigurationResolver(dataTypes, configurations),
            new KanbanLaneContentTypeResolver(contentTypes),
            laneResolver,
            permissions,
            FakePropertyValueReader.Stored());

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
