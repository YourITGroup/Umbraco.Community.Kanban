using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.PropertyEditors;

namespace Umbraco.Community.Kanban.Tests.PropertyEditors;

public class KanbanBoardPropertyEditorTests
{
    [Fact]
    public void Configuration_DeclaresEveryFieldTheClientEdits()
    {
        var aliases = typeof(KanbanBoardConfiguration)
            .GetProperties()
            .SelectMany(p => p.GetCustomAttributes(typeof(ConfigurationFieldAttribute), false))
            .Cast<ConfigurationFieldAttribute>()
            .Select(a => a.Key)
            .ToArray();

        aliases.Should().BeEquivalentTo(
            "laneProperty",
            "laneSource",
            "manualLanes",
            "laneOverrides",
            "cardProperties",
            "lanePageSize",
            "allowDrag",
            "appliesTo",
            "tabName",
            "tabIcon");
    }

    [Fact]
    public void DataEditorAttribute_UsesTheDocumentedAlias()
    {
        var attribute = typeof(KanbanBoardPropertyEditor)
            .GetCustomAttributes(typeof(DataEditorAttribute), false)
            .Cast<DataEditorAttribute>()
            .Single();

        attribute.Alias.Should().Be(Constants.BoardEditorAlias);
    }
}
