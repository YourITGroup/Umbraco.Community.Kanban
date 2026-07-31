using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Grouping;

/// <summary>The outcome of resolving a board's lanes.</summary>
/// <param name="Groups">The lanes in display order, always led by the unassigned lane.</param>
/// <param name="UnmatchedOverrides">Overrides pointing at lane values that no longer resolve.</param>
/// <param name="LanePropertyIsMandatory">
/// True when the lane property is required on the content type. The unassigned lane is still resolved
/// either way — the board composer needs it as the bucket for values matching no lane — but it tells the
/// composer that an unassigned card is an anomaly rather than the normal state of a new card.
/// False whenever there is no usable lane property to ask about, since then nothing rules the lane out.
/// </param>
public sealed record KanbanGroupResolution(
    IReadOnlyList<KanbanGroup> Groups,
    IReadOnlyList<KanbanGroupOverride> UnmatchedOverrides,
    bool LanePropertyIsMandatory = false);

public interface IKanbanGroupResolver
{
    Task<KanbanGroupResolution> ResolveAsync(Guid contentTypeKey, KanbanBoardConfiguration configuration);
}
