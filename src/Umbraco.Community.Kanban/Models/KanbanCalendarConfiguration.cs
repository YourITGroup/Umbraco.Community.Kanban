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

    /// <summary>
    /// Unset — absent or cleared in the picker — means last-updated: a calendar always has
    /// *something* to place cards by.
    /// </summary>
    [ConfigurationField("dateProperty")]
    public string DateProperty
    {
        get => string.IsNullOrWhiteSpace(dateProperty) ? UpdateDateAlias : dateProperty;
        set => dateProperty = value;
    }

    private string dateProperty = UpdateDateAlias;

    /// <summary>
    /// Optional end-date property giving cards a span. Absent or invalid values fall back to a
    /// nominal one-hour block. Never a system property — an "updateDate end" is meaningless.
    /// </summary>
    [ConfigurationField("endDateProperty")]
    public string? EndDateProperty { get; set; }

    /// <summary>Optional property whose values categorise cards (colour/icon accents).</summary>
    [ConfigurationField("categoryProperty")]
    public string? CategoryProperty { get; set; }

    /// <summary>
    /// The content type the category property was picked from — configuration-time data, written by
    /// the picker so the category appearance editor can preview real values, exactly as the board's
    /// <c>laneContentTypeKey</c> works. Not used when resolving a real calendar: that resolves
    /// against the parent's own content type.
    /// </summary>
    [ConfigurationField("categoryContentTypeKey")]
    [JsonConverter(typeof(NullableGuidJsonConverter))]
    public Guid? CategoryContentTypeKey { get; set; }

    /// <summary>Manual category values, used when the category property's editor has no source.</summary>
    [ConfigurationField("categoryManualValues")]
    public KanbanManualGroup[] CategoryManualValues { get; set; } = [];

    /// <summary>Per-category appearance overrides, same precedence rules as lanes.</summary>
    [ConfigurationField("categoryOverrides")]
    public KanbanGroupOverride[] CategoryOverrides { get; set; } = [];

    /// <summary>
    /// The properties shown as summary items on a card. The converter also accepts the bare alias
    /// array this was before the calendar shared the board's card-properties editor.
    /// </summary>
    [ConfigurationField("cardProperties")]
    [JsonConverter(typeof(KanbanCardPropertyArrayJsonConverter))]
    public KanbanCardProperty[] CardProperties { get; set; } = [];

    [ConfigurationField("showAgenda")]
    public bool ShowAgenda { get; set; } = true;

    [ConfigurationField("appliesTo")]
    [JsonConverter(typeof(GuidArrayJsonConverter))]
    public Guid[] AppliesTo { get; set; } = [];

    [ConfigurationField("tabName")]
    public string? TabName { get; set; }

    [ConfigurationField("tabIcon")]
    public string? TabIcon { get; set; }
}
