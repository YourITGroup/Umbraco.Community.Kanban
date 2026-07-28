using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Lanes.Sources;

/// <summary>
/// Lanes typed by hand into the board configuration. Works against any property,
/// including plain text, at the cost of drifting if the underlying options change.
/// </summary>
public sealed class ManualLaneSource : IKanbanLaneSource
{
    public const string SourceAlias = Constants.ManualLaneSourceAlias;

    public string Alias => SourceAlias;

    /// <summary>
    /// This source deliberately claims any context whose configuration pins it — through the
    /// "Define lanes manually" toggle or an explicit <c>LaneSource</c> — even when another source
    /// (e.g. a core list editor source) could also handle the same context by editor alias. That
    /// overlap is by design: Task 10's resolver arbitrates between candidate sources by preferring
    /// the one pinned by <see cref="KanbanBoardConfiguration.PinnedLaneSource"/>.
    /// </summary>
    public bool CanHandle(KanbanLaneSourceContext context) =>
        string.Equals(context.Configuration.PinnedLaneSource, SourceAlias, StringComparison.OrdinalIgnoreCase);

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
