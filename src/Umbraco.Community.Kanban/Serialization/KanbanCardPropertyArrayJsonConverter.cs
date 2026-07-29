using System.Text.Json;
using System.Text.Json.Serialization;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Serialization;

/// <summary>
/// Reads card properties written in either shape.
/// </summary>
/// <remarks>
/// Before card properties gained headers and label templates they were stored as a bare array of
/// aliases — <c>["status","company"]</c> — and every board configured then still stores that. A string
/// entry reads as a row with only its alias set; an object entry reads as itself.
///
/// The old shape is read, never written: a board converts on the next save of its data type, and keeps
/// working until then. Nothing throws — an unreadable entry is skipped, because a card missing one
/// summary item is recoverable where a failed configuration deserialisation takes the whole board down.
/// </remarks>
public sealed class KanbanCardPropertyArrayJsonConverter : JsonConverter<KanbanCardProperty[]>
{
    /// <summary>
    /// Without this, System.Text.Json handles a stored <c>null</c> itself and assigns null rather than
    /// calling this converter — leaving the configuration with a null array that every consumer would
    /// have to guard. An absent value must read as no card properties, not as nothing at all.
    /// </summary>
    public override bool HandleNull => true;

    public override KanbanCardProperty[] Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
        {
            return [];
        }

        if (reader.TokenType == JsonTokenType.String)
        {
            // A whole array stored as a JSON string, which is how some configuration round trips arrive.
            var json = reader.GetString();

            if (string.IsNullOrWhiteSpace(json))
            {
                return [];
            }

            try
            {
                // A fresh reader rather than JsonSerializer.Deserialize with these options: the options
                // carry this converter, so going back through the serialiser would re-enter here and
                // recurse until the stack ran out.
                var nested = new Utf8JsonReader(System.Text.Encoding.UTF8.GetBytes(json));

                return nested.Read() ? Read(ref nested, typeToConvert, options) : [];
            }
            catch (JsonException)
            {
                return [];
            }
        }

        if (reader.TokenType != JsonTokenType.StartArray)
        {
            // Skipped rather than simply ignored: a converter that returns while the reader still sits
            // inside a value it did not consume makes System.Text.Json throw.
            reader.Skip();
            return [];
        }

        var properties = new List<KanbanCardProperty>();

        while (reader.Read() && reader.TokenType != JsonTokenType.EndArray)
        {
            var property = ReadEntry(ref reader, options);

            if (property is not null)
            {
                properties.Add(property);
            }
        }

        return properties.ToArray();
    }

    private static KanbanCardProperty? ReadEntry(ref Utf8JsonReader reader, JsonSerializerOptions options)
    {
        switch (reader.TokenType)
        {
            // The old shape: an alias on its own.
            case JsonTokenType.String:
                var alias = reader.GetString();

                return string.IsNullOrWhiteSpace(alias)
                    ? null
                    : new KanbanCardProperty { Alias = alias };

            case JsonTokenType.StartObject:
                try
                {
                    var property = JsonSerializer.Deserialize<KanbanCardProperty>(ref reader, options);

                    return string.IsNullOrWhiteSpace(property?.Alias) ? null : property;
                }
                catch (JsonException)
                {
                    return null;
                }

            default:
                // A number, a bool, a nested array: nothing that can name a property. Skipping it keeps
                // the rest of the list, where throwing would lose every card property on the board.
                reader.Skip();
                return null;
        }
    }

    /// <summary>
    /// Writes the current shape only — the old array of aliases is read, never written.
    /// </summary>
    /// <remarks>
    /// The array is written element by element rather than handed back to the serialiser: these options
    /// carry this converter, and serialising the array through them would re-enter here and recurse.
    /// An element is a different type, so it serialises normally.
    /// </remarks>
    public override void Write(Utf8JsonWriter writer, KanbanCardProperty[] value, JsonSerializerOptions options)
    {
        writer.WriteStartArray();

        foreach (var property in value)
        {
            JsonSerializer.Serialize(writer, property, options);
        }

        writer.WriteEndArray();
    }
}
