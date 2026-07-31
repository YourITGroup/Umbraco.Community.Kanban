using Umbraco.Community.Kanban.Grouping;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Lanes;

public class KanbanGroupColourAssignerTests
{
    private static List<KanbanGroup> Lanes(int count) =>
        Enumerable.Range(0, count)
            .Select(i => new KanbanGroup { Value = $"lane{i}", Name = $"Lane {i}" })
            .ToList();

    [Fact]
    public void Palette_IsTheEightNonLegacyUmbracoColours()
    {
        KanbanGroupPalette.Cycle.Should().Equal(
            "yellow", "pink", "blue", "light-blue", "red", "green", "brown", "grey");
    }

    [Fact]
    public void Assign_GivesEachLaneTheColourAtItsIndex()
    {
        var lanes = Lanes(3);

        KanbanGroupColourAssigner.Assign(lanes);

        lanes.Select(x => x.Colour).Should().Equal("yellow", "pink", "blue");
    }

    [Fact]
    public void Assign_WrapsPastTheEndOfThePalette()
    {
        var lanes = Lanes(10);

        KanbanGroupColourAssigner.Assign(lanes);

        lanes[8].Colour.Should().Be("yellow");
        lanes[9].Colour.Should().Be("pink");
    }

    [Fact]
    public void Assign_LeavesExplicitColoursAlone()
    {
        var lanes = Lanes(3);
        lanes[1].Colour = "#ff0000";

        KanbanGroupColourAssigner.Assign(lanes);

        lanes.Select(x => x.Colour).Should().Equal("yellow", "#ff0000", "blue");
    }

    [Fact]
    public void Assign_IndexesFromTheFullOrderSoAnOverrideDoesNotShiftOtherLanes()
    {
        var withoutOverride = Lanes(3);
        KanbanGroupColourAssigner.Assign(withoutOverride);

        var withOverride = Lanes(3);
        withOverride[0].Colour = "#ff0000";
        KanbanGroupColourAssigner.Assign(withOverride);

        withOverride[1].Colour.Should().Be(withoutOverride[1].Colour);
        withOverride[2].Colour.Should().Be(withoutOverride[2].Colour);
    }

    [Fact]
    public void Assign_SkipsTheUnassignedLaneAndLeavesItGrey()
    {
        var lanes = Lanes(2);
        lanes.Add(KanbanGroup.Unassigned());

        KanbanGroupColourAssigner.Assign(lanes);

        lanes[2].Colour.Should().Be("grey");
        lanes.Select(x => x.Colour).Should().Equal("yellow", "pink", "grey");
    }

    [Fact]
    public void Assign_IsStableAcrossRepeatedCalls()
    {
        var lanes = Lanes(4);

        KanbanGroupColourAssigner.Assign(lanes);
        var first = lanes.Select(x => x.Colour).ToArray();
        KanbanGroupColourAssigner.Assign(lanes);

        lanes.Select(x => x.Colour).Should().Equal(first);
    }
}
