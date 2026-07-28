using System.Text.Json;
using System.Text.Json.Serialization;

namespace Umbraco.Community.Kanban.Serialization;

/// <summary>
/// Reads a <see cref="Guid" /> array from either its canonical JSON array shape or the
/// comma-separated string shape produced by <c>Umb.PropertyEditorUi.DocumentTypePicker</c>
/// (whose underlying <c>umb-input-document-type</c> element stores its value as a single
/// comma-separated string of keys, not a JSON array).
/// </summary>
/// <remarks>
/// Write always emits a JSON array — the leniency is only needed on read, since that is the
/// only direction affected by the picker's storage shape.
/// </remarks>
public sealed class GuidArrayJsonConverter : JsonConverter<Guid[]>
{
    public override Guid[] Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
        {
            return [];
        }

        if (reader.TokenType == JsonTokenType.String)
        {
            var raw = reader.GetString();

            return string.IsNullOrWhiteSpace(raw)
                ? []
                : raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Select(Guid.Parse)
                    .ToArray();
        }

        if (reader.TokenType == JsonTokenType.StartArray)
        {
            var values = new List<Guid>();

            while (reader.Read() && reader.TokenType != JsonTokenType.EndArray)
            {
                if (reader.TokenType == JsonTokenType.String)
                {
                    var item = reader.GetString();
                    if (string.IsNullOrWhiteSpace(item) == false)
                    {
                        values.Add(Guid.Parse(item));
                    }
                }
                else if (reader.TokenType == JsonTokenType.StartArray || reader.TokenType == JsonTokenType.StartObject)
                {
                    // Defensive: skip anything unexpected rather than throwing on odd payloads.
                    reader.Skip();
                }
            }

            return values.ToArray();
        }

        throw new JsonException(
            $"Cannot convert token of type {reader.TokenType} to a Guid[]. Expected a JSON array or a comma-separated string.");
    }

    public override void Write(Utf8JsonWriter writer, Guid[] value, JsonSerializerOptions options)
    {
        writer.WriteStartArray();

        foreach (var guid in value)
        {
            writer.WriteStringValue(guid);
        }

        writer.WriteEndArray();
    }
}
