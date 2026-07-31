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
/// <param name="LanePropertyIsMandatory">
/// True when the lane property is required, so a card is not expected to be unassigned. Only used to
/// decide whether an *empty* unassigned lane is shown under truncation — see <see cref="KanbanBoardComposer" />.
/// </param>
public sealed record KanbanBoardComposerRequest(
    IReadOnlyList<KanbanGroup> Lanes,
    IReadOnlyList<KanbanCardAssignment> Cards,
    int ChildCount,
    bool Truncated,
    int PageSize,
    string? Lane,
    int Skip,
    bool ShowChildItems = false,
    bool AllowDrag = false,
    bool LanePropertyIsMandatory = false);

/// <summary>
/// Groups cards into lanes and pages each lane independently. Pure — every input is a
/// plain model, which is what makes the paging and total arithmetic directly testable.
/// </summary>
public static class KanbanBoardComposer
{
    public static KanbanBoardResponseModel Compose(KanbanBoardComposerRequest request)
    {
        // Grouped against every lane, hidden ones included, so a hidden lane's cards land in its own
        // bucket and are then dropped with it. Excluding hidden lanes before grouping would instead
        // leave those cards matching nothing, and the unassigned fallback would collect them — a
        // hidden lane would empty itself into Unassigned rather than take its cards with it.
        Dictionary<string, List<KanbanCardModel>> grouped = Group(request.Lanes, request.Cards);

        IEnumerable<KanbanGroup> lanes = (request.Lane is null
            ? request.Lanes
            : request.Lanes.Where(lane => Matches(lane, request.Lane)))
            .Where(lane => lane.Hidden == false)
            .Where(lane => lane.IsUnassigned == false || ShowsUnassigned(grouped[lane.Value], request));

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

    /// <summary>
    /// Whether the unassigned lane earns a column. It is a synthetic lane nobody configured and nothing can
    /// be dropped into, so an empty one is a column of dead space on every board whose cards all have a
    /// value — which is every board with a mandatory lane property.
    ///
    /// Cards decide it: any card grouped into the lane keeps it, so nothing visible is ever hidden. That
    /// includes cards whose value matches no lane, which land here even under a mandatory property (a value
    /// removed from the dropdown, a renamed lane) — hiding those would lose them from the board entirely.
    ///
    /// Truncation is the one case cards cannot decide, the read window having stopped short of the children
    /// that would have filled the lane. There the property is what tips it: an optional property keeps the
    /// lane, because unassigned cards are ordinary and likely beyond the window; a mandatory one drops it,
    /// unmatched values being rare enough not to reserve a column for on a guess.
    /// </summary>
    private static bool ShowsUnassigned(List<KanbanCardModel> cards, KanbanBoardComposerRequest request) =>
        cards.Count > 0 || (request.Truncated && request.LanePropertyIsMandatory == false);

    private static bool Matches(KanbanGroup lane, string requested) =>
        string.Equals(lane.Value, requested, StringComparison.OrdinalIgnoreCase);

    private static Dictionary<string, List<KanbanCardModel>> Group(
        IReadOnlyList<KanbanGroup> lanes,
        IReadOnlyList<KanbanCardAssignment> cards)
    {
        var grouped = new Dictionary<string, List<KanbanCardModel>>();

        foreach (KanbanGroup lane in lanes)
        {
            // Duplicate lane values are possible from editor-authored data; the first wins,
            // as it does everywhere else in the lane pipeline.
            grouped.TryAdd(lane.Value, []);
        }

        KanbanGroup? unassigned = lanes.FirstOrDefault(lane => lane.IsUnassigned);

        foreach (KanbanCardAssignment assignment in cards)
        {
            KanbanGroup? target = string.IsNullOrEmpty(assignment.LaneValue)
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
        KanbanGroup lane,
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
