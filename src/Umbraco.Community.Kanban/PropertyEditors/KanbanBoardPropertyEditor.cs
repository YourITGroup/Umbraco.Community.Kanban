using Umbraco.Cms.Core.IO;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.Serialization;
using Umbraco.Cms.Core.Strings;

namespace Umbraco.Community.Kanban.PropertyEditors;

/// <summary>
/// A Kanban Board configuration. Each data type using this editor is one named board configuration.
/// The value editor is read-only, so placing a board on a document tab never marks the document dirty.
/// </summary>
[DataEditor(Constants.BoardEditorAlias, ValueEditorIsReusable = true)]
public class KanbanBoardPropertyEditor : DataEditor
{
    private readonly IIOHelper ioHelper;

    public KanbanBoardPropertyEditor(IDataValueEditorFactory dataValueEditorFactory, IIOHelper ioHelper)
        : base(dataValueEditorFactory)
    {
        this.ioHelper = ioHelper;
        SupportsReadOnly = true;
    }

    protected override IDataValueEditor CreateValueEditor() =>
        DataValueEditorFactory.Create<KanbanReadOnlyValueEditor>(Attribute!);

    protected override IConfigurationEditor CreateConfigurationEditor() =>
        new KanbanBoardConfigurationEditor(ioHelper);

    /// <summary>
    /// A value editor that never persists anything. Mirrors core's label editor.
    /// </summary>
    internal sealed class KanbanReadOnlyValueEditor(
        IShortStringHelper shortStringHelper,
        IJsonSerializer jsonSerializer,
        IIOHelper ioHelper,
        DataEditorAttribute attribute)
        : DataValueEditor(shortStringHelper, jsonSerializer, ioHelper, attribute)
    {
        public override bool IsReadOnly => true;
    }
}
