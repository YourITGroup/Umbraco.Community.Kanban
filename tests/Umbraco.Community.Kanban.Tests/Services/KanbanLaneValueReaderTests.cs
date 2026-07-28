using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Services;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanLaneValueReaderTests
{
    private static readonly FakeShortStringHelper ShortStrings = new();

    private static Content Content(ContentVariation contentVariations, ContentVariation propertyVariations)
    {
        var contentType = new ContentType(ShortStrings, -1)
        {
            Alias = "task",
            Name = "Task",
            Variations = contentVariations,
        };

        contentType.AddPropertyType(new PropertyType(ShortStrings, "Umbraco.TextBox", ValueStorageType.Nvarchar, "status")
        {
            Name = "Status",
            Variations = propertyVariations,
        });

        return new Content("A", -1, contentType);
    }

    [Fact]
    public void Reads_an_invariant_lane_value()
    {
        Content content = Content(ContentVariation.Nothing, ContentVariation.Nothing);
        content.SetValue("status", "doing");

        KanbanLaneValueReader.Read(content, "status", null).Should().Be("doing");
    }

    [Fact]
    public void Reads_a_varying_lane_value_for_the_requested_culture()
    {
        Content content = Content(ContentVariation.Culture, ContentVariation.Culture);
        content.SetCultureName("A", "en-US");
        content.SetCultureName("A", "da-DK");
        content.SetValue("status", "doing", "en-US");
        content.SetValue("status", "i gang", "da-DK");

        KanbanLaneValueReader.Read(content, "status", "da-DK").Should().Be("i gang");
    }

    [Fact]
    public void Ignores_the_culture_for_an_invariant_property()
    {
        Content content = Content(ContentVariation.Culture, ContentVariation.Nothing);
        content.SetCultureName("A", "en-US");
        content.SetValue("status", "doing");

        KanbanLaneValueReader.Read(content, "status", "en-US").Should().Be("doing");
    }

    [Fact]
    public void Returns_empty_when_the_value_is_not_set()
    {
        Content content = Content(ContentVariation.Nothing, ContentVariation.Nothing);

        KanbanLaneValueReader.Read(content, "status", null).Should().BeEmpty();
    }

    [Fact]
    public void Returns_empty_when_the_property_does_not_exist()
    {
        Content content = Content(ContentVariation.Nothing, ContentVariation.Nothing);

        KanbanLaneValueReader.Read(content, "nope", null).Should().BeEmpty();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void Returns_empty_when_there_is_no_lane_property_configured(string? laneProperty)
    {
        Content content = Content(ContentVariation.Nothing, ContentVariation.Nothing);
        content.SetValue("status", "doing");

        KanbanLaneValueReader.Read(content, laneProperty, null).Should().BeEmpty();
    }

    [Fact]
    public void Stringifies_a_non_string_value()
    {
        Content content = Content(ContentVariation.Nothing, ContentVariation.Nothing);
        content.SetValue("status", 3);

        KanbanLaneValueReader.Read(content, "status", null).Should().Be("3");
    }
}
