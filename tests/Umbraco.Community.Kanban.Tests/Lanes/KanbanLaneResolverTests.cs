using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Lanes.Sources;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Lanes;

public class KanbanLaneResolverTests
{
    private static readonly Guid ContentTypeKey = Guid.Parse("8f6f5f4e-0000-4000-8000-000000000001");

    private static KanbanLaneResolver Resolver(IKanbanPropertyDataTypeLookup lookup) =>
        new(lookup, new KanbanLaneSourceCollection(() => [new ManualLaneSource(), new CoreListEditorLaneSource()]));

    [Fact]
    public async Task Resolve_UsesTheSourceThatHandlesTheEditor()
    {
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.DropDown.Flexible", new Dictionary<string, object> { ["items"] = new[] { "Open", "Done" } });
        var configuration = new KanbanBoardConfiguration { LaneProperty = "status" };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.Where(x => x.IsUnassigned == false).Select(x => x.Value).Should().Equal("Open", "Done");
    }

    [Fact]
    public async Task Resolve_PrefersASourcePinnedByConfiguration()
    {
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.DropDown.Flexible", new Dictionary<string, object> { ["items"] = new[] { "Open" } });
        var configuration = new KanbanBoardConfiguration
        {
            LaneProperty = "status",
            LaneSource = "manual",
            ManualLanes = [new KanbanManualLane { Value = "custom", Label = "Custom" }],
        };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.Where(x => x.IsUnassigned == false).Select(x => x.Value).Should().Equal("custom");
    }

    [Fact]
    public async Task Resolve_AlwaysAppendsTheUnassignedLaneLast()
    {
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.DropDown.Flexible", new Dictionary<string, object> { ["items"] = new[] { "Open" } });
        var configuration = new KanbanBoardConfiguration { LaneProperty = "status" };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.Last().IsUnassigned.Should().BeTrue();
        result.Lanes.Should().ContainSingle(x => x.IsUnassigned);
    }

    [Fact]
    public async Task Resolve_AssignsPaletteColours()
    {
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.DropDown.Flexible", new Dictionary<string, object> { ["items"] = new[] { "Open", "Done" } });
        var configuration = new KanbanBoardConfiguration { LaneProperty = "status" };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes[0].Colour.Should().Be("yellow");
        result.Lanes[1].Colour.Should().Be("pink");
    }

    /// <summary>
    /// This does not prove that Apply runs before Assign in the pipeline — under their current
    /// semantics (Apply always overwrites a lane's colour when the override supplies one; Assign
    /// only ever fills in a colour that is still blank) the two orders are commutative, and no
    /// fixture built from their public behaviour can distinguish them. It proves only that an
    /// override colour wins over the palette colour that colour assignment would otherwise have
    /// given that lane. See the comment on <see cref="KanbanLaneResolver.ResolveAsync"/> for the
    /// full note on why the pipeline order is chosen for clarity rather than enforced here.
    /// </summary>
    [Fact]
    public async Task Resolve_OverrideColourWinsOverPaletteColour()
    {
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.DropDown.Flexible", new Dictionary<string, object> { ["items"] = new[] { "Open", "Done" } });
        var configuration = new KanbanBoardConfiguration
        {
            LaneProperty = "status",
            LaneOverrides = [new KanbanLaneOverride { Value = "Open", Colour = "red", Label = "Blocked" }],
        };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes[0].Colour.Should().Be("red");
        result.Lanes[0].Name.Should().Be("Blocked");
        result.Lanes[1].Colour.Should().Be("pink");
    }

    [Fact]
    public async Task Resolve_ReportsUnmatchedOverrides()
    {
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.DropDown.Flexible", new Dictionary<string, object> { ["items"] = new[] { "Open" } });
        var configuration = new KanbanBoardConfiguration
        {
            LaneProperty = "status",
            LaneOverrides = [new KanbanLaneOverride { Value = "Archived", Colour = "grey" }],
        };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.UnmatchedOverrides.Select(x => x.Value).Should().Equal("Archived");
    }

    [Fact]
    public async Task Resolve_ReturnsOnlyTheUnassignedLaneWhenNoLanePropertyIsConfigured()
    {
        var result = await Resolver(new FakePropertyDataTypeLookup())
            .ResolveAsync(ContentTypeKey, new KanbanBoardConfiguration());

        result.Lanes.Should().ContainSingle().Which.IsUnassigned.Should().BeTrue();
    }

    [Fact]
    public async Task Resolve_ReturnsOnlyTheUnassignedLaneWhenNoSourceHandlesTheEditor()
    {
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.TextBox", new Dictionary<string, object>());
        var configuration = new KanbanBoardConfiguration { LaneProperty = "status" };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.Should().ContainSingle().Which.IsUnassigned.Should().BeTrue();
    }

    [Fact]
    public async Task Resolve_FallsBackToManualLanesWhenLanePropertyNoLongerResolves()
    {
        // LaneProperty points at a property/data type the lookup no longer knows about
        // (renamed or deleted since the board was configured), but the board is pinned
        // to manual lanes, which do not depend on that data type at all.
        var lookup = new FakePropertyDataTypeLookup();
        var configuration = new KanbanBoardConfiguration
        {
            LaneProperty = "status",
            LaneSource = "manual",
            ManualLanes = [new KanbanManualLane { Value = "custom", Label = "Custom" }],
        };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.Where(x => x.IsUnassigned == false).Select(x => x.Value).Should().Equal("custom");
    }
}
