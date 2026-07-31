using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Grouping;

public class KanbanGroupTests
{
    [Fact]
    public void ALane_AcceptsDropsByDefault()
    {
        var lane = new KanbanGroup { Value = "open", Name = "Open" };

        lane.AcceptsDrops.Should().BeTrue();
        lane.IsUnassigned.Should().BeFalse();
        lane.Colour.Should().BeNull();
    }

    [Fact]
    public void TheUnassignedLane_IsDragOutOnly()
    {
        var lane = KanbanGroup.Unassigned();

        lane.IsUnassigned.Should().BeTrue();
        lane.AcceptsDrops.Should().BeFalse();
        lane.Colour.Should().Be("grey");
        lane.Value.Should().BeEmpty();
    }

    [Fact]
    public void BoardConfiguration_DefaultsLanePageSizeTo25AndAllowsDrag()
    {
        var config = new KanbanBoardConfiguration();

        config.LanePageSize.Should().Be(25);
        config.AllowDrag.Should().BeTrue();
        config.ManualLanes.Should().BeEmpty();
        config.LaneOverrides.Should().BeEmpty();
    }
}
