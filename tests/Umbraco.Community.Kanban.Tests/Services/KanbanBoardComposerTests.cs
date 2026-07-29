using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanBoardComposerTests
{
    private static KanbanLane Lane(string value) => new() { Value = value, Name = value };

    private static IReadOnlyList<KanbanLane> Lanes() =>
        [Lane("todo"), Lane("doing"), KanbanLane.Unassigned()];

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
        KanbanBoardComposer.Compose(Request([])).Lanes
            .Select(l => l.Value).Should().Equal("todo", "doing", string.Empty);
    }

    [Fact]
    public void Carries_lane_appearance_through()
    {
        var lanes = new List<KanbanLane>
        {
            new() { Value = "todo", Name = "To do", Colour = "blue", Icon = "icon-box", AcceptsDrops = true },
            KanbanLane.Unassigned(),
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
        var lanes = new List<KanbanLane> { new() { Value = "todo", Name = "To do" } };

        KanbanBoardResponseModel board = KanbanBoardComposer.Compose(
            new KanbanBoardComposerRequest(lanes, [At("archived", "a")], 1, false, 25, null, 0));

        board.Lanes.Single().Cards.Should().BeEmpty();
    }
}
