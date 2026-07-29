using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Lanes;

/// <summary>
/// Fills in a colour for lanes that do not already have one.
/// </summary>
public static class KanbanLaneColourAssigner
{
    /// <summary>
    /// Assigns palette colours in place. A lane's colour comes from its position among the
    /// real lanes, so adding an override never re-colours an unrelated lane, and a lane keeps
    /// the same colour on every load.
    /// </summary>
    /// <remarks>
    /// The palette position is counted separately from the loop index, so the synthetic
    /// unassigned lane does not consume one. It used to: with the unassigned lane appended last
    /// that was invisible, but it meant a board's colours depended on where a lane carrying no
    /// colour of its own happened to sit. Call this before applying a display order, so that
    /// reordering lanes moves columns without recolouring them.
    /// </remarks>
    public static void Assign(IReadOnlyList<KanbanLane> lanes)
    {
        var position = 0;

        foreach (var lane in lanes)
        {
            if (lane.IsUnassigned)
            {
                lane.Colour = KanbanLanePalette.Neutral;
                continue;
            }

            var palettePosition = position++;

            if (string.IsNullOrWhiteSpace(lane.Colour) == false)
            {
                continue;
            }

            lane.Colour = KanbanLanePalette.Cycle[palettePosition % KanbanLanePalette.Cycle.Count];
        }
    }
}
