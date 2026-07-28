using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanCardMapperTests
{
    private static readonly FakeShortStringHelper ShortStrings = new();

    private static ContentType ContentTypeWith(ContentVariation variations, params (string Alias, ContentVariation Variations)[] properties)
    {
        var contentType = new ContentType(ShortStrings, -1)
        {
            Alias = "task",
            Name = "Task",
            Icon = "icon-checkbox color-green",
            Variations = variations,
        };

        foreach ((string alias, ContentVariation propertyVariations) in properties)
        {
            contentType.AddPropertyType(new PropertyType(ShortStrings, "Umbraco.TextBox", ValueStorageType.Nvarchar, alias)
            {
                Name = alias,
                Variations = propertyVariations,
            });
        }

        return contentType;
    }

    [Fact]
    public void Maps_identity_from_the_document()
    {
        ContentType contentType = ContentTypeWith(ContentVariation.Nothing);
        var content = new Content("Write the spec", -1, contentType);

        KanbanCardModel card = KanbanCardMapper.Map(content, [], culture: null, canUpdate: true);

        card.Key.Should().Be(content.Key);
        card.Name.Should().Be("Write the spec");
        card.ContentTypeAlias.Should().Be("task");
        card.CanUpdate.Should().BeTrue();
    }

    [Fact]
    public void Passes_the_content_type_icon_through_untouched()
    {
        var content = new Content("A", -1, ContentTypeWith(ContentVariation.Nothing));

        KanbanCardMapper.Map(content, [], null, false).Icon
            .Should().Be("icon-checkbox color-green");
    }

    [Fact]
    public void Reports_state_from_the_published_and_edited_flags()
    {
        var content = new Content("A", -1, ContentTypeWith(ContentVariation.Nothing))
        {
            Published = true,
            Edited = true,
        };

        KanbanCardMapper.Map(content, [], null, false).State
            .Should().Be(KanbanCardStates.PublishedPendingChanges);
    }

    [Fact]
    public void Emits_configured_properties_in_configured_order()
    {
        ContentType contentType = ContentTypeWith(
            ContentVariation.Nothing,
            ("status", ContentVariation.Nothing),
            ("owner", ContentVariation.Nothing));
        var content = new Content("A", -1, contentType);
        content.SetValue("status", "doing");
        content.SetValue("owner", "robert");

        KanbanCardModel card = KanbanCardMapper.Map(content, ["owner", "status"], null, false);

        card.Properties.Select(p => p.Alias).Should().Equal("owner", "status");
        card.Properties.Select(p => p.Value).Should().Equal("robert", "doing");
    }

    [Fact]
    public void Reports_the_property_editor_schema_alias_and_name()
    {
        ContentType contentType = ContentTypeWith(ContentVariation.Nothing, ("status", ContentVariation.Nothing));
        var content = new Content("A", -1, contentType);
        content.SetValue("status", "doing");

        KanbanCardPropertyModel property = KanbanCardMapper.Map(content, ["status"], null, false).Properties.Single();

        property.EditorAlias.Should().Be("Umbraco.TextBox");
        property.Name.Should().Be("status");
    }

    [Fact]
    public void Skips_aliases_the_document_does_not_have()
    {
        ContentType contentType = ContentTypeWith(ContentVariation.Nothing, ("status", ContentVariation.Nothing));
        var content = new Content("A", -1, contentType);

        KanbanCardMapper.Map(content, ["status", "nope"], null, false).Properties
            .Select(p => p.Alias).Should().Equal("status");
    }

    [Fact]
    public void Reads_a_varying_property_for_the_requested_culture()
    {
        ContentType contentType = ContentTypeWith(ContentVariation.Culture, ("status", ContentVariation.Culture));
        var content = new Content("A", -1, contentType);
        content.SetCultureName("A", "en-US");
        content.SetCultureName("A", "da-DK");
        content.SetValue("status", "doing", "en-US");
        content.SetValue("status", "i gang", "da-DK");

        KanbanCardMapper.Map(content, ["status"], "da-DK", false).Properties.Single().Value
            .Should().Be("i gang");
    }

    [Fact]
    public void Reads_an_invariant_property_invariantly_even_when_a_culture_is_requested()
    {
        ContentType contentType = ContentTypeWith(ContentVariation.Culture, ("status", ContentVariation.Nothing));
        var content = new Content("A", -1, contentType);
        content.SetCultureName("A", "en-US");
        content.SetValue("status", "doing");

        KanbanCardMapper.Map(content, ["status"], "en-US", false).Properties.Single().Value
            .Should().Be("doing");
    }
}
