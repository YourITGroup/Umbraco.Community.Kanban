using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Umbraco.Cms.Core.Models;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// A card's calendar placement: the date, the time when one is meaningfully stored, and — only for a
/// value that states its own zone — the moment it names.
/// </summary>
/// <param name="Date">The stored wall-clock date.</param>
/// <param name="Time">The stored wall-clock time, or null when the value is date-only.</param>
/// <param name="Instant">
/// The unambiguous moment, present only when the stored value carries an offset. The client converts
/// it into the viewer's zone; <see cref="Date"/> and <see cref="Time"/> stay as stored so a client
/// that ignores this field places the item exactly as before.
/// </param>
public readonly record struct KanbanCardDate(DateOnly Date, TimeOnly? Time, DateTimeOffset? Instant = null);

/// <summary>
/// Reads a calendar date (+ optional time) off a child document. Pure and static like
/// <see cref="KanbanLaneValueReader"/>, so every editor family's parse rule is directly tested.
///
/// Wall-clock values are read AS STORED: the unspecified, date-only and legacy editors persist a
/// bare local time, and shifting it would invent an offset the editor never recorded.
///
/// A value that DOES state its zone additionally carries its <see cref="KanbanCardDate.Instant"/>,
/// because the viewer's zone is the browser's to know, not the server's. The client converts that
/// moment the same way a board card's value summary already does
/// (<c>DateTime.fromISO(date, { zone }).toLocal()</c>), so one card cannot read one time in its
/// property row and sit at another on the grid.
///
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
            return FromStoredDateTime(content.UpdateDate);
        }

        if (string.Equals(propertyAlias, "createDate", StringComparison.OrdinalIgnoreCase))
        {
            return FromStoredDateTime(content.CreateDate);
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
            DateTime dateTime => FromStoredDateTime(dateTime),
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
                if (dto is null || dto.Date == default)
                {
                    return null;
                }

                // A named zone is what separates Umbraco.DateTimeWithTimeZone from the editors that
                // store a bare wall clock and always persist timeZone: null.
                return string.IsNullOrWhiteSpace(dto.TimeZone)
                    ? FromDateTime(dto.Date.DateTime)
                    : FromMoment(dto.Date);
            }
            catch (JsonException)
            {
                return null;
            }
        }

        // DateTimeStyles.None keeps any offset in the text from converting the wall-clock value.
        if (DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTimeOffset parsed) == false)
        {
            return null;
        }

        // RoundtripKind reports Unspecified for text with no offset and Utc/Local when one is
        // written — the only dependable "did this value name its zone?" signal for migrated data.
        var statesZone =
            DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out DateTime probe)
            && probe.Kind != DateTimeKind.Unspecified;

        return statesZone ? FromMoment(parsed) : FromDateTime(parsed.DateTime);
    }

    /// <summary>
    /// A stored <see cref="DateTime"/>. Only a UTC kind names its own zone — the deprecated date
    /// editors and a content item's own create/update dates are otherwise wall clocks.
    /// </summary>
    private static KanbanCardDate FromStoredDateTime(DateTime value) => value.Kind == DateTimeKind.Utc
        ? FromMoment(new DateTimeOffset(value))
        : FromDateTime(value);

    /// <summary>
    /// A zone-bearing value: the wall clock is still reported as stored, so a client that ignores
    /// the instant behaves exactly as before, and the instant rides along for one that converts it.
    /// </summary>
    private static KanbanCardDate FromMoment(DateTimeOffset moment) => FromDateTime(moment.DateTime) with
    {
        Instant = moment,
    };

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
