using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Lanes;

/// <summary>
/// Turns a lane property's data type configuration into swimlanes.
/// Implement this to support a property editor the package does not know about.
/// </summary>
public interface IKanbanLaneSource
{
    /// <summary>A stable alias, used when a configuration pins a specific source.</summary>
    string Alias { get; }

    bool CanHandle(KanbanLaneSourceContext context);

    Task<IReadOnlyList<KanbanLane>> GetLanesAsync(KanbanLaneSourceContext context);
}
