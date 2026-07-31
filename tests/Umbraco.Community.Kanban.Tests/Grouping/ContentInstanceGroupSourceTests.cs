using Microsoft.Extensions.Logging.Abstractions;
using Umbraco.Community.Kanban.Grouping;
using Umbraco.Community.Kanban.Grouping.Sources;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Grouping;

public class ContentInstanceGroupSourceTests
{
    private static readonly Guid RoomType = Guid.Parse("aaaaaaaa-1111-1111-1111-111111111111");
    private static readonly Guid DeskType = Guid.Parse("bbbbbbbb-2222-2222-2222-222222222222");
    private static readonly Guid BoardRoom = Guid.Parse("cccccccc-3333-3333-3333-333333333333");
    private static readonly Guid HuddleRoom = Guid.Parse("dddddddd-4444-4444-4444-444444444444");

    private static KanbanGroupSourceContext Context(
        string editorAlias = "Umbraco.ContentPicker",
        string? allowed = null) =>
        new(
            editorAlias,
            allowed is null
                ? new Dictionary<string, object>()
                : new Dictionary<string, object> { ["allowedContentTypes"] = allowed },
            new KanbanBoardConfiguration());

    private static (ContentInstanceGroupSource Source, FakeKanbanContentInstanceLookup Lookup) Source()
    {
        var lookup = new FakeKanbanContentInstanceLookup();

        return (new ContentInstanceGroupSource(lookup, NullLogger<ContentInstanceGroupSource>.Instance), lookup);
    }

    [Fact]
    public void Claims_a_picker_that_names_its_allowed_types()
    {
        (ContentInstanceGroupSource source, _) = Source();

        source.CanHandle(Context(allowed: RoomType.ToString())).Should().BeTrue();
    }

    [Fact]
    public void Leaves_an_unrestricted_picker_to_another_source()
    {
        (ContentInstanceGroupSource source, _) = Source();

        source.CanHandle(Context()).Should().BeFalse();
    }

    [Fact]
    public void Leaves_an_editor_it_does_not_know_alone()
    {
        (ContentInstanceGroupSource source, _) = Source();

        source.CanHandle(Context("Umbraco.DropDown.Flexible", RoomType.ToString())).Should().BeFalse();
    }

    [Fact]
    public async Task Offers_each_document_as_a_group_keyed_on_the_udi_the_picker_stores()
    {
        (ContentInstanceGroupSource source, FakeKanbanContentInstanceLookup lookup) = Source();
        lookup.InstancesByContentType[RoomType] =
        [
            new KanbanContentInstance(BoardRoom, "Board Room", "icon-meeting"),
            new KanbanContentInstance(HuddleRoom, "Huddle Room", "icon-meeting"),
        ];

        IReadOnlyList<KanbanGroup> groups = await source.GetGroupsAsync(Context(allowed: RoomType.ToString()));

        groups.Select(group => group.Name).Should().Equal("Board Room", "Huddle Room");
        // The value must be exactly what a content picker persists, or no card ever matches its group.
        groups[0].Value.Should().Be($"umb://document/{BoardRoom:N}");
        groups[1].Value.Should().Be($"umb://document/{HuddleRoom:N}");
    }

    [Fact]
    public async Task Carries_the_content_types_icon_and_leaves_the_colour_to_the_palette()
    {
        (ContentInstanceGroupSource source, FakeKanbanContentInstanceLookup lookup) = Source();
        lookup.InstancesByContentType[RoomType] = [new KanbanContentInstance(BoardRoom, "Board Room", "icon-meeting")];

        IReadOnlyList<KanbanGroup> groups = await source.GetGroupsAsync(Context(allowed: RoomType.ToString()));

        groups.Single().Icon.Should().Be("icon-meeting");
        groups.Single().Colour.Should().BeNull();
    }

    [Fact]
    public async Task A_blank_icon_reads_as_none()
    {
        (ContentInstanceGroupSource source, FakeKanbanContentInstanceLookup lookup) = Source();
        lookup.InstancesByContentType[RoomType] = [new KanbanContentInstance(BoardRoom, "Board Room", "  ")];

        IReadOnlyList<KanbanGroup> groups = await source.GetGroupsAsync(Context(allowed: RoomType.ToString()));

        groups.Single().Icon.Should().BeNull();
    }

    [Fact]
    public async Task Lists_the_documents_of_every_allowed_type()
    {
        (ContentInstanceGroupSource source, FakeKanbanContentInstanceLookup lookup) = Source();
        lookup.InstancesByContentType[RoomType] = [new KanbanContentInstance(BoardRoom, "Board Room", null)];
        lookup.InstancesByContentType[DeskType] = [new KanbanContentInstance(HuddleRoom, "Hot Desk", null)];

        IReadOnlyList<KanbanGroup> groups = await source.GetGroupsAsync(
            Context(allowed: $"{RoomType},{DeskType}"));

        groups.Select(group => group.Name).Should().Equal("Board Room", "Hot Desk");
        lookup.Calls.Single().ContentTypeKeys.Should().Equal(RoomType, DeskType);
    }

    [Fact]
    public async Task Caps_the_groups_it_offers()
    {
        (ContentInstanceGroupSource source, FakeKanbanContentInstanceLookup lookup) = Source();
        lookup.InstancesByContentType[RoomType] = Enumerable
            .Range(0, Umbraco.Community.Kanban.Constants.DefaultGroupCap + 50)
            .Select(index => new KanbanContentInstance(Guid.NewGuid(), $"Room {index:0000}", null))
            .ToList();

        IReadOnlyList<KanbanGroup> groups = await source.GetGroupsAsync(Context(allowed: RoomType.ToString()));

        groups.Should().HaveCount(Umbraco.Community.Kanban.Constants.DefaultGroupCap);
        // Asked for one over the cap, so exceeding it is detectable rather than silently trimmed.
        lookup.Calls.Single().Cap.Should().Be(Umbraco.Community.Kanban.Constants.DefaultGroupCap + 1);
    }

    [Fact]
    public async Task An_unrestricted_picker_produces_nothing_even_if_asked_directly()
    {
        (ContentInstanceGroupSource source, FakeKanbanContentInstanceLookup lookup) = Source();

        IReadOnlyList<KanbanGroup> groups = await source.GetGroupsAsync(Context());

        groups.Should().BeEmpty();
        lookup.Calls.Should().BeEmpty("nothing should be queried when no type is allowed");
    }
}
