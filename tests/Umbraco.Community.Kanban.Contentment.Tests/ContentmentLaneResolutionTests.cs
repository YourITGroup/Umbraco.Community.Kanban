using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using Umbraco.Community.Contentment.DataEditors;
using Umbraco.Community.Kanban.Contentment.Tests.Fakes;
using Umbraco.Community.Kanban.Grouping;
using Umbraco.Community.Kanban.Grouping.Sources;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Contentment.Tests;

/// <summary>
/// The group source through the real <see cref="KanbanGroupResolver" />, with the built-in sources
/// alongside it — the arrangement a live site has.
/// </summary>
public class ContentmentLaneResolutionTests
{
    private static readonly Guid ContentTypeKey = Guid.Parse("8f6f5f4e-0000-4000-8000-000000000001");

    private static KanbanGroupResolver Resolver(IContentmentDataListItems items, IKanbanPropertyDataTypeLookup lookup) =>
        new(
            lookup,
            new KanbanGroupSourceCollection(() =>
            [
                new ManualGroupSource(),
                new CoreListEditorGroupSource(),
                new ContentmentDataListGroupSource(items, NullLogger<ContentmentDataListGroupSource>.Instance),
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

        KanbanGroupResolution result = await Resolver(items, StatusIsADataList())
            .ResolveAsync(ContentTypeKey, configuration);

        result.Groups.Where(lane => lane.IsUnassigned == false).Select(lane => lane.Value)
            .Should().Equal("pending", "confirmed");

        // The resolver always puts the unassigned lane first.
        result.Groups.First().IsUnassigned.Should().BeTrue();
    }

    [Fact]
    public async Task Resolve_AssignsPaletteColours_SinceContentmentItemsCarryNone()
    {
        var items = new FakeContentmentDataListItems(new DataListItem { Value = "pending", Name = "Pending" });
        var configuration = new KanbanBoardConfiguration { LaneProperty = "status" };

        KanbanGroupResolution result = await Resolver(items, StatusIsADataList())
            .ResolveAsync(ContentTypeKey, configuration);

        result.Groups.First().Colour.Should().NotBeNullOrWhiteSpace();
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
            ManualLanes = [new KanbanManualGroup { Value = "custom", Label = "Custom" }],
        };

        KanbanGroupResolution result = await Resolver(items, StatusIsADataList())
            .ResolveAsync(ContentTypeKey, configuration);

        result.Groups.Where(lane => lane.IsUnassigned == false).Select(lane => lane.Value)
            .Should().Equal("custom");
    }
}
