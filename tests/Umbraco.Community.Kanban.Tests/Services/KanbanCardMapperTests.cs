using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Models;
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

        KanbanCardModel card = KanbanCardMapper.Map(content, [], culture: null, canUpdate: true, valueReader: FakePropertyValueReader.Stored());

        card.Key.Should().Be(content.Key);
        card.Name.Should().Be("Write the spec");
        card.ContentTypeAlias.Should().Be("task");
        card.CanUpdate.Should().BeTrue();
    }

    [Fact]
    public void Passes_the_content_type_icon_through_untouched()
    {
        var content = new Content("A", -1, ContentTypeWith(ContentVariation.Nothing));

        KanbanCardMapper.Map(content, [], null, false, FakePropertyValueReader.Stored()).Icon
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

        KanbanCardMapper.Map(content, [], null, false, FakePropertyValueReader.Stored()).State
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

        KanbanCardModel card = KanbanCardMapper.Map(content, CardPropertyList.Of("owner", "status"), null, false, FakePropertyValueReader.Stored());

        card.Properties.Select(p => p.Alias).Should().Equal("owner", "status");
        card.Properties.Select(p => p.Value).Should().Equal("robert", "doing");
    }

    [Fact]
    public void Reports_the_property_editor_schema_alias_and_name()
    {
        ContentType contentType = ContentTypeWith(ContentVariation.Nothing, ("status", ContentVariation.Nothing));
        var content = new Content("A", -1, contentType);
        content.SetValue("status", "doing");

        KanbanCardPropertyModel property = KanbanCardMapper.Map(content, CardPropertyList.Of("status"), null, false, FakePropertyValueReader.Stored()).Properties.Single();

        property.EditorAlias.Should().Be("Umbraco.TextBox");
        property.Name.Should().Be("status");
    }

    [Fact]
    public void Skips_aliases_the_document_does_not_have()
    {
        ContentType contentType = ContentTypeWith(ContentVariation.Nothing, ("status", ContentVariation.Nothing));
        var content = new Content("A", -1, contentType);

        KanbanCardMapper.Map(content, CardPropertyList.Of("status", "nope"), null, false, FakePropertyValueReader.Stored()).Properties
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

        KanbanCardMapper.Map(content, CardPropertyList.Of("status"), "da-DK", false, FakePropertyValueReader.Stored()).Properties.Single().Value
            .Should().Be("i gang");
    }

    [Fact]
    public void Reads_an_invariant_property_invariantly_even_when_a_culture_is_requested()
    {
        ContentType contentType = ContentTypeWith(ContentVariation.Culture, ("status", ContentVariation.Nothing));
        var content = new Content("A", -1, contentType);
        content.SetCultureName("A", "en-US");
        content.SetValue("status", "doing");

        KanbanCardMapper.Map(content, CardPropertyList.Of("status"), "en-US", false, FakePropertyValueReader.Stored()).Properties.Single().Value
            .Should().Be("doing");
    }

    [Fact]
    public void Sends_the_editor_value_rather_than_the_stored_one()
    {
        // The client renders a card property through umb-value-summary-extension, which picks a
        // renderer by editor alias and hands it the value. Those renderers expect the *editor* value:
        // Umbraco.DateTimeWithTimeZone stores JSON and its summary reads value.date, so sending the
        // stored string rendered nothing at all.
        ContentType contentType = ContentTypeWith(ContentVariation.Nothing, ("startDate", ContentVariation.Nothing));
        var content = new Content("A", -1, contentType);
        content.SetValue("startDate", """{"date":"2026-08-26T10:30:00+10:00","timeZone":"Australia/Sydney"}""");

        var editorValue = new Dictionary<string, object?>
        {
            ["date"] = "2026-08-26T10:30:00+10:00",
            ["timeZone"] = "Australia/Sydney",
        };

        KanbanCardPropertyModel property = KanbanCardMapper.Map(
            content,
            CardPropertyList.Of("startDate"),
            null,
            false,
            FakePropertyValueReader.Stored().Returning("startDate", editorValue)).Properties.Single();

        property.Value.Should().BeSameAs(editorValue);
    }

    [Fact]
    public void Reads_the_editor_value_for_the_culture_the_property_varies_by()
    {
        ContentType contentType = ContentTypeWith(ContentVariation.Culture, ("status", ContentVariation.Culture));
        var content = new Content("A", -1, contentType);
        content.SetCultureName("A", "da-DK");
        content.SetValue("status", "i gang", "da-DK");

        var reader = FakePropertyValueReader.Stored();

        KanbanCardMapper.Map(content, CardPropertyList.Of("status"), "da-DK", false, reader);

        reader.RequestedCulture.Should().Be("da-DK");
    }

    [Fact]
    public void Uses_the_configured_header_as_the_property_name()
    {
        ContentType contentType = ContentTypeWith(ContentVariation.Nothing, ("bookingOwner", ContentVariation.Nothing));
        var content = new Content("A", -1, contentType);

        KanbanCardPropertyModel property = KanbanCardMapper.Map(
            content,
            [new KanbanCardProperty { Alias = "bookingOwner", Header = "Owner" }],
            null, false, FakePropertyValueReader.Stored()).Properties.Single();

        property.Name.Should().Be("Owner");
    }

    [Fact]
    public void Falls_back_to_the_propertys_own_name_when_no_header_is_configured()
    {
        ContentType contentType = ContentTypeWith(ContentVariation.Nothing, ("bookingOwner", ContentVariation.Nothing));
        var content = new Content("A", -1, contentType);

        KanbanCardMapper.Map(
            content,
            [new KanbanCardProperty { Alias = "bookingOwner", Header = "   " }],
            null, false, FakePropertyValueReader.Stored()).Properties.Single().Name.Should().Be("bookingOwner");
    }

    [Fact]
    public void Carries_the_label_template_untouched_for_the_client_to_render()
    {
        // UFM is resolved by the backoffice's own renderer; the server only carries the template.
        ContentType contentType = ContentTypeWith(ContentVariation.Nothing, ("recurring", ContentVariation.Nothing));
        var content = new Content("A", -1, contentType);

        KanbanCardMapper.Map(
            content,
            [new KanbanCardProperty { Alias = "recurring", NameTemplate = "${ value ? 'Yes' : 'No' }" }],
            null, false, FakePropertyValueReader.Stored()).Properties.Single().NameTemplate.Should().Be("${ value ? 'Yes' : 'No' }");
    }

    [Fact]
    public void Reads_the_update_date_as_a_system_property()
    {
        var content = new Content("A", -1, ContentTypeWith(ContentVariation.Nothing))
        {
            UpdateDate = new DateTime(2026, 7, 29, 10, 30, 0, DateTimeKind.Utc),
        };

        KanbanCardPropertyModel property = KanbanCardMapper.Map(
            content,
            [CardPropertyList.System("updateDate")],
            null, false, FakePropertyValueReader.Stored()).Properties.Single();

        property.Value.Should().Be(content.UpdateDate);
        property.Name.Should().Be("Last edited");

        // Not a claim about a data type — a system field has none. It names the renderer the client
        // should use for the value.
        property.EditorAlias.Should().Be("Umbraco.DateTime");
    }

    [Theory]
    [InlineData("createDate", "Created", "Umbraco.DateTime")]
    [InlineData("updateDate", "Last edited", "Umbraco.DateTime")]
    [InlineData("creator", "Creator", "Umbraco.Integer")]
    [InlineData("sortOrder", "Sort order", "Umbraco.Integer")]
    [InlineData("published", "Published", "Umbraco.TrueFalse")]
    public void Maps_every_system_property_it_offers(string alias, string header, string editorAlias)
    {
        var content = new Content("A", -1, ContentTypeWith(ContentVariation.Nothing));

        KanbanCardPropertyModel property = KanbanCardMapper.Map(
            content,
            [CardPropertyList.System(alias)],
            null, false, FakePropertyValueReader.Stored()).Properties.Single();

        property.Alias.Should().Be(alias);
        property.Name.Should().Be(header);
        property.EditorAlias.Should().Be(editorAlias);
    }

    [Fact]
    public void Prefers_the_configured_header_over_a_system_propertys_default_label()
    {
        var content = new Content("A", -1, ContentTypeWith(ContentVariation.Nothing));

        KanbanCardMapper.Map(
            content,
            [CardPropertyList.System("updateDate", "Touched")],
            null, false, FakePropertyValueReader.Stored()).Properties.Single().Name.Should().Be("Touched");
    }

    [Fact]
    public void Distinguishes_a_system_field_from_a_content_property_of_the_same_alias()
    {
        // Why IsSystem is stored rather than derived: a content type may declare "published" itself,
        // and only the editor who added the row knows which was meant.
        ContentType contentType = ContentTypeWith(ContentVariation.Nothing, ("published", ContentVariation.Nothing));
        var content = new Content("A", -1, contentType);
        content.SetValue("published", "the property, not the flag");

        KanbanCardMapper.Map(content, [CardPropertyList.System("published")], null, false, FakePropertyValueReader.Stored())
            .Properties.Single().Value.Should().Be(false);

        KanbanCardMapper.Map(content, CardPropertyList.Of("published"), null, false, FakePropertyValueReader.Stored())
            .Properties.Single().Value.Should().Be("the property, not the flag");
    }

    [Fact]
    public void Maps_the_content_type_key_so_the_client_can_resolve_allowed_child_types()
    {
        ContentType contentType = ContentTypeWith(ContentVariation.Nothing);
        var content = new Content("A", -1, contentType);

        KanbanCardMapper.Map(content, [], null, false, FakePropertyValueReader.Stored()).ContentTypeKey
            .Should().Be(contentType.Key);
    }

    [Fact]
    public void Reports_no_create_permission_and_no_children_by_default()
    {
        var content = new Content("A", -1, ContentTypeWith(ContentVariation.Nothing));

        KanbanCardModel card = KanbanCardMapper.Map(content, [], null, false, FakePropertyValueReader.Stored());

        card.CanCreate.Should().BeFalse();
        card.Children.Should().BeEmpty();
        card.ChildTotal.Should().Be(0);
        card.ChildTotalIsExact.Should().BeTrue();
    }

    [Fact]
    public void Carries_create_permission_and_children_when_given_them()
    {
        var content = new Content("A", -1, ContentTypeWith(ContentVariation.Nothing));
        var children = new KanbanCardChildren(
            [new KanbanCardChildModel { Key = Guid.NewGuid(), Name = "Line 1", Icon = "icon-receipt" }],
            Total: 4,
            TotalIsExact: false);

        KanbanCardModel card = KanbanCardMapper.Map(
            content, [], null, false, FakePropertyValueReader.Stored(), canCreate: true, children: children);

        card.CanCreate.Should().BeTrue();
        card.Children.Single().Name.Should().Be("Line 1");
        card.ChildTotal.Should().Be(4);
        card.ChildTotalIsExact.Should().BeFalse();
    }

    [Fact]
    public void Skips_a_system_flagged_alias_that_names_no_system_field()
    {
        // A hand-edited configuration, or one whose alias was renamed. A missing summary item beats a
        // failed board.
        var content = new Content("A", -1, ContentTypeWith(ContentVariation.Nothing));

        KanbanCardMapper.Map(content, [CardPropertyList.System("nonsense")], null, false, FakePropertyValueReader.Stored())
            .Properties.Should().BeEmpty();
    }
}
