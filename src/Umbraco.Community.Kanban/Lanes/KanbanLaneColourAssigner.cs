using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Lanes;

/// <summary>
/// Fills in a colour for lanes that do not already have one.
/// </summary>
public static class KanbanLaneColourAssigner
{
    /// <summary>
    /// Assigns palette colours in place. A lane's colour comes from its index in the
    /// full lane order, so adding an override never re-colours an unrelated lane, and
    /// a lane keeps the same colour on every load.
    /// </summary>
    public static void Assign(IReadOnlyList<KanbanLane> lanes)
    {
        for (var index = 0; index < lanes.Count; index++)
        {
            var lane = lanes[index];

            if (lane.IsUnassigned)
            {
                lane.Colour = KanbanLanePalette.Neutral;
                continue;
            }

            if (string.IsNullOrWhiteSpace(lane.Colour) == false)
            {
                continue;
            }

            lane.Colour = KanbanLanePalette.Cycle[index % KanbanLanePalette.Cycle.Count];
        }
    }
}
