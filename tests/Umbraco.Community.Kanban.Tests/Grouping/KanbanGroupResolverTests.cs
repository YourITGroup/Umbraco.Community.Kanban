using Umbraco.Community.Kanban.Grouping;
using Umbraco.Community.Kanban.Grouping.Sources;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Lanes;

public class KanbanGroupResolverTests
{
    private static readonly Guid ContentTypeKey = Guid.Parse("8f6f5f4e-0000-4000-8000-000000000001");

    private static KanbanGroupResolver Resolver(IKanbanPropertyDataTypeLookup lookup) =>
        new(lookup, new KanbanGroupSourceCollection(() => [new ManualGroupSource(), new CoreListEditorGroupSource()]));

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
            ManualLanes = [new KanbanManualGroup { Value = "custom", Label = "Custom" }],
        };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.Where(x => x.IsUnassigned == false).Select(x => x.Value).Should().Equal("custom");
    }

    [Fact]
    public async Task Resolve_PrefersManualLanes_WhenTheToggleIsOn()
    {
        // The toggle is what the configuration UI writes; "manual" as a source alias is not typed
        // by hand any more, so the toggle has to reach the same source.
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.DropDown.Flexible", new Dictionary<string, object> { ["items"] = new[] { "Open" } });
        var configuration = new KanbanBoardConfiguration
        {
            LaneProperty = "status",
            UseManualLanes = true,
            ManualLanes = [new KanbanManualGroup { Value = "custom", Label = "Custom" }],
        };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.Where(x => x.IsUnassigned == false).Select(x => x.Value).Should().Equal("custom");
    }

    [Fact]
    public async Task Resolve_AlwaysPutsTheUnassignedLaneFirst()
    {
        // Cards with no value are usually the ones needing attention, so they lead.
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.DropDown.Flexible", new Dictionary<string, object> { ["items"] = new[] { "Open" } });
        var configuration = new KanbanBoardConfiguration { LaneProperty = "status" };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.First().IsUnassigned.Should().BeTrue();
        result.Lanes.Should().ContainSingle(x => x.IsUnassigned);
    }

    [Fact]
    public async Task Resolve_AppliesTheConfiguredLaneOrderWithoutMovingTheUnassignedLane()
    {
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.DropDown.Flexible", new Dictionary<string, object> { ["items"] = new[] { "Open", "Done" } });
        var configuration = new KanbanBoardConfiguration
        {
            LaneProperty = "status",
            LaneOrder = ["Done", "Open"],
        };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.Select(lane => lane.Value).Should().Equal(string.Empty, "Done", "Open");
        result.Lanes.First().IsUnassigned.Should().BeTrue();
    }

    [Fact]
    public async Task Resolve_KeepsEachLanesColourWhenTheOrderChanges()
    {
        // Colours are assigned in source order, before the display order is applied, so dragging a
        // lane moves a column without recolouring it or anything after it.
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.DropDown.Flexible", new Dictionary<string, object> { ["items"] = new[] { "Open", "Done" } });

        var natural = await Resolver(lookup).ResolveAsync(
            ContentTypeKey,
            new KanbanBoardConfiguration { LaneProperty = "status" });

        var reordered = await Resolver(lookup).ResolveAsync(
            ContentTypeKey,
            new KanbanBoardConfiguration { LaneProperty = "status", LaneOrder = ["Done", "Open"] });

        var naturalColours = natural.Lanes.ToDictionary(lane => lane.Value, lane => lane.Colour);

        reordered.Lanes.Should().OnlyContain(lane => lane.Colour == naturalColours[lane.Value]);
    }

    [Fact]
    public async Task Resolve_AssignsPaletteColours()
    {
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.DropDown.Flexible", new Dictionary<string, object> { ["items"] = new[] { "Open", "Done" } });
        var configuration = new KanbanBoardConfiguration { LaneProperty = "status" };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        // The leading unassigned lane is neutral and does not consume a palette position, so the
        // first real lane still gets the first palette colour.
        result.Lanes[0].Colour.Should().Be("grey");
        result.Lanes[1].Colour.Should().Be("yellow");
        result.Lanes[2].Colour.Should().Be("pink");
    }

    /// <summary>
    /// This does not prove that Apply runs before Assign in the pipeline — under their current
    /// semantics (Apply always overwrites a lane's colour when the override supplies one; Assign
    /// only ever fills in a colour that is still blank) the two orders are commutative, and no
    /// fixture built from their public behaviour can distinguish them. It proves only that an
    /// override colour wins over the palette colour that colour assignment would otherwise have
    /// given that lane. See the comment on <see cref="KanbanGroupResolver.ResolveAsync"/> for the
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
            LaneOverrides = [new KanbanGroupOverride { Value = "Open", Colour = "red", Label = "Blocked" }],
        };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes[1].Colour.Should().Be("red");
        result.Lanes[1].Name.Should().Be("Blocked");
        result.Lanes[2].Colour.Should().Be("pink");
    }

    [Fact]
    public async Task Resolve_ReportsUnmatchedOverrides()
    {
        var lookup = new FakePropertyDataTypeLookup()
            .Add("status", "Umbraco.DropDown.Flexible", new Dictionary<string, object> { ["items"] = new[] { "Open" } });
        var configuration = new KanbanBoardConfiguration
        {
            LaneProperty = "status",
            LaneOverrides = [new KanbanGroupOverride { Value = "Archived", Colour = "grey" }],
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
            ManualLanes = [new KanbanManualGroup { Value = "custom", Label = "Custom" }],
        };

        var result = await Resolver(lookup).ResolveAsync(ContentTypeKey, configuration);

        result.Lanes.Where(x => x.IsUnassigned == false).Select(x => x.Value).Should().Equal("custom");
    }
}
