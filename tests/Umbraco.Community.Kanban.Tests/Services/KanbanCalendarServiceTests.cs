using Umbraco.Cms.Core.Actions;
using Umbraco.Cms.Core.Models;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;
using Umbraco.Community.Kanban.Tests.Fakes;
using Umbraco.Cms.Core.Models.Membership;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanCalendarServiceTests
{
    private static readonly FakeShortStringHelper ShortStrings = new();
    private static readonly Guid ParentKey = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid ListViewKey = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid CalendarConfigKey = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private static readonly Guid ChildTypeKey = Guid.Parse("44444444-4444-4444-4444-444444444444");

    private sealed record Harness(
        KanbanCalendarService Service,
        FakeKanbanContentLoader Loader,
        FakeContentPermissionAuthorizer Permissions,
        FakeKanbanLaneResolver LaneResolver,
        FakeKanbanConfigurationService Configurations,
        ContentType ChildContentType);

    private static ContentType ChildType()
    {
        var contentType = new ContentType(ShortStrings, -1)
        {
            Alias = "booking",
            Name = "Booking",
            Icon = "icon-calendar",
            Key = ChildTypeKey,
        };

        contentType.AddPropertyType(new PropertyType(ShortStrings, "Umbraco.DateTimeWithTimeZone", ValueStorageType.Ntext, "start")
        {
            Name = "Start",
        });
        contentType.AddPropertyType(new PropertyType(ShortStrings, "Umbraco.DateTimeWithTimeZone", ValueStorageType.Ntext, "end")
        {
            Name = "End",
        });
        contentType.AddPropertyType(new PropertyType(ShortStrings, "Umbraco.TextBox", ValueStorageType.Nvarchar, "kind")
        {
            Name = "Kind",
        });

        return contentType;
    }

    private static Harness Configured(KanbanCalendarConfiguration? configuration = null)
    {
        var parentContentType = new ContentType(ShortStrings, -1)
        {
            Alias = "bookingFolder",
            Name = "Booking Folder",
            Key = Guid.Parse("55555555-5555-5555-5555-555555555555"),
            ListView = ListViewKey,
        };
        var parent = new Content("Bookings", -1, parentContentType) { Id = 1234, Key = ParentKey };

        var loader = new FakeKanbanContentLoader();
        loader.Content[ParentKey] = parent;

        var permissions = new FakeContentPermissionAuthorizer();
        var laneResolver = new FakeKanbanLaneResolver();

        var contentTypes = new FakeKanbanContentTypeLookup();
        contentTypes.AllowedChildren[parentContentType.Key] = [ChildTypeKey];
        contentTypes.Properties[ChildTypeKey] = ["start", "end", "kind"];

        var dataTypes = new FakeKanbanDataTypeConfigurationLookup();
        dataTypes.Values[(ListViewKey, Constants.CalendarConfigIdKey)] = CalendarConfigKey;

        var configurations = new FakeKanbanConfigurationService();
        configurations.CalendarConfigurations[CalendarConfigKey] = configuration ?? new KanbanCalendarConfiguration
        {
            DateProperty = "start",
            EndDateProperty = "end",
            CardProperties = CardPropertyList.Of("kind"),
        };

        var service = new KanbanCalendarService(
            loader,
            new KanbanCalendarConfigurationResolver(dataTypes, configurations),
            new KanbanLaneContentTypeResolver(contentTypes),
            laneResolver,
            permissions,
            FakePropertyValueReader.Stored());

        return new Harness(service, loader, permissions, laneResolver, configurations, ChildType());
    }

    private static Content Child(Harness harness, string name, string? start, string? end = null, string? kind = null)
    {
        var child = new Content(name, 1234, harness.ChildContentType) { Key = Guid.NewGuid() };

        if (start is not null) child.SetValue("start", start);
        if (end is not null) child.SetValue("end", end);
        if (kind is not null) child.SetValue("kind", kind);

        harness.Loader.Children.Add(child);

        return child;
    }

    private static KanbanCalendarRequest Request(string from = "2026-08-01", string to = "2026-08-31") =>
        new(ParentKey, null, null, DateOnly.Parse(from), DateOnly.Parse(to));

    private static IUser User => new FakeUser();

    [Fact]
    public async Task Reports_parent_not_found()
    {
        Harness harness = Configured();

        KanbanCalendarResult result = await harness.Service.GetCalendarAsync(
            new KanbanCalendarRequest(Guid.NewGuid(), null, null, new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 31)),
            User);

        result.Status.Should().Be(KanbanBoardStatus.ParentNotFound);
    }

    [Fact]
    public async Task Reports_access_denied_when_the_parent_cannot_be_browsed()
    {
        Harness harness = Configured();
        harness.Permissions.Allowed[ActionBrowse.ActionLetter] = [];

        KanbanCalendarResult result = await harness.Service.GetCalendarAsync(Request(), User);

        result.Status.Should().Be(KanbanBoardStatus.ParentAccessDenied);
    }

    [Fact]
    public async Task Reports_configuration_not_found_for_an_unknown_config()
    {
        Harness harness = Configured();
        harness.Configurations.CalendarConfigurations.Clear();

        KanbanCalendarResult result = await harness.Service.GetCalendarAsync(Request(), User);

        result.Status.Should().Be(KanbanBoardStatus.ConfigurationNotFound);
    }

    [Fact]
    public async Task Places_cards_in_the_requested_range_plus_a_day_of_slack_and_orders_them()
    {
        // The slack exists because a zone-bearing value is filtered by its stored wall clock here but
        // placed in the viewer's zone by the client, which can move it onto the adjacent day. The
        // client trims what still falls outside the window it asked for.
        Harness harness = Configured();
        Child(harness, "Last day", """{"date":"2026-08-31T09:00:00"}""");
        Child(harness, "First day", """{"date":"2026-08-01T00:00:00"}""");
        Child(harness, "Day before", """{"date":"2026-07-31T23:00:00"}""");
        Child(harness, "Well before", """{"date":"2026-07-29T09:00:00"}""");
        Child(harness, "Well after", """{"date":"2026-09-03T09:00:00"}""");

        KanbanCalendarResult result = await harness.Service.GetCalendarAsync(Request(), User);

        result.Status.Should().Be(KanbanBoardStatus.Success);
        result.Calendar!.Items.Select(i => i.Card.Name).Should().Equal("Day before", "First day", "Last day");
        result.Calendar.Items[1].Date.Should().Be("2026-08-01");
        result.Calendar.Items[1].Time.Should().BeNull();
        result.Calendar.Items[2].Time.Should().Be("09:00");
    }

    [Fact]
    public async Task Carries_the_moment_of_a_zone_bearing_value_and_nothing_for_a_wall_clock()
    {
        Harness harness = Configured();
        Child(
            harness,
            "Zoned",
            """{"date":"2026-08-15T09:00:00+10:00","timeZone":"Australia/Sydney"}""",
            """{"date":"2026-08-15T11:30:00+10:00","timeZone":"Australia/Sydney"}""");
        Child(harness, "Unzoned", """{"date":"2026-08-15T09:00:00"}""");

        KanbanCalendarResult result = await harness.Service.GetCalendarAsync(Request(), User);

        KanbanCalendarItemModel zoned = result.Calendar!.Items.Single(i => i.Card.Name == "Zoned");
        zoned.Date.Should().Be("2026-08-15", "the wall clock still reads as stored");
        zoned.Time.Should().Be("09:00");
        zoned.Instant.Should().Be("2026-08-15T09:00:00.0000000+10:00");
        zoned.EndInstant.Should().Be("2026-08-15T11:30:00.0000000+10:00");

        KanbanCalendarItemModel unzoned = result.Calendar.Items.Single(i => i.Card.Name == "Unzoned");
        unzoned.Instant.Should().BeNull();
        unzoned.EndInstant.Should().BeNull();
    }

    [Fact]
    public async Task Counts_undated_children_without_listing_them()
    {
        Harness harness = Configured();
        Child(harness, "Dated", """{"date":"2026-08-15T10:00:00"}""");
        Child(harness, "Undated", null);

        KanbanCalendarResult result = await harness.Service.GetCalendarAsync(Request(), User);

        result.Calendar!.Items.Should().HaveCount(1);
        result.Calendar.UndatedCount.Should().Be(1);
    }

    [Fact]
    public async Task Carries_a_valid_end_and_drops_an_end_before_the_start()
    {
        Harness harness = Configured();
        Child(harness, "Spanned", """{"date":"2026-08-15T10:00:00"}""", """{"date":"2026-08-15T11:30:00"}""");
        Child(harness, "Backwards", """{"date":"2026-08-15T10:00:00"}""", """{"date":"2026-08-15T09:00:00"}""");

        KanbanCalendarResult result = await harness.Service.GetCalendarAsync(Request(), User);

        KanbanCalendarItemModel spanned = result.Calendar!.Items.Single(i => i.Card.Name == "Spanned");
        spanned.EndDate.Should().Be("2026-08-15");
        spanned.EndTime.Should().Be("11:30");

        KanbanCalendarItemModel backwards = result.Calendar.Items.Single(i => i.Card.Name == "Backwards");
        backwards.EndDate.Should().BeNull();
        backwards.EndTime.Should().BeNull();
    }

    [Fact]
    public async Task Carries_the_raw_category_value_and_resolves_categories_like_lanes()
    {
        Harness harness = Configured(new KanbanCalendarConfiguration
        {
            DateProperty = "start",
            CategoryProperty = "kind",
            CategoryOverrides = [new KanbanLaneOverride { Value = "workshop", Colour = "red" }],
        });
        harness.LaneResolver.Lanes.AddRange([
            new KanbanLane { Value = "workshop", Name = "Workshop", Colour = "red" },
            KanbanLane.Unassigned(),
        ]);
        Child(harness, "A", """{"date":"2026-08-15T10:00:00"}""", kind: "workshop");

        KanbanCalendarResult result = await harness.Service.GetCalendarAsync(Request(), User);

        result.Calendar!.Items.Single().Category.Should().Be("workshop");
        result.Calendar.Categories.Should().ContainSingle(c => c.Value == "workshop" && c.Colour == "red");
        result.Calendar.Categories.Should().NotContain(c => c.Value == string.Empty);

        (Guid _, KanbanBoardConfiguration adapter) = harness.LaneResolver.Calls.Single();
        adapter.LaneProperty.Should().Be("kind");
        adapter.LaneOverrides.Should().ContainSingle(o => o.Value == "workshop");
    }

    [Fact]
    public async Task Resolves_no_categories_when_no_category_property_is_configured()
    {
        Harness harness = Configured();
        Child(harness, "A", """{"date":"2026-08-15T10:00:00"}""");

        KanbanCalendarResult result = await harness.Service.GetCalendarAsync(Request(), User);

        result.Calendar!.Categories.Should().BeEmpty();
        harness.LaneResolver.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task Reports_the_date_property_editor_alias()
    {
        Harness harness = Configured();
        Child(harness, "A", """{"date":"2026-08-15T10:00:00"}""");

        KanbanCalendarResult result = await harness.Service.GetCalendarAsync(Request(), User);

        result.Calendar!.DatePropertyEditorAlias.Should().Be("Umbraco.DateTimeWithTimeZone");
    }

    [Fact]
    public async Task Reports_no_editor_alias_for_a_system_date_property()
    {
        Harness harness = Configured(new KanbanCalendarConfiguration { DateProperty = "updateDate" });
        Content child = Child(harness, "A", null);
        child.UpdateDate = new DateTime(2026, 8, 15, 10, 0, 0);

        KanbanCalendarResult result = await harness.Service.GetCalendarAsync(Request(), User);

        result.Calendar!.Items.Should().HaveCount(1);
        result.Calendar.DatePropertyEditorAlias.Should().BeNull();
    }

    [Fact]
    public async Task Filters_children_the_user_cannot_browse()
    {
        Harness harness = Configured();
        Content hidden = Child(harness, "Hidden", """{"date":"2026-08-15T10:00:00"}""");
        Content visible = Child(harness, "Visible", """{"date":"2026-08-15T11:00:00"}""");
        harness.Permissions.Allowed[ActionBrowse.ActionLetter] = [ParentKey, visible.Key];
        _ = hidden;

        KanbanCalendarResult result = await harness.Service.GetCalendarAsync(Request(), User);

        result.Calendar!.Items.Select(i => i.Card.Name).Should().Equal("Visible");
    }

    [Fact]
    public async Task Caps_the_items_and_flags_truncation()
    {
        Harness harness = Configured();
        for (var i = 0; i < Constants.DefaultCalendarCap + 5; i++)
        {
            Child(harness, $"Item {i:D4}", """{"date":"2026-08-15T10:00:00"}""");
        }

        KanbanCalendarResult result = await harness.Service.GetCalendarAsync(Request(), User);

        result.Calendar!.Items.Should().HaveCount(Constants.DefaultCalendarCap);
        result.Calendar.Truncated.Should().BeTrue();
    }
}
