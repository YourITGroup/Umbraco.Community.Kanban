using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Lanes;

/// <summary>
/// Applies editor-supplied appearance overrides on top of whatever the lane source produced.
/// </summary>
public static class KanbanLaneOverrideApplier
{
    /// <summary>
    /// Applies <paramref name="overrides"/> to <paramref name="lanes"/> in place.
    /// </summary>
    /// <returns>
    /// The overrides that matched no lane. These are kept rather than discarded so the
    /// configuration UI can flag them — a renamed option should not silently lose its styling.
    /// </returns>
    public static IReadOnlyList<KanbanLaneOverride> Apply(
        IReadOnlyList<KanbanLane> lanes,
        IReadOnlyList<KanbanLaneOverride> overrides)
    {
        var byValue = lanes.ToDictionary(lane => lane.Value, StringComparer.OrdinalIgnoreCase);
        var unmatched = new List<KanbanLaneOverride>();

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
