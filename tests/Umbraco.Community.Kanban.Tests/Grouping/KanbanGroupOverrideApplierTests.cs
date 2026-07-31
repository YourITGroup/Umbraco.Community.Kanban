using Umbraco.Community.Kanban.Grouping;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Lanes;

public class KanbanGroupOverrideApplierTests
{
    private static List<KanbanGroup> Lanes() =>
    [
        new KanbanGroup { Value = "todo", Name = "To do" },
        new KanbanGroup { Value = "done", Name = "Done", Colour = "green" },
    ];

    [Fact]
    public void Apply_SetsColourIconAndLabel()
    {
        var lanes = Lanes();
        KanbanGroupOverride[] overrides =
        [
            new() { Value = "todo", Colour = "red", Icon = "icon-alert", Label = "Blocked" },
        ];

        KanbanGroupOverrideApplier.Apply(lanes, overrides);

        lanes[0].Colour.Should().Be("red");
        lanes[0].Icon.Should().Be("icon-alert");
        lanes[0].Name.Should().Be("Blocked");
    }

    [Fact]
    public void Apply_BeatsAColourTheSourceSupplied()
    {
        var lanes = Lanes();
        KanbanGroupOverride[] overrides = [new() { Value = "done", Colour = "brown" }];

        KanbanGroupOverrideApplier.Apply(lanes, overrides);

        lanes[1].Colour.Should().Be("brown");
    }

    [Fact]
    public void Apply_LeavesFieldsTheOverrideDoesNotSet()
    {
        var lanes = Lanes();
        KanbanGroupOverride[] overrides = [new() { Value = "done", Icon = "icon-check" }];

        KanbanGroupOverrideApplier.Apply(lanes, overrides);

        lanes[1].Colour.Should().Be("green");
        lanes[1].Name.Should().Be("Done");
        lanes[1].Icon.Should().Be("icon-check");
    }

    [Fact]
    public void Apply_MatchesLaneValuesCaseInsensitively()
    {
        var lanes = Lanes();
        KanbanGroupOverride[] overrides = [new() { Value = "TODO", Colour = "red" }];

        KanbanGroupOverrideApplier.Apply(lanes, overrides);

        lanes[0].Colour.Should().Be("red");
    }

    [Fact]
    public void Apply_ReturnsOverridesThatMatchedNothing()
    {
        var lanes = Lanes();
        KanbanGroupOverride[] overrides =
        [
            new() { Value = "todo", Colour = "red" },
            new() { Value = "archived", Colour = "grey" },
        ];

        var unmatched = KanbanGroupOverrideApplier.Apply(lanes, overrides);

        unmatched.Select(x => x.Value).Should().Equal("archived");
    }

    [Fact]
    public void Apply_ToleratesNoOverrides()
    {
        var lanes = Lanes();

        var unmatched = KanbanGroupOverrideApplier.Apply(lanes, []);

        unmatched.Should().BeEmpty();
        lanes[0].Colour.Should().BeNull();
    }

    [Fact]
    public void Apply_ToleratesCaseInsensitivelyDuplicateLaneValues()
    {
        // A dropdown with both "Todo" and "todo" as distinct options is plausible,
        // editor-authorable data. Nothing upstream prevents it, so Apply must not throw
        // when two lanes collide once compared case-insensitively - the first lane wins.
        List<KanbanGroup> lanes =
        [
            new KanbanGroup { Value = "Todo", Name = "Todo", Colour = "blue", Icon = "icon-alert" },
            new KanbanGroup { Value = "todo", Name = "todo (duplicate)" },
        ];
        KanbanGroupOverride[] overrides = [new() { Value = "TODO", Colour = "red" }];

        Action act = () => KanbanGroupOverrideApplier.Apply(lanes, overrides);

        act.Should().NotThrow();
        lanes[0].Colour.Should().Be("red");
        lanes[0].Icon.Should().Be("icon-alert");
        lanes[0].Name.Should().Be("Todo");
        lanes[1].Colour.Should().BeNull();
    }
}
