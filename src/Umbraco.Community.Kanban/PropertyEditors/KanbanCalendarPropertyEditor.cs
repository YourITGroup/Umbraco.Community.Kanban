using Umbraco.Cms.Core.IO;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.PropertyEditors;

namespace Umbraco.Community.Kanban.PropertyEditors;

/// <summary>
/// A Kanban Calendar configuration. Each data type using this editor is one named calendar
/// configuration. The value editor is read-only, as with the board editor.
/// </summary>
[DataEditor(Constants.CalendarEditorAlias, ValueEditorIsReusable = true)]
public class KanbanCalendarPropertyEditor : DataEditor
{
    private readonly IIOHelper ioHelper;

    public KanbanCalendarPropertyEditor(IDataValueEditorFactory dataValueEditorFactory, IIOHelper ioHelper)
        : base(dataValueEditorFactory)
    {
        this.ioHelper = ioHelper;
        SupportsReadOnly = true;
    }

    protected override IDataValueEditor CreateValueEditor() =>
        DataValueEditorFactory.Create<KanbanBoardPropertyEditor.KanbanReadOnlyValueEditor>(Attribute!);

    protected override IConfigurationEditor CreateConfigurationEditor() =>
        new KanbanCalendarConfigurationEditor(ioHelper);
}
