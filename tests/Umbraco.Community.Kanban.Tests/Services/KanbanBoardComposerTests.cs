using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanBoardComposerTests
{
    private static KanbanGroup Lane(string value) => new() { Value = value, Name = value };

    private static IReadOnlyList<KanbanGroup> Lanes() =>
        [Lane("todo"), Lane("doing"), KanbanGroup.Unassigned()];

    private static KanbanCardModel Card(string name) => new()
    {
        Key = Guid.NewGuid(),
        Name = name,
        ContentTypeAlias = "task",
        ContentTypeKey = Guid.NewGuid(),
        State = KanbanCardStates.Draft,
    };

    private static KanbanCardAssignment At(string laneValue, string name) => new(laneValue, Card(name));

    private static KanbanBoardComposerRequest Request(
        IReadOnlyList<KanbanCardAssignment> cards,
        int pageSize = 25,
        string? lane = null,
        int skip = 0,
        bool truncated = false,
        int childCount = 0) =>
        new(Lanes(), cards, childCount, truncated, pageSize, lane, skip);

    [Fact]
    public void Omits_a_hidden_lane_and_the_cards_in_it()
    {
        var lanes = new List<KanbanGroup>
        {
            Lane("todo"),
            new() { Value = "doing", Name = "doing", Hidden = true },
            KanbanGroup.Unassigned(),
        };

        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            new KanbanBoardComposerRequest(lanes, [At("todo", "a"), At("doing", "b")], 0, false, 25, null, 0));

        // The point of grouping before filtering: "b" belongs to the hidden lane and goes with it, rather
        // than matching nothing and being collected by the unassigned fallback — which is why the
        // unassigned lane is absent here rather than holding it. (Absent because empty: see below.)
        board.Lanes.Select(l => l.Value).Should().Equal("todo");
        board.Lanes.SelectMany(l => l.Cards).Select(c => c.Name).Should().Equal("a");
    }

    [Fact]
    public void A_card_whose_lane_value_matches_nothing_still_lands_in_unassigned()
    {
        var lanes = new List<KanbanGroup>
        {
            Lane("todo"),
            new() { Value = "doing", Name = "doing", Hidden = true },
            KanbanGroup.Unassigned(),
        };

        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            new KanbanBoardComposerRequest(lanes, [At("gone", "orphan")], 0, false, 25, null, 0));

        board.Lanes.Single(l => l.IsUnassigned).Cards.Select(c => c.Name).Should().Equal("orphan");
    }

    [Fact]
    public void Requesting_a_hidden_lane_by_name_returns_nothing()
    {
        var lanes = new List<KanbanGroup>
        {
            Lane("todo"),
            new() { Value = "doing", Name = "doing", Hidden = true },
            KanbanGroup.Unassigned(),
        };

        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            new KanbanBoardComposerRequest(lanes, [At("doing", "b")], 0, false, 25, "doing", 0));

        board.Lanes.Should().BeEmpty();
    }

    [Fact]
    public void Groups_cards_into_their_lane()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            Request([At("todo", "a"), At("doing", "b"), At("todo", "c")]));

        board.Lanes.Single(l => l.Value == "todo").Cards.Select(c => c.Name).Should().Equal("a", "c");
        board.Lanes.Single(l => l.Value == "doing").Cards.Select(c => c.Name).Should().Equal("b");
    }

    [Fact]
    public void Matches_lane_values_case_insensitively()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(Request([At("ToDo", "a")]));

        board.Lanes.Single(l => l.Value == "todo").Cards.Should().HaveCount(1);
    }

    [Fact]
    public void Sends_empty_and_unmatched_values_to_the_unassigned_lane()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            Request([At(string.Empty, "a"), At("archived", "b")]));

        board.Lanes.Single(l => l.IsUnassigned).Cards.Select(c => c.Name).Should().Equal("a", "b");
    }

    [Fact]
    public void Preserves_the_resolved_lane_order()
    {
        // One unassigned card, so the unassigned lane is part of what the order is asserted against.
        KanbanBoardComposer.Compose(Request([At(string.Empty, "a")])).Lanes
            .Select(l => l.Value).Should().Equal("todo", "doing", string.Empty);
    }

    [Fact]
    public void Omits_the_unassigned_lane_when_no_card_is_in_it()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(Request([At("todo", "a")]));

        board.Lanes.Should().NotContain(l => l.IsUnassigned);
        board.Lanes.Select(l => l.Value).Should().Equal("todo", "doing");
    }

    [Fact]
    public void Keeps_the_unassigned_lane_when_a_card_is_in_it()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(Request([At(string.Empty, "a")]));

        board.Lanes.Single(l => l.IsUnassigned).Cards.Select(c => c.Name).Should().Equal("a");
    }

    [Fact]
    public void Keeps_the_unassigned_lane_for_an_unmatched_value_even_when_the_lane_property_is_mandatory()
    {
        // Mandatory only rules out an *empty* value. A value the lanes no longer offer — a removed dropdown
        // item, a renamed lane — still lands here, and hiding the lane would lose the card off the board.
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            new KanbanBoardComposerRequest(
                Lanes(), [At("gone", "orphan")], 0, false, 25, null, 0, LanePropertyIsMandatory: true));

        board.Lanes.Single(l => l.IsUnassigned).Cards.Select(c => c.Name).Should().Equal("orphan");
    }

    [Fact]
    public void Keeps_an_empty_unassigned_lane_under_truncation_when_the_lane_property_is_optional()
    {
        // The unassigned cards may simply be past the read window, and an optional property makes that
        // the likely case rather than an anomaly.
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            Request([At("todo", "a")], truncated: true, childCount: 4000));

        board.Lanes.Should().Contain(l => l.IsUnassigned);
    }

    [Fact]
    public void Drops_an_empty_unassigned_lane_under_truncation_when_the_lane_property_is_mandatory()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            new KanbanBoardComposerRequest(
                Lanes(), [At("todo", "a")], 4000, true, 25, null, 0, LanePropertyIsMandatory: true));

        board.Lanes.Should().NotContain(l => l.IsUnassigned);
    }

    [Fact]
    public void Returns_no_lanes_when_the_empty_unassigned_lane_is_the_one_requested()
    {
        // The client only pages a lane it has already been shown, so this is the stale-request case:
        // answering with an empty lane would put the column back on a board that had dropped it.
        KanbanBoardComposer.Compose(Request([At("todo", "a")], lane: string.Empty)).Lanes
            .Should().BeEmpty();
    }

    [Fact]
    public void Carries_lane_appearance_through()
    {
        var lanes = new List<KanbanGroup>
        {
            new() { Value = "todo", Name = "To do", Colour = "blue", Icon = "icon-box", AcceptsDrops = true },
            KanbanGroup.Unassigned(),
        };

        KanbanBoardLaneModel lane = KanbanBoardComposer
            .Compose(new KanbanBoardComposerRequest(lanes, [], 0, false, 25, null, 0))
            .Lanes[0];

        lane.Name.Should().Be("To do");
        lane.Colour.Should().Be("blue");
        lane.Icon.Should().Be("icon-box");
        lane.AcceptsDrops.Should().BeTrue();
        lane.IsUnassigned.Should().BeFalse();
    }

    [Fact]
    public void Pages_every_lane_to_the_page_size_on_an_initial_load()
    {
        IReadOnlyList<KanbanCardAssignment> cards =
            [At("todo", "a"), At("todo", "b"), At("todo", "c"), At("doing", "d")];

        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(Request(cards, pageSize: 2));

        KanbanBoardLaneModel todo = board.Lanes.Single(l => l.Value == "todo");
        todo.Cards.Select(c => c.Name).Should().Equal("a", "b");
        todo.Total.Should().Be(3);
        todo.Skip.Should().Be(0);
        board.Lanes.Single(l => l.Value == "doing").Cards.Should().HaveCount(1);
    }

    [Fact]
    public void Returns_only_the_requested_lane_when_one_is_named()
    {
        IReadOnlyList<KanbanCardAssignment> cards =
            [At("todo", "a"), At("todo", "b"), At("todo", "c"), At("doing", "d")];

        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            Request(cards, pageSize: 2, lane: "todo", skip: 2));

        board.Lanes.Should().HaveCount(1);
        KanbanBoardLaneModel todo = board.Lanes.Single();
        todo.Value.Should().Be("todo");
        todo.Cards.Select(c => c.Name).Should().Equal("c");
        todo.Skip.Should().Be(2);
        todo.Total.Should().Be(3);
    }

    [Fact]
    public void Addresses_the_unassigned_lane_with_the_empty_string()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            Request([At("archived", "a")], lane: string.Empty));

        board.Lanes.Single().IsUnassigned.Should().BeTrue();
        board.Lanes.Single().Cards.Should().HaveCount(1);
    }

    [Fact]
    public void Returns_no_lanes_when_the_requested_lane_does_not_exist()
    {
        KanbanBoardComposer.Compose(Request([At("todo", "a")], lane: "nope")).Lanes
            .Should().BeEmpty();
    }

    [Fact]
    public void Returns_an_empty_page_past_the_end_without_losing_the_total()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            Request([At("todo", "a")], pageSize: 25, lane: "todo", skip: 50));

        board.Lanes.Single().Cards.Should().BeEmpty();
        board.Lanes.Single().Total.Should().Be(1);
    }

    [Fact]
    public void Totals_are_exact_when_not_truncated()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            Request([At("todo", "a")], childCount: 1));

        board.Truncated.Should().BeFalse();
        board.ChildCount.Should().Be(1);
        board.Lanes.Should().OnlyContain(l => l.TotalIsExact);
    }

    [Fact]
    public void Every_total_becomes_a_lower_bound_once_truncated()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            Request([At("todo", "a")], truncated: true, childCount: 4000));

        board.Truncated.Should().BeTrue();
        board.ChildCount.Should().Be(4000);
        board.Lanes.Should().OnlyContain(l => l.TotalIsExact == false);
    }

    [Fact]
    public void Drops_unmatched_cards_when_there_is_no_unassigned_lane()
    {
        var lanes = new List<KanbanGroup> { new() { Value = "todo", Name = "To do" } };

        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            new KanbanBoardComposerRequest(lanes, [At("archived", "a")], 1, false, 25, null, 0));

        board.Lanes.Single().Cards.Should().BeEmpty();
    }

    [Fact]
    public void Echoes_allow_drag_off_by_default_so_a_caller_that_does_not_set_it_cannot_enable_dragging()
    {
        KanbanBoardComposer.Compose(Request([])).AllowDrag.Should().BeFalse();
    }

    [Fact]
    public void Echoes_allow_drag_when_the_request_carries_it()
    {
        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            new KanbanBoardComposerRequest(Lanes(), [], 0, false, 25, null, 0, false, AllowDrag: true));

        board.AllowDrag.Should().BeTrue();
    }
}
