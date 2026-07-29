using Umbraco.Cms.Core.Models;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanCardChildAssemblerTests
{
    private static readonly FakeShortStringHelper ShortStrings = new();

    private static ContentType LineItemType(ContentVariation variations = ContentVariation.Nothing) =>
        new(ShortStrings, -1)
        {
            Alias = "lineItem",
            Name = "Line item",
            Icon = "icon-receipt color-blue",
            Variations = variations,
        };

    /// <param name="parentId">The card's integer id — what the assembler groups by.</param>
    private static Content Child(string name, int parentId, ContentType? contentType = null) =>
        new(name, parentId, contentType ?? LineItemType()) { Key = Guid.NewGuid() };

    private static ISet<Guid> All(params IContent[] content) => content.Select(c => c.Key).ToHashSet();

    [Fact]
    public void Groups_children_under_the_card_they_belong_to()
    {
        Content first = Child("A", 10);
        Content second = Child("B", 10);
        Content other = Child("C", 20);

        IReadOnlyDictionary<int, KanbanCardChildren> assembled = KanbanCardChildAssembler.Assemble(
            [first, second, other], All(first, second, other), capped: false, culture: null, displayCap: 5);

        assembled[10].Children.Select(child => child.Name).Should().Equal("A", "B");
        assembled[20].Children.Select(child => child.Name).Should().Equal("C");
    }

    [Fact]
    public void Preserves_the_order_it_was_given()
    {
        // The query orders globally and grouping preserves order within a group, which is what makes
        // one ordered query enough for every card.
        Content second = Child("B", 10);
        Content first = Child("A", 10);

        KanbanCardChildAssembler.Assemble([second, first], All(second, first), false, null, 5)[10]
            .Children.Select(child => child.Name).Should().Equal("B", "A");
    }

    [Fact]
    public void Carries_the_key_and_the_content_type_icon_untouched()
    {
        Content child = Child("A", 10);

        KanbanCardChildModel model = KanbanCardChildAssembler.Assemble([child], All(child), false, null, 5)[10]
            .Children.Single();

        model.Key.Should().Be(child.Key);
        model.Icon.Should().Be("icon-receipt color-blue");
    }

    [Fact]
    public void Truncates_the_list_at_the_display_cap_but_counts_every_row()
    {
        List<Content> children = Enumerable.Range(0, 7).Select(index => Child($"C{index}", 10)).ToList();

        KanbanCardChildren assembled = KanbanCardChildAssembler.Assemble(
            children, All([.. children]), capped: false, culture: null, displayCap: 5)[10];

        assembled.Children.Should().HaveCount(5);
        assembled.Total.Should().Be(7);
        assembled.TotalIsExact.Should().BeTrue();
    }

    [Fact]
    public void Reports_the_total_as_a_lower_bound_when_the_query_was_capped()
    {
        Content child = Child("A", 10);

        KanbanCardChildAssembler.Assemble([child], All(child), capped: true, culture: null, displayCap: 5)[10]
            .TotalIsExact.Should().BeFalse();
    }

    [Fact]
    public void Drops_children_the_user_may_not_browse_from_the_list_and_the_total()
    {
        // The count must never disclose a node the user cannot see.
        Content visible = Child("A", 10);
        Content hidden = Child("B", 10);

        KanbanCardChildren assembled = KanbanCardChildAssembler.Assemble(
            [visible, hidden], All(visible), capped: false, culture: null, displayCap: 5)[10];

        assembled.Children.Select(child => child.Name).Should().Equal("A");
        assembled.Total.Should().Be(1);
    }

    [Fact]
    public void Omits_a_card_that_ends_up_with_no_visible_children()
    {
        Content hidden = Child("B", 10);

        KanbanCardChildAssembler.Assemble([hidden], new HashSet<Guid>(), false, null, 5)
            .Should().BeEmpty();
    }

    [Fact]
    public void Reads_the_name_for_the_requested_culture()
    {
        var child = new Content("fallback", 10, LineItemType(ContentVariation.Culture)) { Key = Guid.NewGuid() };
        child.SetCultureName("Linje", "da-DK");

        KanbanCardChildAssembler.Assemble([child], All(child), false, "da-DK", 5)[10]
            .Children.Single().Name.Should().Be("Linje");
    }

    [Fact]
    public void None_is_an_empty_exact_result()
    {
        KanbanCardChildren.None.Children.Should().BeEmpty();
        KanbanCardChildren.None.Total.Should().Be(0);
        KanbanCardChildren.None.TotalIsExact.Should().BeTrue();
    }
}
