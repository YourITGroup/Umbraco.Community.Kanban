using Umbraco.Community.Kanban.Grouping;
using Umbraco.Community.Kanban.Grouping.Sources;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Grouping;

public class ManualGroupSourceTests
{
    private static KanbanGroupSourceContext Context(KanbanBoardConfiguration configuration) =>
        new("Umbraco.TextBox", new Dictionary<string, object>(), configuration);

    [Fact]
    public void CanHandle_OnlyWhenTheConfigurationPinsIt()
    {
        var source = new ManualGroupSource();

        source.CanHandle(Context(new KanbanBoardConfiguration { LaneSource = "manual" })).Should().BeTrue();
        source.CanHandle(Context(new KanbanBoardConfiguration())).Should().BeFalse();
    }

    [Fact]
    public void CanHandle_WhenTheToggleIsOn_WithoutAnExplicitSourceAlias()
    {
        // What the "Define lanes manually" toggle actually stores: a boolean, not an alias.
        var source = new ManualGroupSource();

        source.CanHandle(Context(new KanbanBoardConfiguration { UseManualLanes = true })).Should().BeTrue();
    }

    [Fact]
    public void CanHandle_IsTrueEvenForACoreListEditor_BecauseThePinWins()
    {
        // Deliberate overlap with CoreListEditorGroupSource: the resolver prefers the pinned source.
        var context = new KanbanGroupSourceContext(
            "Umbraco.DropDown.Flexible",
            new Dictionary<string, object>(),
            new KanbanBoardConfiguration { LaneSource = "manual" });
        var source = new ManualGroupSource();

        source.CanHandle(context).Should().BeTrue();
    }

    [Fact]
    public async Task GetLanes_ReturnsTheConfiguredLanesInOrder()
    {
        var configuration = new KanbanBoardConfiguration
        {
            LaneSource = "manual",
            ManualLanes =
            [
                new KanbanManualGroup { Value = "todo", Label = "To do", Colour = "blue" },
                new KanbanManualGroup { Value = "done", Label = "Done" },
            ],
        };
        var source = new ManualGroupSource();

        var lanes = await source.GetGroupsAsync(Context(configuration));

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
            ManualLanes = [new KanbanManualGroup { Value = "todo", Label = "" }],
        };
        var source = new ManualGroupSource();

        var lanes = await source.GetGroupsAsync(Context(configuration));

        lanes[0].Name.Should().Be("todo");
    }

    [Fact]
    public async Task GetLanes_CopiesTheIconThrough()
    {
        var configuration = new KanbanBoardConfiguration
        {
            LaneSource = "manual",
            ManualLanes = [new KanbanManualGroup { Value = "todo", Label = "To do", Icon = "icon-todo" }],
        };
        var source = new ManualGroupSource();

        var lanes = await source.GetGroupsAsync(Context(configuration));

        lanes[0].Icon.Should().Be("icon-todo");
    }

    [Fact]
    public async Task GetLanes_ReturnsEmptyWhenNoManualLanesAreConfigured()
    {
        var configuration = new KanbanBoardConfiguration { LaneSource = "manual", ManualLanes = [] };
        var source = new ManualGroupSource();

        var lanes = await source.GetGroupsAsync(Context(configuration));

        lanes.Should().BeEmpty();
    }

    [Fact]
    public async Task GetLanes_SkipsRowsWithNoValue()
    {
        var configuration = new KanbanBoardConfiguration
        {
            LaneSource = "manual",
            ManualLanes = [new KanbanManualGroup { Value = "", Label = "Nameless" }],
        };
        var source = new ManualGroupSource();

        var lanes = await source.GetGroupsAsync(Context(configuration));

        lanes.Should().BeEmpty();
    }

    [Fact]
    public async Task GetLanes_ProducesLanesThatAcceptDrops()
    {
        var configuration = new KanbanBoardConfiguration
        {
            LaneSource = "manual",
            ManualLanes = [new KanbanManualGroup { Value = "todo", Label = "To do" }],
        };
        var source = new ManualGroupSource();

        var lanes = await source.GetGroupsAsync(Context(configuration));

        lanes[0].AcceptsDrops.Should().BeTrue();
        lanes[0].IsUnassigned.Should().BeFalse();
    }
}
