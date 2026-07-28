using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Lanes;

public class KanbanLaneColourAssignerTests
{
    private static List<KanbanLane> Lanes(int count) =>
        Enumerable.Range(0, count)
            .Select(i => new KanbanLane { Value = $"lane{i}", Name = $"Lane {i}" })
            .ToList();

    [Fact]
    public void Palette_IsTheEightNonLegacyUmbracoColours()
    {
        KanbanLanePalette.Cycle.Should().Equal(
            "yellow", "pink", "blue", "light-blue", "red", "green", "brown", "grey");
    }

    [Fact]
    public void Assign_GivesEachLaneTheColourAtItsIndex()
    {
        var lanes = Lanes(3);

        KanbanLaneColourAssigner.Assign(lanes);

        lanes.Select(x => x.Colour).Should().Equal("yellow", "pink", "blue");
    }

    [Fact]
    public void Assign_WrapsPastTheEndOfThePalette()
    {
        var lanes = Lanes(10);

        KanbanLaneColourAssigner.Assign(lanes);

        lanes[8].Colour.Should().Be("yellow");
        lanes[9].Colour.Should().Be("pink");
    }

    [Fact]
    public void Assign_LeavesExplicitColoursAlone()
    {
        var lanes = Lanes(3);
        lanes[1].Colour = "#ff0000";

        KanbanLaneColourAssigner.Assign(lanes);

        lanes.Select(x => x.Colour).Should().Equal("yellow", "#ff0000", "blue");
    }

    [Fact]
    public void Assign_IndexesFromTheFullOrderSoAnOverrideDoesNotShiftOtherLanes()
    {
        var withoutOverride = Lanes(3);
        KanbanLaneColourAssigner.Assign(withoutOverride);

        var withOverride = Lanes(3);
        withOverride[0].Colour = "#ff0000";
        KanbanLaneColourAssigner.Assign(withOverride);

        withOverride[1].Colour.Should().Be(withoutOverride[1].Colour);
        withOverride[2].Colour.Should().Be(withoutOverride[2].Colour);
    }

    [Fact]
    public void Assign_SkipsTheUnassignedLaneAndLeavesItGrey()
    {
        var lanes = Lanes(2);
        lanes.Add(KanbanLane.Unassigned());

        KanbanLaneColourAssigner.Assign(lanes);

        lanes[2].Colour.Should().Be("grey");
        lanes.Select(x => x.Colour).Should().Equal("yellow", "pink", "grey");
    }

    [Fact]
    public void Assign_IsStableAcrossRepeatedCalls()
    {
        var lanes = Lanes(4);

        KanbanLaneColourAssigner.Assign(lanes);
        var first = lanes.Select(x => x.Colour).ToArray();
        KanbanLaneColourAssigner.Assign(lanes);

        lanes.Select(x => x.Colour).Should().Equal(first);
    }
}
