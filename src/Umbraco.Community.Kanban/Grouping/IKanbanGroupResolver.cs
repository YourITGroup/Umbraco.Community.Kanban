using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Grouping;

/// <summary>The outcome of resolving a board's lanes.</summary>
/// <param name="Lanes">The lanes in display order, always ending with the unassigned lane.</param>
/// <param name="UnmatchedOverrides">Overrides pointing at lane values that no longer resolve.</param>
public sealed record KanbanGroupResolution(
    IReadOnlyList<KanbanGroup> Groups,
    IReadOnlyList<KanbanGroupOverride> UnmatchedOverrides);

public interface IKanbanGroupResolver
{
    Task<KanbanGroupResolution> ResolveAsync(Guid contentTypeKey, KanbanBoardConfiguration configuration);
}
