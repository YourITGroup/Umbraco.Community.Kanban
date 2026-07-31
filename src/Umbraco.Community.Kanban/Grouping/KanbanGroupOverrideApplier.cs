using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Grouping;

/// <summary>
/// Applies editor-supplied appearance overrides on top of whatever the group source produced.
/// </summary>
public static class KanbanGroupOverrideApplier
{
    /// <summary>
    /// Applies <paramref name="overrides"/> to <paramref name="lanes"/> in place.
    /// </summary>
    /// <returns>
    /// The overrides that matched no lane. These are kept rather than discarded so the
    /// configuration UI can flag them — a renamed option should not silently lose its styling.
    /// </returns>
    public static IReadOnlyList<KanbanGroupOverride> Apply(
        IReadOnlyList<KanbanGroup> lanes,
        IReadOnlyList<KanbanGroupOverride> overrides)
    {
        // Built via a loop rather than ToDictionary: editor-authored lane values can be
        // case-insensitively duplicated (e.g. a dropdown with both "Todo" and "todo" as
        // distinct options), and ToDictionary would throw. The first lane with a given
        // case-insensitive value wins.
        var byValue = new Dictionary<string, KanbanGroup>(StringComparer.OrdinalIgnoreCase);
        foreach (var lane in lanes)
        {
            byValue.TryAdd(lane.Value, lane);
        }
        var unmatched = new List<KanbanGroupOverride>();

        foreach (var laneOverride in overrides)
        {
            if (byValue.TryGetValue(laneOverride.Value, out var lane) == false)
            {
                unmatched.Add(laneOverride);
                continue;
            }

            if (string.IsNullOrWhiteSpace(laneOverride.Colour) == false)
            {
                lane.Colour = laneOverride.Colour;
            }

            if (string.IsNullOrWhiteSpace(laneOverride.Icon) == false)
            {
                lane.Icon = laneOverride.Icon;
            }

            if (string.IsNullOrWhiteSpace(laneOverride.Label) == false)
            {
                lane.Name = laneOverride.Label;
            }
        }

        return unmatched;
    }
}
