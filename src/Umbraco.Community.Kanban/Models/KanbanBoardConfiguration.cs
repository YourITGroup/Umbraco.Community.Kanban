using System.Text.Json.Serialization;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Serialization;

namespace Umbraco.Community.Kanban.Models;

/// <summary>
/// The configuration stored on a Kanban Board data type.
/// </summary>
public class KanbanBoardConfiguration
{
    [ConfigurationField("laneProperty")]
    public string? LaneProperty { get; set; }

    /// <summary>
    /// The content type the lane property was picked from. Stored so the configuration editor can
    /// show which property it named, and so lanes can be previewed there — the data type workspace
    /// has no document, and therefore no content type, of its own.
    /// </summary>
    /// <remarks>
    /// Not used when resolving a real board: that resolves against the content type of the document
    /// being viewed, which may legitimately differ from the one browsed at configuration time.
    /// </remarks>
    [ConfigurationField("laneContentTypeKey")]
    [JsonConverter(typeof(NullableGuidJsonConverter))]
    public Guid? LaneContentTypeKey { get; set; }

    /// <summary>
    /// Pins a lane source by alias, overriding detection from the lane property's editor. Not
    /// exposed in the configuration UI: <see cref="UseManualLanes" /> covers the only choice an
    /// editor needs, and this remains for third-party sources registered through
    /// <c>KanbanLaneSources()</c>.
    /// </summary>
    [ConfigurationField("laneSource")]
    public string? LaneSource { get; set; }

    /// <summary>
    /// Whether to use <see cref="ManualLanes" /> instead of the lanes detected from the lane
    /// property's own editor.
    /// </summary>
    [ConfigurationField("useManualLanes")]
    public bool UseManualLanes { get; set; }

    /// <summary>
    /// The lane source alias this configuration pins, if any. An explicit
    /// <see cref="LaneSource" /> wins over <see cref="UseManualLanes" /> so a board pinned to a
    /// third-party source is not quietly reinterpreted as a manual one.
    /// </summary>
    [JsonIgnore]
    public string? PinnedLaneSource =>
        string.IsNullOrWhiteSpace(LaneSource) == false
            ? LaneSource
            : UseManualLanes
                ? Constants.ManualLaneSourceAlias
                : null;

    [ConfigurationField("manualLanes")]
    public KanbanManualLane[] ManualLanes { get; set; } = [];

    /// <summary>
    /// Lane values in display order. Not exposed in the configuration UI as a setting of its own: it
    /// is written by dragging lanes in the lane appearance editor, not typed.
    /// </summary>
    /// <remarks>
    /// A lane whose value is absent keeps its source order and sorts after every listed lane, so a
    /// dropdown option added after the board was configured appears rather than being dropped. A
    /// listed value matching no lane is ignored.
    /// </remarks>
    [ConfigurationField("laneOrder")]
    public string[] LaneOrder { get; set; } = [];

    [ConfigurationField("laneOverrides")]
    public KanbanLaneOverride[] LaneOverrides { get; set; } = [];

    /// <summary>
    /// The properties shown as summary items on a card, in the order they appear.
    /// </summary>
    /// <remarks>
    /// Read through <see cref="KanbanCardPropertyArrayJsonConverter" />, which also accepts the bare
    /// array of aliases this was before headers and label templates existed.
    /// </remarks>
    [ConfigurationField("cardProperties")]
    [JsonConverter(typeof(KanbanCardPropertyArrayJsonConverter))]
    public KanbanCardProperty[] CardProperties { get; set; } = [];

    [ConfigurationField("lanePageSize")]
    public int LanePageSize { get; set; } = 25;

    [ConfigurationField("allowDrag")]
    public bool AllowDrag { get; set; } = true;

    [ConfigurationField("appliesTo")]
    [JsonConverter(typeof(GuidArrayJsonConverter))]
    public Guid[] AppliesTo { get; set; } = [];

    [ConfigurationField("tabName")]
    public string? TabName { get; set; }

    [ConfigurationField("tabIcon")]
    public string? TabIcon { get; set; }
}
