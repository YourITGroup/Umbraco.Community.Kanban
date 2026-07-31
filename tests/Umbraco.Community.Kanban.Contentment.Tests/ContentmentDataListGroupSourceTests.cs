using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using Umbraco.Community.Contentment.DataEditors;
using Umbraco.Community.Kanban.Contentment.Tests.Fakes;
using Umbraco.Community.Kanban.Grouping;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Contentment.Tests;

public class ContentmentDataListGroupSourceTests
{
    private const string SourceKey = "Some.Source, Some.Assembly";

    private static ContentmentDataListGroupSource Source(IContentmentDataListItems items) =>
        new(items, NullLogger<ContentmentDataListGroupSource>.Instance);

    private static KanbanGroupSourceContext Context(
        string editorAlias = ContentmentConstants.DataListEditorAlias,
        KanbanBoardConfiguration? configuration = null) =>
        new(
            editorAlias,
            new Dictionary<string, object>
            {
                ["dataSource"] = JsonNode.Parse($$"""[ { "key": "{{SourceKey}}", "value": { "a": 1 } } ]""")!,
            },
            configuration ?? new KanbanBoardConfiguration());

    [Fact]
    public void Alias_IsTheOneABoardConfigurationCanPin()
    {
        Source(new FakeContentmentDataListItems()).Alias.Should().Be("contentment-data-list");
    }

    [Theory]
    [InlineData("Umbraco.Community.Contentment.DataList", true)]
    [InlineData("umbraco.community.contentment.datalist", true)]
    [InlineData("Umbraco.DropDown.Flexible", false)]
    [InlineData("Umbraco.Community.Contentment.DataPicker", false)]
    [InlineData("", false)]
    public void CanHandle_ClaimsOnlyTheDataListEditor(string editorAlias, bool expected)
    {
        // The Data Picker is deliberately not claimed: its sources are built around search and paging
        // rather than a bounded option set.
        Source(new FakeContentmentDataListItems()).CanHandle(Context(editorAlias)).Should().Be(expected);
    }

    [Fact]
    public async Task GetLanes_AsksForTheConfiguredDataSource()
    {
        var items = new FakeContentmentDataListItems();

        await Source(items).GetGroupsAsync(Context());

        items.Requested!.Key.Should().Be(SourceKey);
        items.Requested.ValueJson.Should().Contain("\"a\"");
    }

    [Fact]
    public async Task GetLanes_MapsValueNameAndIcon()
    {
        var items = new FakeContentmentDataListItems(
            new DataListItem { Value = "confirmed", Name = "Confirmed", Icon = "icon-check" });

        IReadOnlyList<KanbanGroup> lanes = await Source(items).GetGroupsAsync(Context());

        lanes.Should().ContainSingle();
        lanes[0].Value.Should().Be("confirmed");
        lanes[0].Name.Should().Be("Confirmed");
        lanes[0].Icon.Should().Be("icon-check");
    }

    [Fact]
    public async Task GetLanes_FallsBackToTheValueWhenAnItemHasNoName()
    {
        var items = new FakeContentmentDataListItems(new DataListItem { Value = "confirmed", Name = "" });

        IReadOnlyList<KanbanGroup> lanes = await Source(items).GetGroupsAsync(Context());

        lanes[0].Name.Should().Be("confirmed");
    }

    [Fact]
    public async Task GetLanes_LeavesColourUnsetSoLanesJoinThePaletteCycle()
    {
        // DataListItem has no colour, and reading one out of its extension bag was deliberately
        // rejected: lane colour comes from an override or the cycle.
        var items = new FakeContentmentDataListItems(new DataListItem { Value = "confirmed", Name = "Confirmed" });

        IReadOnlyList<KanbanGroup> lanes = await Source(items).GetGroupsAsync(Context());

        lanes[0].Colour.Should().BeNull();
    }

    [Fact]
    public async Task GetLanes_TreatsABlankIconAsNoIcon()
    {
        var items = new FakeContentmentDataListItems(new DataListItem { Value = "confirmed", Icon = "" });

        IReadOnlyList<KanbanGroup> lanes = await Source(items).GetGroupsAsync(Context());

        lanes[0].Icon.Should().BeNull();
    }

    [Fact]
    public async Task GetLanes_MakesADisabledItemALaneThatRejectsDrops()
    {
        var items = new FakeContentmentDataListItems(
            new DataListItem { Value = "cancelled", Name = "Cancelled", Disabled = true },
            new DataListItem { Value = "confirmed", Name = "Confirmed" });

        IReadOnlyList<KanbanGroup> lanes = await Source(items).GetGroupsAsync(Context());

        lanes[0].AcceptsDrops.Should().BeFalse();
        lanes[1].AcceptsDrops.Should().BeTrue();
    }

    [Fact]
    public async Task GetLanes_SkipsItemsWithNoValue()
    {
        // A lane with no value can never match a card, and would collide with the unassigned lane.
        var items = new FakeContentmentDataListItems(
            new DataListItem { Value = "", Name = "Nameless" },
            new DataListItem { Value = null, Name = "Also nameless" },
            new DataListItem { Value = "confirmed", Name = "Confirmed" });

        IReadOnlyList<KanbanGroup> lanes = await Source(items).GetGroupsAsync(Context());

        lanes.Select(lane => lane.Value).Should().Equal("confirmed");
    }

    [Fact]
    public async Task GetLanes_PreservesSourceOrder_BecauseOrderDrivesLaneColours()
    {
        var items = new FakeContentmentDataListItems(
            new DataListItem { Value = "pending" },
            new DataListItem { Value = "confirmed" },
            new DataListItem { Value = "cancelled" });

        IReadOnlyList<KanbanGroup> lanes = await Source(items).GetGroupsAsync(Context());

        lanes.Select(lane => lane.Value).Should().Equal("pending", "confirmed", "cancelled");
    }

    [Fact]
    public async Task GetLanes_ReturnsNothingWhenTheConfigurationNamesNoDataSource()
    {
        var context = new KanbanGroupSourceContext(
            ContentmentConstants.DataListEditorAlias,
            new Dictionary<string, object>(),
            new KanbanBoardConfiguration());

        IReadOnlyList<KanbanGroup> lanes = await Source(new FakeContentmentDataListItems()).GetGroupsAsync(context);

        lanes.Should().BeEmpty();
    }

    [Fact]
    public async Task GetLanes_ReturnsNothingWhenTheDataSourceThrows()
    {
        // GetItems runs third-party code. An empty board is recoverable; a 500 from GET /board is not.
        IReadOnlyList<KanbanGroup> lanes =
            await Source(FakeContentmentDataListItems.Throwing()).GetGroupsAsync(Context());

        lanes.Should().BeEmpty();
    }
}
