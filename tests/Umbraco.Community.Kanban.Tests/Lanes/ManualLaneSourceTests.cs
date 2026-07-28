using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Lanes.Sources;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Lanes;

public class ManualLaneSourceTests
{
    private static KanbanLaneSourceContext Context(KanbanBoardConfiguration configuration) =>
        new("Umbraco.TextBox", new Dictionary<string, object>(), configuration);

    [Fact]
    public void CanHandle_OnlyWhenTheConfigurationPinsIt()
    {
        var source = new ManualLaneSource();

        source.CanHandle(Context(new KanbanBoardConfiguration { LaneSource = "manual" })).Should().BeTrue();
        source.CanHandle(Context(new KanbanBoardConfiguration())).Should().BeFalse();
    }

    [Fact]
    public async Task GetLanes_ReturnsTheConfiguredLanesInOrder()
    {
        var configuration = new KanbanBoardConfiguration
        {
            LaneSource = "manual",
            ManualLanes =
            [
                new KanbanManualLane { Value = "todo", Label = "To do", Colour = "blue" },
                new KanbanManualLane { Value = "done", Label = "Done" },
            ],
        };
        var source = new ManualLaneSource();

        var lanes = await source.GetLanesAsync(Context(configuration));

        lanes.Select(x => x.Value).Should().Equal("todo", "done");
        lanes[0].Colour.Should().Be("blue");
        lanes[1].Colour.Should().BeNull();
    }

    [Fact]
    public async Task GetLanes_FallsBackToTheValueWhenNoLabelIsGiven()
    {
        var configuration = new KanbanBoardConfiguration
        {
            LaneSource = "manual",
            ManualLanes = [new KanbanManualLane { Value = "todo", Label = "" }],
        };
        var source = new ManualLaneSource();

        var lanes = await source.GetLanesAsync(Context(configuration));

        lanes[0].Name.Should().Be("todo");
    }

    [Fact]
    public async Task GetLanes_SkipsRowsWithNoValue()
    {
        var configuration = new KanbanBoardConfiguration
        {
            LaneSource = "manual",
            ManualLanes = [new KanbanManualLane { Value = "", Label = "Nameless" }],
        };
        var source = new ManualLaneSource();

        var lanes = await source.GetLanesAsync(Context(configuration));

        lanes.Should().BeEmpty();
    }

    [Fact]
    public async Task GetLanes_ProducesLanesThatAcceptDrops()
    {
        var configuration = new KanbanBoardConfiguration
        {
            LaneSource = "manual",
            ManualLanes = [new KanbanManualLane { Value = "todo", Label = "To do" }],
        };
        var source = new ManualLaneSource();

        var lanes = await source.GetLanesAsync(Context(configuration));

        lanes[0].AcceptsDrops.Should().BeTrue();
        lanes[0].IsUnassigned.Should().BeFalse();
    }
}
