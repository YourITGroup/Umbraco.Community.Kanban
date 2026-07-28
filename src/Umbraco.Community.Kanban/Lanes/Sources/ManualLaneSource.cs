using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Lanes.Sources;

/// <summary>
/// Lanes typed by hand into the board configuration. Works against any property,
/// including plain text, at the cost of drifting if the underlying options change.
/// </summary>
public sealed class ManualLaneSource : IKanbanLaneSource
{
    public const string SourceAlias = "manual";

    public string Alias => SourceAlias;

    public bool CanHandle(KanbanLaneSourceContext context) =>
        string.Equals(context.Configuration.LaneSource, SourceAlias, StringComparison.OrdinalIgnoreCase);

    public Task<IReadOnlyList<KanbanLane>> GetLanesAsync(KanbanLaneSourceContext context)
    {
        IReadOnlyList<KanbanLane> lanes = context.Configuration.ManualLanes
            .Where(lane => string.IsNullOrWhiteSpace(lane.Value) == false)
            .Select(lane => new KanbanLane
            {
                Value = lane.Value,
                Name = string.IsNullOrWhiteSpace(lane.Label) ? lane.Value : lane.Label,
                Colour = lane.Colour,
                Icon = lane.Icon,
            })
            .ToList();

        return Task.FromResult(lanes);
    }
}
