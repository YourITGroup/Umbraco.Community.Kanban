using System.Text.Json.Serialization;
using Umbraco.Cms.Core.PropertyEditors;

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

    [ConfigurationField("cardProperties")]
    public string[] CardProperties { get; set; } = [];

    [ConfigurationField("showAgenda")]
    public bool ShowAgenda { get; set; } = true;

    [ConfigurationField("allowDrag")]
    public bool AllowDrag { get; set; } = true;

    [ConfigurationField("appliesTo")]
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
