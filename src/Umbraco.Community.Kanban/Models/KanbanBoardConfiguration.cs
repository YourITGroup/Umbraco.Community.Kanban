using Umbraco.Cms.Core.PropertyEditors;

namespace Umbraco.Community.Kanban.Models;

/// <summary>
/// The configuration stored on a Kanban Board data type.
/// </summary>
public class KanbanBoardConfiguration
{
    [ConfigurationField("laneProperty")]
    public string? LaneProperty { get; set; }

    [ConfigurationField("laneSource")]
    public string? LaneSource { get; set; }

    [ConfigurationField("manualLanes")]
    public KanbanManualLane[] ManualLanes { get; set; } = [];

    [ConfigurationField("laneOverrides")]
    public KanbanLaneOverride[] LaneOverrides { get; set; } = [];

    [ConfigurationField("cardProperties")]
    public string[] CardProperties { get; set; } = [];

    [ConfigurationField("lanePageSize")]
    public int LanePageSize { get; set; } = 25;

    [ConfigurationField("allowDrag")]
    public bool AllowDrag { get; set; } = true;

    [ConfigurationField("appliesTo")]
    public Guid[] AppliesTo { get; set; } = [];

    [ConfigurationField("tabName")]
    public string? TabName { get; set; }

    [ConfigurationField("tabIcon")]
    public string? TabIcon { get; set; }
}
