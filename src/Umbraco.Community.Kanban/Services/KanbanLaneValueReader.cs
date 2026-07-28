using System.Globalization;
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

        return value switch
        {
            null => string.Empty,
            string text => text,
            IConvertible convertible => convertible.ToString(CultureInfo.InvariantCulture),
            _ => value.ToString() ?? string.Empty,
        };
    }
}
