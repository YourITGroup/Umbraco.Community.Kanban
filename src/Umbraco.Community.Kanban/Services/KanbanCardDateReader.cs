using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Umbraco.Cms.Core.Models;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Services;

/// <summary>A card's calendar placement: the date, and the time when one is meaningfully stored.</summary>
public readonly record struct KanbanCardDate(DateOnly Date, TimeOnly? Time);

/// <summary>
/// Reads a calendar date (+ optional time) off a child document. Pure and static like
/// <see cref="KanbanLaneValueReader"/>, so every editor family's parse rule is directly tested.
///
/// Values are read AS STORED — the offset in a with-timezone value is ignored, so a
/// 09:00+10:00 booking is 09:00 on that date for every viewer, matching what the editor shows.
/// The parse branches mirror core's internal <c>DateTimePropertyEditorHelper</c>: a
/// <see cref="DateTime"/> object is the deprecated <c>Umbraco.DateTime</c>'s storage, a JSON
/// <c>{date, timeZone}</c> string is the four modern editors'. A plain datetime string is accepted
/// defensively for migrated data. A stored time of exactly midnight reads as date-only, so legacy
/// date pickers land in the all-day strip rather than at 00:00.
/// </summary>
public static class KanbanCardDateReader
{
    public static KanbanCardDate? Read(IContent content, string propertyAlias, string? culture)
    {
        if (string.Equals(propertyAlias, KanbanCalendarConfiguration.UpdateDateAlias, StringComparison.OrdinalIgnoreCase))
        {
            return FromDateTime(content.UpdateDate);
        }

        if (string.Equals(propertyAlias, "createDate", StringComparison.OrdinalIgnoreCase))
        {
            return FromDateTime(content.CreateDate);
        }

        if (string.IsNullOrWhiteSpace(propertyAlias)
            || content.Properties.TryGetValue(propertyAlias, out IProperty? property) == false)
        {
            return null;
        }

        // A culture applies only where both the document and the property vary by it — the same
        // rule KanbanLaneValueReader documents.
        var propertyCulture =
            content.ContentType.Variations.HasFlag(ContentVariation.Culture)
            && property.PropertyType.Variations.HasFlag(ContentVariation.Culture)
                ? culture
                : null;

        return content.GetValue(propertyAlias, propertyCulture) switch
        {
            DateTime dateTime => FromDateTime(dateTime),
            string text => FromString(text),
            _ => null,
        };
    }

    private static KanbanCardDate? FromString(string text)
    {
        if (text.AsSpan().TrimStart().StartsWith("{"))
        {
            try
            {
                DateTimeDto? dto = JsonSerializer.Deserialize<DateTimeDto>(text);

                // "date" missing deserialises to default; treat the epoch default as no value.
                return dto is null || dto.Date == default ? null : FromDateTime(dto.Date.DateTime);
            }
            catch (JsonException)
            {
                return null;
            }
        }

        // DateTimeStyles.None keeps any offset in the text from converting the wall-clock value.
        return DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTimeOffset parsed)
            ? FromDateTime(parsed.DateTime)
            : null;
    }

    private static KanbanCardDate FromDateTime(DateTime value)
    {
        var time = TimeOnly.FromDateTime(value);
        return new KanbanCardDate(DateOnly.FromDateTime(value), time == TimeOnly.MinValue ? null : time);
    }

    /// <summary>The JSON the modern date editors persist. Mirrors core's <c>DateTimeDto</c>.</summary>
    private sealed class DateTimeDto
    {
        [JsonPropertyName("date")]
        public DateTimeOffset Date { get; init; }

        [JsonPropertyName("timeZone")]
        public string? TimeZone { get; init; }
    }
}
