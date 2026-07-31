using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Grouping;

/// <summary>
/// Puts lanes in the order an editor arranged, whatever produced them.
/// </summary>
public static class KanbanGroupOrderApplier
{
    /// <summary>
    /// Returns the lanes in <paramref name="laneOrder" />'s order.
    /// </summary>
    /// <remarks>
    /// A lane the order does not mention keeps its source order and sorts after every listed lane, so
    /// an option added to the underlying data type after the board was configured appears rather than
    /// being dropped. A listed value matching no lane is ignored — the same situation as an orphaned
    /// override, and unlike one there is nothing to show for it, because order is not styling.
    /// </remarks>
    public static IReadOnlyList<KanbanGroup> Apply(
        IReadOnlyList<KanbanGroup> lanes,
        IReadOnlyList<string>? laneOrder)
    {
        if (laneOrder is null || laneOrder.Count == 0)
        {
            return lanes;
        }

        // Built via a loop rather than ToDictionary for the same reason the override applier is:
        // editor-authored lane values can be case-insensitively duplicated, and ToDictionary throws.
        // The first listed occurrence of a value wins its position.
        var positions = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        foreach (var value in laneOrder)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                continue;
            }

            positions.TryAdd(value, positions.Count);
        }

        if (positions.Count == 0)
        {
            return lanes;
        }

        // A lane claims a listed position only once, so the second of two lanes sharing a value sorts
        // as unlisted rather than colliding with the first.
        var claimed = new HashSet<int>();

        // OrderBy is a stable sort, which is what keeps unlisted lanes in their source order.
        return lanes
            .Select(lane => new
            {
                Lane = lane,
                Position = Position(lane, positions, claimed),
            })
            .OrderBy(entry => entry.Position)
            .Select(entry => entry.Lane)
            .ToList();
    }

    private static int Position(KanbanGroup lane, Dictionary<string, int> positions, HashSet<int> claimed)
    {
        if (positions.TryGetValue(lane.Value, out var position) && claimed.Add(position))
        {
            return position;
        }

        // Unlisted lanes sort after every listed one. int.MaxValue would collide for more than one, so
        // the count of listed positions is the first index past them all.
        return positions.Count;
    }
}
