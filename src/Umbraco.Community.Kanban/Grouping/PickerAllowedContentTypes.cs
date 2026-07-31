using System.Text.Json;
using System.Text.Json.Nodes;

namespace Umbraco.Community.Kanban.Grouping;

/// <summary>
/// Reads the content types a picker property is restricted to. Pure, so every configuration shape a
/// picker can persist is directly tested.
///
/// Two editors carry the restriction under different keys — the document picker as
/// <c>allowedContentTypes</c>, the multi-node tree picker as <c>filter</c> — but both are written by
/// the same document-type picker UI, so both hold a comma-separated list of document type GUIDs.
///
/// An empty list means "no restriction", which core reads as "every type is allowed". This returns
/// nothing in that case rather than treating the whole site as groups: an unrestricted picker is a
/// picker that was never configured for this, and offering thousands of documents as swimlanes would
/// be worse than offering none.
/// </summary>
public static class PickerAllowedContentTypes
{
    /// <summary>The configuration key each supported editor keeps its allowed types under.</summary>
    private static readonly Dictionary<string, string> KeysByEditorAlias = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Umbraco.ContentPicker"] = "allowedContentTypes",
        ["Umbraco.MultiNodeTreePicker"] = "filter",
    };

    /// <summary>
    /// A tree picker's object type. Absent means documents; media and member pickers restrict media
    /// and member types, which are not documents and so cannot be listed as content instances.
    /// </summary>
    private const string DocumentObjectType = "content";

    public static IReadOnlyList<Guid> Read(KanbanGroupSourceContext context)
    {
        if (KeysByEditorAlias.TryGetValue(context.EditorAlias, out var key) == false)
        {
            return [];
        }

        if (TargetsDocuments(context.ConfigurationData) == false)
        {
            return [];
        }

        if (context.ConfigurationData.TryGetValue(key, out var value) == false)
        {
            return [];
        }

        return ParseKeys(AsText(value));
    }

    private static bool TargetsDocuments(IDictionary<string, object> configuration)
    {
        if (configuration.TryGetValue("startNode", out var startNode) == false || startNode is null)
        {
            return true;
        }

        var objectType = ReadNested(startNode, "type");

        return string.IsNullOrWhiteSpace(objectType)
            || string.Equals(objectType, DocumentObjectType, StringComparison.OrdinalIgnoreCase);
    }

    private static IReadOnlyList<Guid> ParseKeys(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return [];
        }

        var keys = new List<Guid>();

        foreach (var part in text.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            // Non-GUID entries are skipped rather than failing the read, matching how core parses the
            // same key: one bad entry must not cost a board every lane it could otherwise show.
            if (Guid.TryParse(part, out Guid parsed) && keys.Contains(parsed) == false)
            {
                keys.Add(parsed);
            }
        }

        return keys;
    }

    /// <summary>
    /// A configuration value as text. The dictionary comes from a JSON deserialisation into
    /// <c>object</c>, so a scalar arrives boxed as a <see cref="JsonElement"/> or a
    /// <see cref="JsonNode"/> as often as it does a string — hence text rather than a cast.
    /// </summary>
    private static string? AsText(object? value) => value switch
    {
        null => null,
        string text => text,
        JsonElement element => element.ValueKind == JsonValueKind.String ? element.GetString() : element.ToString(),
        _ => value.ToString(),
    };

    /// <summary>One property of a nested configuration object, whatever shape it deserialised into.</summary>
    private static string? ReadNested(object value, string property) => value switch
    {
        JsonObject json => AsText(json[property]),
        JsonElement element when element.ValueKind == JsonValueKind.Object =>
            element.TryGetProperty(property, out JsonElement found) ? AsText(found) : null,
        IDictionary<string, object> dictionary =>
            dictionary.TryGetValue(property, out var found) ? AsText(found) : null,
        _ => null,
    };
}
