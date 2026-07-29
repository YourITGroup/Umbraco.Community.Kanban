using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Models;

public class KanbanBoardConfigurationTests
{
    [Fact]
    public void PinnedLaneSource_IsNothingByDefault_SoLanesAreDetectedFromTheLaneProperty()
    {
        new KanbanBoardConfiguration().PinnedLaneSource.Should().BeNull();
    }

    [Fact]
    public void PinnedLaneSource_IsManual_WhenTheToggleIsOn()
    {
        new KanbanBoardConfiguration { UseManualLanes = true }.PinnedLaneSource.Should().Be("manual");
    }

    [Fact]
    public void PinnedLaneSource_PrefersAnExplicitAlias_SoAThirdPartySourceIsNotReinterpretedAsManual()
    {
        var configuration = new KanbanBoardConfiguration { LaneSource = "my-source", UseManualLanes = true };

        configuration.PinnedLaneSource.Should().Be("my-source");
    }

    [Fact]
    public void PinnedLaneSource_IgnoresABlankAlias()
    {
        new KanbanBoardConfiguration { LaneSource = "   " }.PinnedLaneSource.Should().BeNull();
        new KanbanBoardConfiguration { LaneSource = "  ", UseManualLanes = true }.PinnedLaneSource.Should().Be("manual");
    }

    [Fact]
    public void ChildItems_AreOffAndUnsortedByDefault_SoAnExistingBoardIsUnchanged()
    {
        var configuration = new KanbanBoardConfiguration();

        configuration.ShowChildItems.Should().BeFalse();
        configuration.ChildItemsSortBy.Should().BeNull();
        configuration.ChildItemsSortDirection.Should().BeNull();
    }
}
