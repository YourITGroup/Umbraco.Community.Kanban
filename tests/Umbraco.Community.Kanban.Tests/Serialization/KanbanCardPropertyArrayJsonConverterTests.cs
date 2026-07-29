using System.Text.Json;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Serialization;

namespace Umbraco.Community.Kanban.Tests.Serialization;

public class KanbanCardPropertyArrayJsonConverterTests
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new KanbanCardPropertyArrayJsonConverter() },
    };

    private static KanbanCardProperty[] Read(string json) =>
        JsonSerializer.Deserialize<KanbanCardProperty[]>(json, Options)!;

    [Fact]
    public void Read_AcceptsTheOldArrayOfAliases()
    {
        // Every board configured before card properties gained headers and templates stores this.
        var properties = Read("""["status","company"]""");

        properties.Select(x => x.Alias).Should().Equal("status", "company");
        properties.Should().OnlyContain(x => x.Header == null && x.NameTemplate == null && x.IsSystem == 0);
    }

    [Fact]
    public void Read_AcceptsTheNewArrayOfObjects()
    {
        var properties = Read(
            """[{"alias":"bookingOwner","header":"Owner","nameTemplate":"{umbMemberName: value}","isSystem":0}]""");

        var property = properties.Should().ContainSingle().Subject;
        property.Alias.Should().Be("bookingOwner");
        property.Header.Should().Be("Owner");
        property.NameTemplate.Should().Be("{umbMemberName: value}");
        property.IsSystem.Should().Be(0);
    }

    [Fact]
    public void Read_AcceptsAMixtureOfBothShapes()
    {
        // What a board looks like mid-migration: an alias added before the change, an object after.
        var properties = Read("""["status",{"alias":"updateDate","header":"Last edited","isSystem":1}]""");

        properties.Select(x => x.Alias).Should().Equal("status", "updateDate");
        properties[1].IsSystem.Should().Be(1);
    }

    [Fact]
    public void Read_SkipsAnEntryThatCannotNameAProperty()
    {
        // A card missing one summary item is recoverable; a failed configuration deserialisation takes
        // every setting on the board with it.
        var properties = Read("""["status",42,null,true,[],{"header":"No alias"},"",{"alias":"  "},"company"]""");

        properties.Select(x => x.Alias).Should().Equal("status", "company");
    }

    [Fact]
    public void Read_AcceptsAWholeArrayStoredAsAJsonString()
    {
        var properties = Read("""  "[\"status\"]"  """);

        properties.Select(x => x.Alias).Should().Equal("status");
    }

    [Fact]
    public void Read_ReportsNothingForAStringThatIsNotJson()
    {
        Read("\"not json\"").Should().BeEmpty();
    }

    [Theory]
    [InlineData("null")]
    [InlineData("[]")]
    [InlineData("\"\"")]
    [InlineData("42")]
    [InlineData("{}")]
    public void Read_ReportsNothingForAValueItCannotRead(string json)
    {
        Read(json).Should().BeEmpty();
    }

    [Fact]
    public void Write_ProducesTheNewShapeOnly()
    {
        // The old shape is read, never written: a board converts on the next save of its data type.
        var json = JsonSerializer.Serialize<KanbanCardProperty[]>(
            [new KanbanCardProperty { Alias = "status", Header = "Status" }],
            Options);

        json.Should().Contain("\"Alias\":\"status\"").And.Contain("\"Header\":\"Status\"");
    }
}
