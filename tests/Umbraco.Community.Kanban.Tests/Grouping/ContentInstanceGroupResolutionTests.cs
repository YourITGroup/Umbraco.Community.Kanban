using Microsoft.Extensions.Logging.Abstractions;
using Umbraco.Community.Kanban.Grouping;
using Umbraco.Community.Kanban.Grouping.Sources;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Grouping;

/// <summary>
/// The content-instance source through the real <see cref="KanbanGroupResolver"/>, with the other
/// built-in sources alongside it — the arrangement a live site has.
/// </summary>
public class ContentInstanceGroupResolutionTests
{
    private static readonly Guid ContentTypeKey = Guid.Parse("8f6f5f4e-0000-4000-8000-000000000001");
    private static readonly Guid RoomType = Guid.Parse("aaaaaaaa-1111-1111-1111-111111111111");
    private static readonly Guid BoardRoom = Guid.Parse("cccccccc-3333-3333-3333-333333333333");
    private static readonly Guid HuddleRoom = Guid.Parse("dddddddd-4444-4444-4444-444444444444");

    private static KanbanGroupResolver Resolver(
        IKanbanPropertyDataTypeLookup lookup,
        IKanbanContentInstanceLookup instances) =>
        new(
            lookup,
            new KanbanGroupSourceCollection(() =>
            [
                new ManualGroupSource(),
                new CoreListEditorGroupSource(),
                new ContentInstanceGroupSource(instances, NullLogger<ContentInstanceGroupSource>.Instance),
            ]));

    private static FakePropertyDataTypeLookup RoomIsAContentPicker() =>
        new FakePropertyDataTypeLookup().Add(
            "room",
            "Umbraco.ContentPicker",
            new Dictionary<string, object> { ["allowedContentTypes"] = RoomType.ToString() });

    private static FakeKanbanContentInstanceLookup TwoRooms()
    {
        var instances = new FakeKanbanContentInstanceLookup();
        instances.InstancesByContentType[RoomType] =
        [
            new KanbanContentInstance(BoardRoom, "Board Room", "icon-meeting"),
            new KanbanContentInstance(HuddleRoom, "Huddle Room", "icon-meeting"),
        ];

        return instances;
    }

    [Fact]
    public async Task Resolve_TurnsThePickersDocumentsIntoLanes()
    {
        KanbanGroupResolver resolver = Resolver(RoomIsAContentPicker(), TwoRooms());

        KanbanGroupResolution resolution = await resolver.ResolveAsync(
            ContentTypeKey,
            new KanbanBoardConfiguration { LaneProperty = "room" });

        // The unassigned lane always leads, then a lane per document.
        resolution.Groups.Select(group => group.Name).Should().Equal("Unassigned", "Board Room", "Huddle Room");
        resolution.Groups[1].Value.Should().Be($"umb://document/{BoardRoom:N}");
        resolution.Groups[1].Icon.Should().Be("icon-meeting");
    }

    [Fact]
    public async Task Resolve_GivesTheDocumentLanesPaletteColours()
    {
        KanbanGroupResolver resolver = Resolver(RoomIsAContentPicker(), TwoRooms());

        KanbanGroupResolution resolution = await resolver.ResolveAsync(
            ContentTypeKey,
            new KanbanBoardConfiguration { LaneProperty = "room" });

        // The source sets no colour, so the palette cycle fills them in as it does for any source.
        resolution.Groups[1].Colour.Should().NotBeNullOrWhiteSpace();
        resolution.Groups[2].Colour.Should().NotBe(resolution.Groups[1].Colour);
    }

    [Fact]
    public async Task Resolve_AppliesOverridesToADocumentLane()
    {
        KanbanGroupResolver resolver = Resolver(RoomIsAContentPicker(), TwoRooms());

        KanbanGroupResolution resolution = await resolver.ResolveAsync(
            ContentTypeKey,
            new KanbanBoardConfiguration
            {
                LaneProperty = "room",
                LaneOverrides =
                [
                    new KanbanGroupOverride
                    {
                        Value = $"umb://document/{BoardRoom:N}",
                        Label = "The Big Room",
                        Colour = "blue",
                    },
                ],
            });

        KanbanGroup renamed = resolution.Groups.Single(group => group.Value == $"umb://document/{BoardRoom:N}");
        renamed.Name.Should().Be("The Big Room");
        renamed.Colour.Should().Be("blue");
        resolution.UnmatchedOverrides.Should().BeEmpty();
    }

    [Fact]
    public async Task Resolve_PrefersManualLanesWhenTheConfigurationPinsThem()
    {
        KanbanGroupResolver resolver = Resolver(RoomIsAContentPicker(), TwoRooms());

        KanbanGroupResolution resolution = await resolver.ResolveAsync(
            ContentTypeKey,
            new KanbanBoardConfiguration
            {
                LaneProperty = "room",
                UseManualLanes = true,
                ManualLanes = [new KanbanManualGroup { Value = "anything", Label = "Hand written" }],
            });

        resolution.Groups.Select(group => group.Name).Should().Equal("Unassigned", "Hand written");
    }

    [Fact]
    public async Task Resolve_FallsBackToNoLanesForAnUnrestrictedPicker()
    {
        var lookup = new FakePropertyDataTypeLookup().Add(
            "room",
            "Umbraco.ContentPicker",
            new Dictionary<string, object>());

        KanbanGroupResolver resolver = Resolver(lookup, TwoRooms());

        KanbanGroupResolution resolution = await resolver.ResolveAsync(
            ContentTypeKey,
            new KanbanBoardConfiguration { LaneProperty = "room" });

        // Nothing claims the property, so the board collapses to the unassigned lane — the same
        // outcome as any unrecognised editor.
        resolution.Groups.Should().ContainSingle().Which.IsUnassigned.Should().BeTrue();
    }
}
