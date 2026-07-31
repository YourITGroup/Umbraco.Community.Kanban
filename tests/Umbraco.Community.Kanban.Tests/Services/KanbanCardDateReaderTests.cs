using Umbraco.Cms.Core.Models;
using Umbraco.Community.Kanban.Services;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanCardDateReaderTests
{
    private static readonly FakeShortStringHelper ShortStrings = new();

    /// <summary>
    /// The deprecated Umbraco.DateTime stores a DateTime in a Date column; the modern editors store
    /// JSON strings in Ntext — so the storage type follows the value the test stores.
    /// </summary>
    private static Content ContentWith(string alias, object? value)
    {
        var contentType = new ContentType(ShortStrings, -1)
        {
            Alias = "booking",
            Name = "Booking",
            Variations = ContentVariation.Nothing,
        };

        ValueStorageType storage = value is DateTime ? ValueStorageType.Date : ValueStorageType.Ntext;

        contentType.AddPropertyType(new PropertyType(ShortStrings, "Umbraco.DateTime", storage, alias)
        {
            Name = alias,
            Variations = ContentVariation.Nothing,
        });

        var content = new Content("A booking", -1, contentType);
        content.SetValue(alias, value);
        return content;
    }

    [Fact]
    public void Reads_update_date_from_the_content_itself()
    {
        var content = ContentWith("start", null);
        content.UpdateDate = new DateTime(2026, 8, 15, 9, 30, 0);

        KanbanCardDate? result = KanbanCardDateReader.Read(content, "updateDate", culture: null);

        result.Should().Be(new KanbanCardDate(new DateOnly(2026, 8, 15), new TimeOnly(9, 30)));
    }

    [Fact]
    public void Reads_create_date_from_the_content_itself()
    {
        var content = ContentWith("start", null);
        content.CreateDate = new DateTime(2026, 8, 1, 0, 0, 0);

        KanbanCardDate? result = KanbanCardDateReader.Read(content, "createDate", culture: null);

        result.Should().Be(new KanbanCardDate(new DateOnly(2026, 8, 1), null));
    }

    [Fact]
    public void Reads_a_legacy_datetime_object_value()
    {
        var content = ContentWith("start", new DateTime(2026, 8, 15, 9, 0, 0));

        KanbanCardDate? result = KanbanCardDateReader.Read(content, "start", culture: null);

        result.Should().Be(new KanbanCardDate(new DateOnly(2026, 8, 15), new TimeOnly(9, 0)));
    }

    [Fact]
    public void Reads_a_modern_json_value_with_the_moment_it_names()
    {
        // A named zone means the client can place the booking in the viewer's zone, exactly as the
        // board's value summary already renders it. The wall clock still reads as stored, so a
        // client that ignores the instant behaves as it did before.
        var content = ContentWith("start", """{"date":"2026-08-15T09:00:00+10:00","timeZone":"Australia/Sydney"}""");

        KanbanCardDate? result = KanbanCardDateReader.Read(content, "start", culture: null);

        result.Should().Be(new KanbanCardDate(
            new DateOnly(2026, 8, 15),
            new TimeOnly(9, 0),
            new DateTimeOffset(2026, 8, 15, 9, 0, 0, TimeSpan.FromHours(10))));
    }

    [Fact]
    public void Reads_a_json_value_without_timezone_as_a_bare_wall_clock()
    {
        // No zone was recorded, so there is no moment to carry and nothing to convert.
        var content = ContentWith("start", """{"date":"2026-08-15T14:15:00"}""");

        KanbanCardDate? result = KanbanCardDateReader.Read(content, "start", culture: null);

        result.Should().Be(new KanbanCardDate(new DateOnly(2026, 8, 15), new TimeOnly(14, 15)));
        result!.Value.Instant.Should().BeNull();
    }

    [Fact]
    public void Reads_a_utc_system_date_with_the_moment_it_names()
    {
        var content = ContentWith("start", null);
        content.UpdateDate = new DateTime(2026, 8, 15, 23, 30, 0, DateTimeKind.Utc);

        KanbanCardDate? result = KanbanCardDateReader.Read(content, "updateDate", culture: null);

        result.Should().Be(new KanbanCardDate(
            new DateOnly(2026, 8, 15),
            new TimeOnly(23, 30),
            new DateTimeOffset(2026, 8, 15, 23, 30, 0, TimeSpan.Zero)));
    }

    [Fact]
    public void Reads_a_plain_string_with_an_offset_with_the_moment_it_names()
    {
        var content = ContentWith("start", "2026-08-15T09:00:00+10:00");

        KanbanCardDate? result = KanbanCardDateReader.Read(content, "start", culture: null);

        result.Should().Be(new KanbanCardDate(
            new DateOnly(2026, 8, 15),
            new TimeOnly(9, 0),
            new DateTimeOffset(2026, 8, 15, 9, 0, 0, TimeSpan.FromHours(10))));
    }

    [Fact]
    public void Midnight_reads_as_date_only()
    {
        var content = ContentWith("start", """{"date":"2026-08-15T00:00:00"}""");

        KanbanCardDate? result = KanbanCardDateReader.Read(content, "start", culture: null);

        result.Should().Be(new KanbanCardDate(new DateOnly(2026, 8, 15), null));
    }

    [Fact]
    public void Reads_a_plain_datetime_string_value()
    {
        // Defensive: some migrated data stores the invariant string rather than JSON or DateTime.
        var content = ContentWith("start", "2026-08-15 09:00:00");

        KanbanCardDate? result = KanbanCardDateReader.Read(content, "start", culture: null);

        result.Should().Be(new KanbanCardDate(new DateOnly(2026, 8, 15), new TimeOnly(9, 0)));
        result!.Value.Instant.Should().BeNull();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("not a date")]
    [InlineData("""{"noDate":true}""")]
    public void Missing_or_unparseable_values_read_as_null(object? value)
    {
        var content = ContentWith("start", value);

        KanbanCardDateReader.Read(content, "start", culture: null).Should().BeNull();
    }

    [Fact]
    public void A_property_the_content_does_not_have_reads_as_null()
    {
        var content = ContentWith("start", new DateTime(2026, 8, 15));

        KanbanCardDateReader.Read(content, "missing", culture: null).Should().BeNull();
    }
}
