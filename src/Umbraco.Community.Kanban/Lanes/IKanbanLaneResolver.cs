using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Lanes;

/// <summary>The outcome of resolving a board's lanes.</summary>
/// <param name="Lanes">The lanes in display order, always ending with the unassigned lane.</param>
/// <param name="UnmatchedOverrides">Overrides pointing at lane values that no longer resolve.</param>
public sealed record KanbanLaneResolution(
    IReadOnlyList<KanbanLane> Lanes,
    IReadOnlyList<KanbanLaneOverride> UnmatchedOverrides);

public interface IKanbanLaneResolver
{
    Task<KanbanLaneResolution> ResolveAsync(Guid contentTypeKey, KanbanBoardConfiguration configuration);
}
