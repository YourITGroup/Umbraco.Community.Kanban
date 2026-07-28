using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Tests.Models;

public class KanbanLanePreviewResponseModelTests
{
    [Fact]
    public void From_CopiesEveryLaneField()
    {
        var resolution = new KanbanLaneResolution(
            [new KanbanLane { Value = "open", Name = "Open", Colour = "yellow", Icon = "icon-box", AcceptsDrops = true }],
            []);

        var model = KanbanLanePreviewResponseModel.From(resolution);

        var lane = model.Lanes.Should().ContainSingle().Subject;
        lane.Value.Should().Be("open");
        lane.Name.Should().Be("Open");
        lane.Colour.Should().Be("yellow");
        lane.Icon.Should().Be("icon-box");
        lane.IsUnassigned.Should().BeFalse();
        lane.AcceptsDrops.Should().BeTrue();
    }

    [Fact]
    public void From_ReportsUnmatchedOverridesByValue()
    {
        var resolution = new KanbanLaneResolution(
            [],
            [new KanbanLaneOverride { Value = "archived" }]);

        var model = KanbanLanePreviewResponseModel.From(resolution);

        model.UnmatchedOverrides.Should().Equal("archived");
    }
}
