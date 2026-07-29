using Umbraco.Cms.Core.Models;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

/// <param name="Children">The children to list, capped for display.</param>
/// <param name="Total">Every browse-permitted child the board read for this card.</param>
/// <param name="TotalIsExact">False when the board's grandchild cap was hit.</param>
public sealed record KanbanCardChildren(
    IReadOnlyList<KanbanCardChildModel> Children,
    int Total,
    bool TotalIsExact)
{
    /// <summary>A card with no children — a board with child items switched off, or a childless card.</summary>
    public static KanbanCardChildren None { get; } = new([], 0, true);
}

/// <summary>
/// Groups one flat, ordered page of grandchildren into per-card child lists. Pure, so the grouping,
/// the display cap and the permission filtering are tested without a database.
/// </summary>
/// <remarks>
/// Keyed by integer parent id rather than GUID because that is what a loaded child carries — matching
/// it to a card is then a dictionary lookup on <c>IContent.Id</c>, with no second query to translate.
/// </remarks>
public static class KanbanCardChildAssembler
{
    public static IReadOnlyDictionary<int, KanbanCardChildren> Assemble(
        IEnumerable<IContent> grandchildren,
        ISet<Guid> browseable,
        bool capped,
        string? culture,
        int displayCap)
    {
        var byCard = new Dictionary<int, List<KanbanCardChildModel>>();

        foreach (IContent grandchild in grandchildren)
        {
            // Filtered before counting, so the total never discloses a node the user cannot see.
            if (browseable.Contains(grandchild.Key) == false)
            {
                continue;
            }

            if (byCard.TryGetValue(grandchild.ParentId, out List<KanbanCardChildModel>? children) == false)
            {
                children = [];
                byCard[grandchild.ParentId] = children;
            }

            children.Add(new KanbanCardChildModel
            {
                Key = grandchild.Key,
                Name = KanbanCardMapper.ResolveName(grandchild, culture),
                Icon = grandchild.ContentType.Icon,
            });
        }

        return byCard.ToDictionary(
            entry => entry.Key,
            entry => new KanbanCardChildren(
                entry.Value.Take(displayCap).ToList(),
                entry.Value.Count,
                capped == false));
    }
}
