using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

/// <summary>A card paired with the raw lane value read from its lane property.</summary>
public sealed record KanbanCardAssignment(string LaneValue, KanbanCardModel Card);

/// <param name="Lanes">The resolved lanes, in display order. Never re-sorted — this order drives lane colours.</param>
/// <param name="Cards">Every visible card, already permission-filtered.</param>
/// <param name="ChildCount">The parent's true child count, even when truncated.</param>
/// <param name="Truncated">True when more children exist than were read.</param>
/// <param name="PageSize">Cards per lane page.</param>
/// <param name="Lane">The single lane to return, or null for every lane. The empty string means the unassigned lane.</param>
/// <param name="Skip">Cards to skip within <paramref name="Lane" />. Ignored when Lane is null.</param>
/// <param name="ShowChildItems">Whether cards list their children, echoed to the client.</param>
/// <param name="AllowDrag">Whether the board permits dragging cards between lanes, echoed to the client.</param>
public sealed record KanbanBoardComposerRequest(
    IReadOnlyList<KanbanLane> Lanes,
    IReadOnlyList<KanbanCardAssignment> Cards,
    int ChildCount,
    bool Truncated,
    int PageSize,
    string? Lane,
    int Skip,
    bool ShowChildItems = false,
    bool AllowDrag = false);

/// <summary>
/// Groups cards into lanes and pages each lane independently. Pure — every input is a
/// plain model, which is what makes the paging and total arithmetic directly testable.
/// </summary>
public static class KanbanBoardComposer
{
    public static KanbanBoardResponseModel Compose(KanbanBoardComposerRequest request)
    {
        Dictionary<string, List<KanbanCardModel>> grouped = Group(request.Lanes, request.Cards);

        IEnumerable<KanbanLane> lanes = request.Lane is null
            ? request.Lanes
            : request.Lanes.Where(lane => Matches(lane, request.Lane));

        var skip = request.Lane is null ? 0 : Math.Max(0, request.Skip);

        return new KanbanBoardResponseModel
        {
            Truncated = request.Truncated,
            ChildCount = request.ChildCount,
            ShowChildItems = request.ShowChildItems,
            AllowDrag = request.AllowDrag,
            Lanes = lanes
                .Select(lane => Project(lane, grouped[lane.Value], skip, request.PageSize, request.Truncated))
                .ToList(),
        };
    }

    private static bool Matches(KanbanLane lane, string requested) =>
        string.Equals(lane.Value, requested, StringComparison.OrdinalIgnoreCase);

    private static Dictionary<string, List<KanbanCardModel>> Group(
        IReadOnlyList<KanbanLane> lanes,
        IReadOnlyList<KanbanCardAssignment> cards)
    {
        var grouped = new Dictionary<string, List<KanbanCardModel>>();

        foreach (KanbanLane lane in lanes)
        {
            // Duplicate lane values are possible from editor-authored data; the first wins,
            // as it does everywhere else in the lane pipeline.
            grouped.TryAdd(lane.Value, []);
        }

        KanbanLane? unassigned = lanes.FirstOrDefault(lane => lane.IsUnassigned);

        foreach (KanbanCardAssignment assignment in cards)
        {
            KanbanLane? target = string.IsNullOrEmpty(assignment.LaneValue)
                ? unassigned
                : lanes.FirstOrDefault(lane => Matches(lane, assignment.LaneValue)) ?? unassigned;

            if (target is not null)
            {
                grouped[target.Value].Add(assignment.Card);
            }
        }

        return grouped;
    }

    private static KanbanBoardLaneModel Project(
        KanbanLane lane,
        List<KanbanCardModel> cards,
        int skip,
        int pageSize,
        bool truncated) =>
        new()
        {
            Value = lane.Value,
            Name = lane.Name,
            Colour = lane.Colour,
            Icon = lane.Icon,
            IsUnassigned = lane.IsUnassigned,
            AcceptsDrops = lane.AcceptsDrops,
            Total = cards.Count,
            TotalIsExact = truncated == false,
            Skip = skip,
            Cards = cards.Skip(skip).Take(pageSize).ToList(),
        };
}
