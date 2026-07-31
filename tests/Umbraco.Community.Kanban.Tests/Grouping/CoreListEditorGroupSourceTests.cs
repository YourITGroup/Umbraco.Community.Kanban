using System.Text.Json.Nodes;
using Umbraco.Community.Kanban.Grouping;
using Umbraco.Community.Kanban.Grouping.Sources;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Lanes;

public class CoreListEditorGroupSourceTests
{
    private static KanbanGroupSourceContext Context(string editorAlias, object items) =>
        new(editorAlias, new Dictionary<string, object> { ["items"] = items }, new KanbanBoardConfiguration());

    [Theory]
    [InlineData("Umbraco.DropDown.Flexible")]
    [InlineData("Umbraco.RadioButtonList")]
    [InlineData("Umbraco.CheckBoxList")]
    public void CanHandle_TheThreeCoreListEditors(string editorAlias)
    {
        var source = new CoreListEditorGroupSource();

        source.CanHandle(Context(editorAlias, new[] { "a" })).Should().BeTrue();
    }

    [Fact]
    public void CanHandle_IsFalseForOtherEditors()
    {
        var source = new CoreListEditorGroupSource();

        source.CanHandle(Context("Umbraco.TextBox", new[] { "a" })).Should().BeFalse();
    }

    [Fact]
    public async Task GetLanes_ReadsAStringArray()
    {
        var source = new CoreListEditorGroupSource();

        var lanes = await source.GetGroupsAsync(Context("Umbraco.DropDown.Flexible", new[] { "Open", "Done" }));

        lanes.Select(x => x.Value).Should().Equal("Open", "Done");
        lanes.Select(x => x.Name).Should().Equal("Open", "Done");
    }

    [Fact]
    public async Task GetLanes_ReadsAJsonArray()
    {
        var items = new JsonArray("Open", "Done");
        var source = new CoreListEditorGroupSource();

        var lanes = await source.GetGroupsAsync(Context("Umbraco.RadioButtonList", items));

        lanes.Select(x => x.Value).Should().Equal("Open", "Done");
    }

    [Fact]
    public async Task GetLanes_ReadsAListOfObject()
    {
        var items = new List<object> { "Open", "Done" };
        var source = new CoreListEditorGroupSource();

        var lanes = await source.GetGroupsAsync(Context("Umbraco.CheckBoxList", items));

        lanes.Select(x => x.Value).Should().Equal("Open", "Done");
    }

    [Fact]
    public async Task GetLanes_IsEmptyWhenItemsIsAnUnexpectedType()
    {
        var source = new CoreListEditorGroupSource();

        var lanes = await source.GetGroupsAsync(Context("Umbraco.DropDown.Flexible", 42));

        lanes.Should().BeEmpty();
    }

    [Fact]
    public async Task GetLanes_IsEmptyWhenItemsIsMissing()
    {
        var context = new KanbanGroupSourceContext(
            "Umbraco.DropDown.Flexible",
            new Dictionary<string, object>(),
            new KanbanBoardConfiguration());
        var source = new CoreListEditorGroupSource();

        var lanes = await source.GetGroupsAsync(context);

        lanes.Should().BeEmpty();
    }

    [Fact]
    public async Task GetLanes_SkipsBlankOptions()
    {
        var source = new CoreListEditorGroupSource();

        var lanes = await source.GetGroupsAsync(Context("Umbraco.CheckBoxList", new[] { "Open", "", "  ", "Done" }));

        lanes.Select(x => x.Value).Should().Equal("Open", "Done");
    }
}
