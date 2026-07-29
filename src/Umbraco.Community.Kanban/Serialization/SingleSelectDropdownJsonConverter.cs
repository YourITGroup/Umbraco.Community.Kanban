using System.Text.Json;
using System.Text.Json.Serialization;

namespace Umbraco.Community.Kanban.Serialization;

/// <summary>
/// Reads a single choice from the shapes <c>Umb.PropertyEditorUi.Dropdown</c> actually stores it in.
/// </summary>
/// <remarks>
/// A data type's <c>defaultData</c> writes a bare string, and that string is exactly what a data type
/// created from it stores until an editor touches the field. The dropdown's own single-select mode
/// then persists a one-element array instead — its change handler always wraps the chosen value,
/// `multiple` or not, so the very same setting is a string before anyone edits it and an array the
/// moment they do. Both are read here; only the first element of an array is kept, and an empty array
/// reads as null, the same as an absent field.
/// </remarks>
public sealed class SingleSelectDropdownJsonConverter : JsonConverter<string?>
{
    public override string? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
        {
            return null;
        }

        if (reader.TokenType == JsonTokenType.String)
        {
            return reader.GetString();
        }

        if (reader.TokenType == JsonTokenType.StartArray)
        {
            string? first = null;

            while (reader.Read() && reader.TokenType != JsonTokenType.EndArray)
            {
                first ??= reader.TokenType == JsonTokenType.String ? reader.GetString() : null;
            }

            return first;
        }

        throw new JsonException(
            $"Cannot convert token of type {reader.TokenType} to a single dropdown choice. Expected a string, an array of strings, or null.");
    }

    public override void Write(Utf8JsonWriter writer, string? value, JsonSerializerOptions options)
    {
        if (value is null)
        {
            writer.WriteNullValue();
        }
        else
        {
            writer.WriteStringValue(value);
        }
    }
}
