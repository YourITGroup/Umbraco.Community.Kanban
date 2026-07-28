using System.Text.Json;
using System.Text.Json.Serialization;

namespace Umbraco.Community.Kanban.Serialization;

/// <summary>
/// Reads a nullable <see cref="Guid" /> from the shapes a backoffice picker actually stores:
/// a key string, or an empty string once the editor clears the picker.
/// </summary>
/// <remarks>
/// Without the empty-string case, clearing a picker would leave a value that throws on read and
/// takes the whole configuration down with it, not just the one field.
/// </remarks>
public sealed class NullableGuidJsonConverter : JsonConverter<Guid?>
{
    public override Guid? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
        {
            return null;
        }

        if (reader.TokenType == JsonTokenType.String)
        {
            var raw = reader.GetString();

            // A picker that has been emptied stores "", and a malformed key is no more usable than
            // no key at all — both mean "not configured" rather than "invalid configuration".
            return Guid.TryParse(raw, out var guid) ? guid : null;
        }

        throw new JsonException(
            $"Cannot convert token of type {reader.TokenType} to a Guid?. Expected a string or null.");
    }

    public override void Write(Utf8JsonWriter writer, Guid? value, JsonSerializerOptions options)
    {
        if (value.HasValue)
        {
            writer.WriteStringValue(value.Value);
        }
        else
        {
            writer.WriteNullValue();
        }
    }
}
