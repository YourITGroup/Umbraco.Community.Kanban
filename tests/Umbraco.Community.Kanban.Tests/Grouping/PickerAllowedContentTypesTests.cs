using System.Text.Json;
using System.Text.Json.Nodes;
using Umbraco.Community.Kanban.Grouping;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Grouping;

public class PickerAllowedContentTypesTests
{
    private static readonly Guid RoomType = Guid.Parse("aaaaaaaa-1111-1111-1111-111111111111");
    private static readonly Guid DeskType = Guid.Parse("bbbbbbbb-2222-2222-2222-222222222222");

    private static KanbanGroupSourceContext Context(string editorAlias, params (string Key, object Value)[] configuration) =>
        new(editorAlias, configuration.ToDictionary(entry => entry.Key, entry => entry.Value), new KanbanBoardConfiguration());

    [Fact]
    public void Reads_the_document_pickers_allowed_types()
    {
        KanbanGroupSourceContext context = Context(
            "Umbraco.ContentPicker",
            ("allowedContentTypes", $"{RoomType},{DeskType}"));

        PickerAllowedContentTypes.Read(context).Should().Equal(RoomType, DeskType);
    }

    [Fact]
    public void Reads_the_tree_pickers_filter()
    {
        KanbanGroupSourceContext context = Context("Umbraco.MultiNodeTreePicker", ("filter", RoomType.ToString()));

        PickerAllowedContentTypes.Read(context).Should().Equal(RoomType);
    }

    [Fact]
    public void Reads_a_value_that_deserialised_as_a_json_element()
    {
        // The configuration dictionary comes from a JSON deserialisation into object, so a scalar
        // arrives boxed rather than as a string.
        using JsonDocument document = JsonDocument.Parse($"\"{RoomType}\"");

        KanbanGroupSourceContext context = Context(
            "Umbraco.ContentPicker",
            ("allowedContentTypes", document.RootElement.Clone()));

        PickerAllowedContentTypes.Read(context).Should().Equal(RoomType);
    }

    [Fact]
    public void An_unrestricted_picker_allows_nothing_rather_than_everything()
    {
        PickerAllowedContentTypes.Read(Context("Umbraco.ContentPicker")).Should().BeEmpty();
        PickerAllowedContentTypes.Read(Context("Umbraco.ContentPicker", ("allowedContentTypes", ""))).Should().BeEmpty();
    }

    [Fact]
    public void Ignores_entries_that_are_not_keys_and_de_duplicates()
    {
        KanbanGroupSourceContext context = Context(
            "Umbraco.ContentPicker",
            ("allowedContentTypes", $"{RoomType}, meetingRoom , {RoomType}, {DeskType}"));

        PickerAllowedContentTypes.Read(context).Should().Equal(RoomType, DeskType);
    }

    [Fact]
    public void An_unsupported_editor_allows_nothing()
    {
        KanbanGroupSourceContext context = Context("Umbraco.DropDown.Flexible", ("filter", RoomType.ToString()));

        PickerAllowedContentTypes.Read(context).Should().BeEmpty();
    }

    [Theory]
    [InlineData("content")]
    [InlineData("Content")]
    public void A_tree_picker_rooted_in_content_is_read(string objectType)
    {
        KanbanGroupSourceContext context = Context(
            "Umbraco.MultiNodeTreePicker",
            ("filter", RoomType.ToString()),
            ("startNode", JsonNode.Parse($"{{\"type\":\"{objectType}\"}}")!));

        PickerAllowedContentTypes.Read(context).Should().Equal(RoomType);
    }

    [Theory]
    [InlineData("media")]
    [InlineData("member")]
    public void A_tree_picker_rooted_elsewhere_allows_nothing(string objectType)
    {
        // The filter then holds media or member type keys, which are not documents.
        KanbanGroupSourceContext context = Context(
            "Umbraco.MultiNodeTreePicker",
            ("filter", RoomType.ToString()),
            ("startNode", JsonNode.Parse($"{{\"type\":\"{objectType}\"}}")!));

        PickerAllowedContentTypes.Read(context).Should().BeEmpty();
    }

    [Fact]
    public void A_start_node_deserialised_as_a_json_element_is_understood()
    {
        using JsonDocument document = JsonDocument.Parse("""{"type":"media"}""");

        KanbanGroupSourceContext context = Context(
            "Umbraco.MultiNodeTreePicker",
            ("filter", RoomType.ToString()),
            ("startNode", document.RootElement.Clone()));

        PickerAllowedContentTypes.Read(context).Should().BeEmpty();
    }

    [Fact]
    public void A_start_node_without_a_type_is_treated_as_content()
    {
        KanbanGroupSourceContext context = Context(
            "Umbraco.MultiNodeTreePicker",
            ("filter", RoomType.ToString()),
            ("startNode", JsonNode.Parse("""{"id":"1234"}""")!));

        PickerAllowedContentTypes.Read(context).Should().Equal(RoomType);
    }
}
