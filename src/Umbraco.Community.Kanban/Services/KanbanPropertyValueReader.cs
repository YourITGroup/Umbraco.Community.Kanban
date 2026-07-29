using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.PropertyEditors;

namespace Umbraco.Community.Kanban.Services;

/// <inheritdoc />
public sealed class KanbanPropertyValueReader(
    PropertyEditorCollection propertyEditors,
    ILogger<KanbanPropertyValueReader> logger) : IKanbanPropertyValueReader
{
    public object? ReadEditorValue(IProperty property, string? culture)
    {
        var stored = property.GetValue(culture);

        if (propertyEditors.TryGet(property.PropertyType.PropertyEditorAlias, out IDataEditor? editor) == false)
        {
            // An editor whose package has been removed since the property was created. The stored
            // value is the best available answer, and the client's fallback renders it as text.
            return stored;
        }

        try
        {
            // The supported stored-to-editor conversion, and the reason this class exists: for an
            // editor declaring ValueTypes.Json it parses the stored string into a real object, which
            // is the shape the backoffice's value summary renderers expect.
            return editor.GetValueEditor().ToEditor(property, culture);
        }
        catch (Exception exception)
        {
            // ToEditor runs third-party code for a third-party editor. A card property that falls back
            // to its stored value is recoverable; an exception out of GET /board is not.
            logger.LogWarning(
                exception,
                "Could not read the editor value of {PropertyAlias} ({EditorAlias}); using the stored value.",
                property.PropertyType.Alias,
                property.PropertyType.PropertyEditorAlias);

            return stored;
        }
    }
}
