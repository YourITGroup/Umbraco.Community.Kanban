using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanConfigurationMappingTests
{
    private static readonly Guid Key = Guid.Parse("8f6f5f4e-0000-4000-8000-000000000002");
    private static readonly Guid ContentTypeKey = Guid.Parse("8f6f5f4e-0000-4000-8000-000000000003");

    [Fact]
    public void Map_ABoardConfiguration()
    {
        var configuration = new KanbanBoardConfiguration
        {
            AppliesTo = [ContentTypeKey],
            TabName = "Board",
            TabIcon = "icon-grid",
        };

        var model = KanbanConfigurationMapper.Map(Key, "Task board", Constants.BoardEditorAlias, configuration);

        model.Should().NotBeNull();
        model!.Key.Should().Be(Key);
        model.Name.Should().Be("Task board");
        model.Kind.Should().Be(KanbanConfigurationKind.Board);
        model.AppliesTo.Should().Equal(ContentTypeKey);
        model.TabName.Should().Be("Board");
        model.TabIcon.Should().Be("icon-grid");
    }

    [Fact]
    public void Map_ACalendarConfiguration()
    {
        var configuration = new KanbanCalendarConfiguration { AppliesTo = [ContentTypeKey] };

        var model = KanbanConfigurationMapper.Map(Key, "Schedule", Constants.CalendarEditorAlias, configuration);

        model!.Kind.Should().Be(KanbanConfigurationKind.Calendar);
        model.AppliesTo.Should().Equal(ContentTypeKey);
    }

    [Fact]
    public void Map_ReturnsNullForAnUnknownEditorAlias()
    {
        var model = KanbanConfigurationMapper.Map(Key, "Something", "Umbraco.TextBox", new KanbanBoardConfiguration());

        model.Should().BeNull();
    }

    [Fact]
    public void Map_ToleratesAConfigurationObjectOfTheWrongType()
    {
        var model = KanbanConfigurationMapper.Map(Key, "Task board", Constants.BoardEditorAlias, "not a configuration");

        model.Should().NotBeNull();
        model!.AppliesTo.Should().BeEmpty();
        model.Kind.Should().Be(KanbanConfigurationKind.Board);
    }
}
