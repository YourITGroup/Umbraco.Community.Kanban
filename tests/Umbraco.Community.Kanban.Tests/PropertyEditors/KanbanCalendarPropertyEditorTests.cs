using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.PropertyEditors;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.PropertyEditors;

public class KanbanCalendarPropertyEditorTests
{
    [Fact]
    public void Configuration_DeclaresEveryFieldTheClientEdits()
    {
        var aliases = typeof(KanbanCalendarConfiguration)
            .GetProperties()
            .SelectMany(p => p.GetCustomAttributes(typeof(ConfigurationFieldAttribute), false))
            .Cast<ConfigurationFieldAttribute>()
            .Select(a => a.Key)
            .ToArray();

        aliases.Should().BeEquivalentTo(
            "dateProperty",
            "endDateProperty",
            "categoryProperty",
            "categoryManualValues",
            "categoryOverrides",
            "cardProperties",
            "showAgenda",
            "categoryContentTypeKey",
            "appliesTo",
            "tabName",
            "tabIcon");
    }

    [Fact]
    public void Configuration_DefaultsToTheLastUpdatedDate()
    {
        var configuration = new KanbanCalendarConfiguration();

        configuration.DateProperty.Should().Be("updateDate");
        configuration.ShowAgenda.Should().BeTrue();
    }

    [Fact]
    public void DateProperty_ClearedInThePickerFallsBackToLastUpdated()
    {
        // The picker's Remove writes an empty string; a calendar always has something to place by.
        var configuration = new KanbanCalendarConfiguration { DateProperty = "" };

        configuration.DateProperty.Should().Be("updateDate");
    }

    [Fact]
    public void DataEditorAttribute_UsesTheDocumentedAlias()
    {
        var attribute = typeof(KanbanCalendarPropertyEditor)
            .GetCustomAttributes(typeof(DataEditorAttribute), false)
            .Cast<DataEditorAttribute>()
            .Single();

        attribute.Alias.Should().Be(Constants.CalendarEditorAlias);
    }

    [Fact]
    public void ValueEditor_IsReadOnly()
    {
        var valueEditor = new KanbanBoardPropertyEditor.KanbanReadOnlyValueEditor(
            new FakeShortStringHelper(),
            new FakeJsonSerializer(),
            new FakeIOHelper(),
            new DataEditorAttribute(Constants.CalendarEditorAlias));

        valueEditor.IsReadOnly.Should().BeTrue();
    }

    [Fact]
    public void PropertyEditor_SupportsReadOnly()
    {
        var editor = new KanbanCalendarPropertyEditor(new FakeDataValueEditorFactory(), new FakeIOHelper());

        editor.SupportsReadOnly.Should().BeTrue();
    }
}
