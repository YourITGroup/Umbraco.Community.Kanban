using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using Umbraco.Community.Contentment.DataEditors;
using Umbraco.Community.Kanban.Contentment.Tests.Fakes;
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Lanes.Sources;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Contentment.Tests;

/// <summary>
/// The lane source through the real <see cref="KanbanLaneResolver" />, with the built-in sources
/// alongside it — the arrangement a live site has.
/// </summary>
public class ContentmentLaneResolutionTests
{
    private static readonly Guid ContentTypeKey = Guid.Parse("8f6f5f4e-0000-4000-8000-000000000001");

    private static KanbanLaneResolver Resolver(IContentmentDataListItems items, IKanbanPropertyDataTypeLookup lookup) =>
        new(
            lookup,
            new KanbanLaneSourceCollection(() =>
            [
                new ManualLaneSource(),
                new CoreListEditorLaneSource(),
                new ContentmentDataListLaneSource(items, NullLogger<ContentmentDataListLaneSource>.Instance),
            ]));

    private static FakePropertyDataTypeLookup StatusIsADataList() =>
        new FakePropertyDataTypeLookup().Add(
            "status",
            ContentmentConstants.DataListEditorAlias,
            new Dictionary<string, object>
            {
                ["dataSource"] = JsonNode.Parse("""[ { "key": "Some.Source, Some.Assembly" } ]""")!,
            });

    [Fact]
    public async Task Resolve_UsesTheContentmentSourceForADataListProperty()
    {
        var items = new FakeContentmentDataListItems(
            new DataListItem { Value = "pending", Name = "Pending" },
            new DataListItem { Value = "confirmed", Name = "Confirmed" });
        var configuration = new KanbanBoardConfiguration { LaneProperty = "status" };

        KanbanLaneResolution result = await Resolver(items, StatusIsADataList())
            .ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.Where(lane => lane.IsUnassigned == false).Select(lane => lane.Value)
            .Should().Equal("pending", "confirmed");

        // The resolver always appends the unassigned lane last.
        result.Lanes.Last().IsUnassigned.Should().BeTrue();
    }

    [Fact]
    public async Task Resolve_AssignsPaletteColours_SinceContentmentItemsCarryNone()
    {
        var items = new FakeContentmentDataListItems(new DataListItem { Value = "pending", Name = "Pending" });
        var configuration = new KanbanBoardConfiguration { LaneProperty = "status" };

        KanbanLaneResolution result = await Resolver(items, StatusIsADataList())
            .ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.First().Colour.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task Resolve_StillPrefersManualLanesWhenTheToggleIsOn()
    {
        // A pinned source beats one that merely claims the editor, so an editor can override a
        // Data List's own options.
        var items = new FakeContentmentDataListItems(new DataListItem { Value = "pending", Name = "Pending" });
        var configuration = new KanbanBoardConfiguration
        {
            LaneProperty = "status",
            UseManualLanes = true,
            ManualLanes = [new KanbanManualLane { Value = "custom", Label = "Custom" }],
        };

        KanbanLaneResolution result = await Resolver(items, StatusIsADataList())
            .ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.Where(lane => lane.IsUnassigned == false).Select(lane => lane.Value)
            .Should().Equal("custom");
    }
}
