using Umbraco.Community.Kanban.Services;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanLaneContentTypeResolverTests
{
    private static readonly Guid Parent = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Task = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid Note = Guid.Parse("33333333-3333-3333-3333-333333333333");

    private static (KanbanLaneContentTypeResolver Resolver, FakeKanbanContentTypeLookup Lookup) Subject()
    {
        var lookup = new FakeKanbanContentTypeLookup();
        return (new KanbanLaneContentTypeResolver(lookup), lookup);
    }

    [Fact]
    public async Task Returns_the_only_allowed_child_declaring_the_lane_property()
    {
        (KanbanLaneContentTypeResolver resolver, FakeKanbanContentTypeLookup lookup) = Subject();
        lookup.AllowedChildren[Parent] = [Note, Task];
        lookup.Properties[Task] = ["status"];

        (await resolver.ResolveAsync(Parent, "status")).Should().Be(Task);
    }

    [Fact]
    public async Task Prefers_the_first_allowed_child_that_declares_it()
    {
        (KanbanLaneContentTypeResolver resolver, FakeKanbanContentTypeLookup lookup) = Subject();
        lookup.AllowedChildren[Parent] = [Note, Task];
        lookup.Properties[Note] = ["status"];
        lookup.Properties[Task] = ["status"];

        (await resolver.ResolveAsync(Parent, "status")).Should().Be(Note);
        lookup.PropertyChecks.Should().ContainSingle("the search must stop at the first match");
    }

    [Fact]
    public async Task Matches_the_alias_case_insensitively()
    {
        (KanbanLaneContentTypeResolver resolver, FakeKanbanContentTypeLookup lookup) = Subject();
        lookup.AllowedChildren[Parent] = [Task];
        lookup.Properties[Task] = ["Status"];

        (await resolver.ResolveAsync(Parent, "status")).Should().Be(Task);
    }

    [Fact]
    public async Task Returns_empty_when_no_allowed_child_declares_the_property()
    {
        (KanbanLaneContentTypeResolver resolver, FakeKanbanContentTypeLookup lookup) = Subject();
        lookup.AllowedChildren[Parent] = [Note, Task];

        (await resolver.ResolveAsync(Parent, "status")).Should().Be(Guid.Empty);
    }

    [Fact]
    public async Task Returns_empty_when_the_parent_allows_no_children()
    {
        (KanbanLaneContentTypeResolver resolver, _) = Subject();

        (await resolver.ResolveAsync(Parent, "status")).Should().Be(Guid.Empty);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Returns_empty_without_looking_anything_up_when_there_is_no_lane_property(string? laneProperty)
    {
        (KanbanLaneContentTypeResolver resolver, FakeKanbanContentTypeLookup lookup) = Subject();
        lookup.AllowedChildren[Parent] = [Task];
        lookup.Properties[Task] = ["status"];

        (await resolver.ResolveAsync(Parent, laneProperty)).Should().Be(Guid.Empty);
        lookup.PropertyChecks.Should().BeEmpty();
    }
}
