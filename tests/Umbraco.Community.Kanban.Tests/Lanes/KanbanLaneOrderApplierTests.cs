using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Lanes;

public class KanbanLaneOrderApplierTests
{
    private static List<KanbanLane> Lanes(params string[] values) =>
        values.Select(value => new KanbanLane { Value = value, Name = value }).ToList();

    private static string[] Values(IEnumerable<KanbanLane> lanes) =>
        lanes.Select(lane => lane.Value).ToArray();

    [Fact]
    public void Apply_PutsListedLanesInTheListedOrder()
    {
        var lanes = Lanes("pending", "confirmed", "cancelled");

        var ordered = KanbanLaneOrderApplier.Apply(lanes, ["cancelled", "confirmed", "pending"]);

        Values(ordered).Should().Equal("cancelled", "confirmed", "pending");
    }

    [Fact]
    public void Apply_KeepsUnlistedLanesInSourceOrderAfterTheListedOnes()
    {
        // A dropdown option added after the board was configured has to appear somewhere, and the end
        // is the only position that does not reorder the lanes an editor arranged deliberately.
        var lanes = Lanes("pending", "confirmed", "archived", "cancelled");

        var ordered = KanbanLaneOrderApplier.Apply(lanes, ["cancelled", "pending"]);

        Values(ordered).Should().Equal("cancelled", "pending", "confirmed", "archived");
    }

    [Fact]
    public void Apply_IgnoresAValueMatchingNoLane()
    {
        var lanes = Lanes("pending", "confirmed");

        var ordered = KanbanLaneOrderApplier.Apply(lanes, ["confirmed", "renamed-away", "pending"]);

        Values(ordered).Should().Equal("confirmed", "pending");
    }

    [Fact]
    public void Apply_MatchesWithoutRegardToCase()
    {
        var lanes = Lanes("Pending", "Confirmed");

        var ordered = KanbanLaneOrderApplier.Apply(lanes, ["confirmed", "PENDING"]);

        Values(ordered).Should().Equal("Confirmed", "Pending");
    }

    [Fact]
    public void Apply_LeavesTheLanesAloneWhenNoOrderIsConfigured()
    {
        // Every board configured before laneOrder existed is in this state.
        var lanes = Lanes("pending", "confirmed", "cancelled");

        Values(KanbanLaneOrderApplier.Apply(lanes, null)).Should().Equal("pending", "confirmed", "cancelled");
        Values(KanbanLaneOrderApplier.Apply(lanes, [])).Should().Equal("pending", "confirmed", "cancelled");
    }

    [Fact]
    public void Apply_IgnoresBlankEntries()
    {
        var lanes = Lanes("pending", "confirmed");

        var ordered = KanbanLaneOrderApplier.Apply(lanes, ["", "   ", "confirmed"]);

        Values(ordered).Should().Equal("confirmed", "pending");
    }

    [Fact]
    public void Apply_DoesNotMutateTheLanesItWasGiven()
    {
        var lanes = Lanes("pending", "confirmed");

        KanbanLaneOrderApplier.Apply(lanes, ["confirmed", "pending"]);

        Values(lanes).Should().Equal("pending", "confirmed");
    }

    [Fact]
    public void Apply_KeepsTheFirstOfTwoLanesSharingAValue()
    {
        // Lane values can be case-insensitively duplicated — a dropdown with both "Todo" and "todo".
        // The order names one position, so the second lane sorts as unlisted, after the listed ones.
        var lanes = Lanes("Todo", "todo", "done");

        var ordered = KanbanLaneOrderApplier.Apply(lanes, ["done", "todo"]);

        Values(ordered).Should().Equal("done", "Todo", "todo");
    }
}
