using System.Text.Json;
using System.Text.Json.Nodes;

namespace Umbraco.Community.Kanban.Contentment;

/// <summary>
/// Reads the data source out of a Contentment Data List data type's stored configuration, which holds
/// it as <c>dataSource: [ { key, value } ]</c> — the shape Contentment's own
/// <c>DataListValueConverter</c> reads.
/// </summary>
public static class ContentmentDataListConfiguration
{
    private const string DataSourceKey = "dataSource";
    private const string NoConfiguration = "{}";

    /// <summary>
    /// Never throws and never reports a partial result: a configuration this cannot read means no
    /// lanes, which is recoverable, where an exception out of <c>GET /board</c> is not.
    /// </summary>
    public static bool TryRead(
        IDictionary<string, object>? configurationData,
        out ContentmentDataSourceReference? reference)
    {
        reference = null;

        if (configurationData is null
            || configurationData.TryGetValue(DataSourceKey, out var value) == false
            || value is null)
        {
            return false;
        }

        JsonObject? entry = FirstEntry(ToNode(value));

        // ToString() on a JsonValue holding a string yields the string itself, which is what makes
        // this work for both a real JSON string node and anything else.
        var key = entry?["key"]?.ToString();

        if (string.IsNullOrWhiteSpace(key))
        {
            return false;
        }

        var valueJson = entry?["value"]?.ToString();

        reference = new ContentmentDataSourceReference(
            key,
            string.IsNullOrWhiteSpace(valueJson) ? NoConfiguration : valueJson);

        return true;
    }

    /// <summary>
    /// Contentment always stores an array, but a lone object is accepted too — it costs one line and
    /// means a hand-edited or migrated configuration still resolves.
    /// </summary>
    private static JsonObject? FirstEntry(JsonNode? node) => node switch
    {
        // Duplicate entries are not meaningful here, so the first wins, as it does everywhere else
        // in the lane pipeline.
        JsonArray array => array.Count > 0 ? array[0] as JsonObject : null,
        JsonObject entry => entry,
        _ => null,
    };

    /// <summary>
    /// Normalises whatever the configuration dictionary happens to hold into one node type, so the
    /// reading above has a single code path. Umbraco hands over <see cref="JsonNode" />s, but a
    /// configuration that has been through a JSON round trip arrives as <see cref="JsonElement" />s,
    /// and one assembled in code as plain lists and dictionaries.
    /// </summary>
    private static JsonNode? ToNode(object value)
    {
        try
        {
            return value switch
            {
                JsonNode node => node,
                JsonElement element => JsonNode.Parse(element.GetRawText()),
                string text => string.IsNullOrWhiteSpace(text) ? null : JsonNode.Parse(text),
                _ => JsonSerializer.SerializeToNode(value),
            };
        }
        catch (JsonException)
        {
            // A stored string that is not JSON is a configuration we cannot read, not a crash.
            return null;
        }
    }
}
