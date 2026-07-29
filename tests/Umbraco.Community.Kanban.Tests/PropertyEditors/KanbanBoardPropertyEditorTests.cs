using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.PropertyEditors;
using Umbraco.Community.Kanban.Tests.Fakes;

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
            "laneContentTypeKey",
            "laneSource",
            "useManualLanes",
            "manualLanes",
            "laneOrder",
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

    [Fact]
    public void ValueEditor_IsReadOnly()
    {
        var valueEditor = new KanbanBoardPropertyEditor.KanbanReadOnlyValueEditor(
            new FakeShortStringHelper(),
            new FakeJsonSerializer(),
            new FakeIOHelper(),
            new DataEditorAttribute(Constants.BoardEditorAlias));

        valueEditor.IsReadOnly.Should().BeTrue();
    }

    [Fact]
    public void PropertyEditor_SupportsReadOnly()
    {
        var editor = new KanbanBoardPropertyEditor(new FakeDataValueEditorFactory(), new FakeIOHelper());

        editor.SupportsReadOnly.Should().BeTrue();
    }
}
