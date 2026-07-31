using System.Text.Json.Serialization;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Serialization;

namespace Umbraco.Community.Kanban.Models;

/// <summary>
/// The configuration stored on a Kanban Calendar data type.
/// </summary>
public class KanbanCalendarConfiguration
{
    /// <summary>The system property meaning "last updated", which cannot be written to.</summary>
    public const string UpdateDateAlias = "updateDate";

    [ConfigurationField("dateProperty")]
    public string DateProperty { get; set; } = UpdateDateAlias;

    /// <summary>
    /// Optional end-date property giving cards a span. Absent or invalid values fall back to a
    /// nominal one-hour block. Never a system property — an "updateDate end" is meaningless.
    /// </summary>
    [ConfigurationField("endDateProperty")]
    public string? EndDateProperty { get; set; }

    /// <summary>Optional property whose values categorise cards (colour/icon accents).</summary>
    [ConfigurationField("categoryProperty")]
    public string? CategoryProperty { get; set; }

    /// <summary>Manual category values, used when the category property's editor has no source.</summary>
    [ConfigurationField("categoryManualValues")]
    public KanbanManualLane[] CategoryManualValues { get; set; } = [];

    /// <summary>Per-category appearance overrides, same precedence rules as lanes.</summary>
    [ConfigurationField("categoryOverrides")]
    public KanbanLaneOverride[] CategoryOverrides { get; set; } = [];

    [ConfigurationField("cardProperties")]
    public string[] CardProperties { get; set; } = [];

    [ConfigurationField("showAgenda")]
    public bool ShowAgenda { get; set; } = true;

    /// <summary>Ignored: the calendar is read-only. Kept so stored configurations keep binding.</summary>
    [ConfigurationField("allowDrag")]
    public bool AllowDrag { get; set; } = true;

    [ConfigurationField("appliesTo")]
    [JsonConverter(typeof(GuidArrayJsonConverter))]
    public Guid[] AppliesTo { get; set; } = [];

    [ConfigurationField("tabName")]
    public string? TabName { get; set; }

    [ConfigurationField("tabIcon")]
    public string? TabIcon { get; set; }

    /// <summary>
    /// False when the date source is the last-updated timestamp, which is maintained by
    /// Umbraco and cannot be set, so the calendar has to be read-only.
    /// </summary>
    [JsonIgnore]
    public bool IsDragSupported =>
        AllowDrag && string.Equals(DateProperty, UpdateDateAlias, StringComparison.OrdinalIgnoreCase) == false;
}
