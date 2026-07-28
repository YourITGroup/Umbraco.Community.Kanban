using System.Text.Json;
using System.Text.Json.Nodes;

namespace Umbraco.Community.Kanban.Contentment.Tests;

public class ContentmentDataListConfigurationTests
{
    private const string EnumSourceKey =
        "Umbraco.Community.Contentment.DataEditors.EnumDataListSource, Umbraco.Community.Contentment";

    // A property, not a const: a raw interpolated string is not usable as a compile-time constant here.
    private static string CanonicalJson =>
        $$"""[ { "key": "{{EnumSourceKey}}", "value": { "enumType": [ "Bookings", "Bookings.BookingStatus" ] } } ]""";

    /// <summary>The shape Umbraco hands over: IDataType.ConfigurationData with JsonNode values.</summary>
    private static Dictionary<string, object> Canonical() =>
        new() { ["dataSource"] = JsonNode.Parse(CanonicalJson)! };

    [Fact]
    public void TryRead_ReadsTheKeyAndValueFromTheCanonicalShape()
    {
        var read = ContentmentDataListConfiguration.TryRead(Canonical(), out var reference);

        read.Should().BeTrue();
        reference!.Key.Should().Be(EnumSourceKey);
        reference.ValueJson.Should().Contain("enumType");
    }

    [Fact]
    public void TryRead_ReadsAValueThatArrivedAsJsonElement()
    {
        // What a configuration that has been through a System.Text.Json round trip looks like.
        var roundTripped = JsonSerializer.Deserialize<Dictionary<string, object>>(
            $$"""{ "dataSource": {{CanonicalJson}} }""")!;

        var read = ContentmentDataListConfiguration.TryRead(roundTripped, out var reference);

        read.Should().BeTrue();
        reference!.Key.Should().Be(EnumSourceKey);
        reference.ValueJson.Should().Contain("enumType");
    }

    [Fact]
    public void TryRead_ReadsAValueThatArrivedAsPlainClrObjects()
    {
        IDictionary<string, object> configuration = new Dictionary<string, object>
        {
            ["dataSource"] = new List<Dictionary<string, object>>
            {
                new() { ["key"] = EnumSourceKey, ["value"] = new Dictionary<string, object> { ["enumType"] = "x" } },
            },
        };

        var read = ContentmentDataListConfiguration.TryRead(configuration, out var reference);

        read.Should().BeTrue();
        reference!.Key.Should().Be(EnumSourceKey);
        reference.ValueJson.Should().Contain("enumType");
    }

    [Fact]
    public void TryRead_ReadsAValueThatArrivedAsAJsonString()
    {
        IDictionary<string, object> configuration = new Dictionary<string, object> { ["dataSource"] = CanonicalJson };

        var read = ContentmentDataListConfiguration.TryRead(configuration, out var reference);

        read.Should().BeTrue();
        reference!.Key.Should().Be(EnumSourceKey);
    }

    [Fact]
    public void TryRead_AcceptsASingleObjectInsteadOfAnArray()
    {
        IDictionary<string, object> configuration = new Dictionary<string, object>
        {
            ["dataSource"] = JsonNode.Parse($$"""{ "key": "{{EnumSourceKey}}" }""")!,
        };

        ContentmentDataListConfiguration.TryRead(configuration, out var reference).Should().BeTrue();
        reference!.Key.Should().Be(EnumSourceKey);
    }

    [Fact]
    public void TryRead_DefaultsAMissingValueToAnEmptyObject()
    {
        // Contentment's own code does the same (`obj["value"]?.ToString() ?? "{}"`): a source with no
        // configuration of its own still has to be handed a dictionary.
        IDictionary<string, object> configuration = new Dictionary<string, object>
        {
            ["dataSource"] = JsonNode.Parse($$"""[ { "key": "{{EnumSourceKey}}" } ]""")!,
        };

        ContentmentDataListConfiguration.TryRead(configuration, out var reference).Should().BeTrue();
        reference!.ValueJson.Should().Be("{}");
    }

    [Fact]
    public void TryRead_TakesTheFirstEntry_AsEverywhereElseInTheLanePipeline()
    {
        IDictionary<string, object> configuration = new Dictionary<string, object>
        {
            ["dataSource"] = JsonNode.Parse("""[ { "key": "first" }, { "key": "second" } ]""")!,
        };

        ContentmentDataListConfiguration.TryRead(configuration, out var reference).Should().BeTrue();
        reference!.Key.Should().Be("first");
    }

    [Theory]
    [InlineData("""{ "notADataSource": 1 }""")]
    [InlineData("""{ "dataSource": [] }""")]
    [InlineData("""{ "dataSource": [ { "notAKey": 1 } ] }""")]
    [InlineData("""{ "dataSource": [ { "key": "" } ] }""")]
    [InlineData("""{ "dataSource": [ { "key": "   " } ] }""")]
    [InlineData("""{ "dataSource": 42 }""")]
    [InlineData("""{ "dataSource": null }""")]
    public void TryRead_ReportsNothingForAConfigurationItCannotRead(string json)
    {
        // No lanes is recoverable; an exception out of GET /board is not.
        var configuration = JsonSerializer.Deserialize<Dictionary<string, object>>(json)!;

        ContentmentDataListConfiguration.TryRead(configuration, out var reference).Should().BeFalse();
        reference.Should().BeNull();
    }

    [Fact]
    public void TryRead_ReportsNothingForAStringThatIsNotJson()
    {
        IDictionary<string, object> configuration = new Dictionary<string, object> { ["dataSource"] = "not json" };

        ContentmentDataListConfiguration.TryRead(configuration, out var reference).Should().BeFalse();
        reference.Should().BeNull();
    }

    [Fact]
    public void TryRead_ReportsNothingForNoConfigurationAtAll()
    {
        ContentmentDataListConfiguration.TryRead(null, out var reference).Should().BeFalse();
        reference.Should().BeNull();
    }
}
