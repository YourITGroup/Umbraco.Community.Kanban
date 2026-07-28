using Umbraco.Cms.Core.Models;

namespace Umbraco.Community.Kanban.Services;

/// <param name="Children">The children that were read, capped.</param>
/// <param name="TotalChildCount">The parent's true child count, even when more exist than were read.</param>
public sealed record KanbanChildPage(IReadOnlyList<IContent> Children, int TotalChildCount);

/// <summary>
/// The narrow slice of IContentService the board needs, so the board service is testable —
/// IContentService can be neither hand-faked nor constructed without persistence.
/// </summary>
public interface IKanbanContentLoader
{
    IContent? GetById(Guid key);

    /// <summary>
    /// The parent's children in sort order, at most <paramref name="cap" /> of them, with the
    /// true total. Draft values, because a card moved but not yet published must show in its
    /// new lane.
    /// </summary>
    KanbanChildPage GetChildren(int parentId, int cap);
}
