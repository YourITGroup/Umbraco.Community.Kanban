using System.Text.Json;

namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// Reads extra values out of a data type's configuration dictionary. Umbraco keeps unknown
/// aliases on save but gives no typed access to them, and the CLR type depends on how the
/// value arrived: System.Text.Json deserialises into JsonElement, while a value set in the
/// same process may still be a string or a Guid. Pure, so every shape is directly tested.
/// </summary>
public static class KanbanConfigurationValueReader
{
    public static Guid? ReadGuid(IDictionary<string, object> configurationData, string key)
    {
        if (configurationData.TryGetValue(key, out var raw) == false || raw is null)
        {
            return null;
        }

        Guid? parsed = raw switch
        {
            Guid guid => guid,
            string text when Guid.TryParse(text, out Guid fromText) => fromText,
            JsonElement { ValueKind: JsonValueKind.String } element when element.TryGetGuid(out Guid fromJson) => fromJson,
            _ => null,
        };

        // Guid.Empty names no data type, so treat it as absent rather than as a broken reference.
        return parsed == Guid.Empty ? null : parsed;
    }
}
