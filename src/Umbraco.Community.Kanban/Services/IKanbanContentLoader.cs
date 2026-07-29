using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.Kanban.Services;

/// <param name="Children">The children that were read, capped.</param>
/// <param name="TotalChildCount">The parent's true child count, even when more exist than were read.</param>
public sealed record KanbanChildPage(IReadOnlyList<IContent> Children, int TotalChildCount);

/// <param name="Grandchildren">The grandchildren that were read, capped.</param>
/// <param name="Capped">True when more exist than were read, making per-card totals lower bounds.</param>
public sealed record KanbanGrandchildPage(IReadOnlyList<IContent> Grandchildren, bool Capped);

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

    /// <summary>
    /// Every document at <paramref name="level" /> below the tree rooted at
    /// <paramref name="parentId" /> — the children of the board's cards — at most
    /// <paramref name="cap" /> of them, in <paramref name="ordering" /> order.
    /// </summary>
    /// <remarks>
    /// One query for every card's children, because IContentService offers no "children of these ids".
    /// The level filter is what keeps the cap meaningful: without it one deep subtree elsewhere under
    /// the parent would consume the page and starve the cards that have children.
    /// </remarks>
    KanbanGrandchildPage GetGrandchildren(int parentId, int level, int cap, Ordering ordering);
}
