using System.Globalization;
using System.Text.Json;
using Umbraco.Cms.Core.Models;

namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// Reads the raw lane value off a child document. Pure, so the culture rules are directly
/// tested. Never returns null: the empty string is a meaningful value here — it means the
/// card belongs in the unassigned lane.
/// </summary>
public static class KanbanLaneValueReader
{
    public static string Read(IContent content, string? laneProperty, string? culture)
    {
        if (string.IsNullOrWhiteSpace(laneProperty)
            || content.Properties.TryGetValue(laneProperty, out IProperty? property) == false)
        {
            return string.Empty;
        }

        // A culture applies only where both the document and the property vary by it.
        var propertyCulture =
            content.ContentType.Variations.HasFlag(ContentVariation.Culture)
            && property.PropertyType.Variations.HasFlag(ContentVariation.Culture)
                ? culture
                : null;

        var value = content.GetValue(laneProperty, propertyCulture);

        var text = value switch
        {
            null => string.Empty,
            string s => s,
            IConvertible convertible => convertible.ToString(CultureInfo.InvariantCulture),
            _ => value.ToString() ?? string.Empty,
        };

        return UnwrapJsonArray(text);
    }

    /// <summary>
    /// <c>Umbraco.DropDown.Flexible</c> and <c>Umbraco.CheckBoxList</c> both save through
    /// <c>MultipleValueEditor</c>, which serialises the selection as a JSON array string
    /// (<c>["doing"]</c>) even for a single-select dropdown. <c>Umbraco.RadioButtonList</c> saves a
    /// bare string. Lanes are keyed on the bare option value, so unwrap the array here.
    /// </summary>
    private static string UnwrapJsonArray(string text)
    {
        if (text.Length == 0 || text.AsSpan().TrimStart().StartsWith("[") == false)
        {
            return text;
        }

        try
        {
            using JsonDocument document = JsonDocument.Parse(text);

            if (document.RootElement.ValueKind != JsonValueKind.Array)
            {
                return text;
            }

            // A card can only live in one lane, so a multi-select (CheckBoxList) collapses to its first selected value.
            foreach (JsonElement element in document.RootElement.EnumerateArray())
            {
                var candidate = element.ValueKind switch
                {
                    JsonValueKind.String => element.GetString(),
                    JsonValueKind.Null or JsonValueKind.Undefined => null,
                    _ => element.GetRawText(),
                };

                if (string.IsNullOrWhiteSpace(candidate) == false)
                {
                    return candidate;
                }
            }

            // An empty (or all-empty) array means nothing is selected: the card is unassigned.
            return string.Empty;
        }
        catch (JsonException)
        {
            return text;
        }
    }
}
