namespace Umbraco.Community.Kanban.Tests;

public class ConstantsTests
{
    [Fact]
    public void EditorAliases_AreTheDocumentedValues()
    {
        Constants.BoardEditorAlias.Should().Be("Umbraco.Community.Kanban.Board");
        Constants.CalendarEditorAlias.Should().Be("Umbraco.Community.Kanban.Calendar");
    }

    [Fact]
    public void ManagementApiPath_IsUnderTheKanbanPrefix()
    {
        Constants.ManagementApiPath.Should().Be("/kanban/api");
        Constants.ApiName.Should().Be("kanban");
    }
}
