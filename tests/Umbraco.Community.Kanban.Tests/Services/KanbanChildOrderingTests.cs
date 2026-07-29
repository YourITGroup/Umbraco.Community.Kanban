using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanChildOrderingTests
{
    [Theory]
    [InlineData("sortOrder", "sortOrder")]
    [InlineData("name", "name")]
    [InlineData("updateDate", "updateDate")]
    [InlineData("createDate", "createDate")]
    public void From_MapsEachOfferedField(string sortBy, string expected)
    {
        KanbanChildOrdering.From(sortBy, null, null).OrderBy.Should().Be(expected);
    }

    [Theory]
    [InlineData("NAME")]
    [InlineData(" name ")]
    public void From_IsForgivingAboutCasingAndPadding(string sortBy)
    {
        KanbanChildOrdering.From(sortBy, null, null).OrderBy.Should().Be("name");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("nonsense")]
    public void From_FallsBackToSortOrder_SoAHandEditedConfigurationCannotFailABoard(string? sortBy)
    {
        KanbanChildOrdering.From(sortBy, null, null).OrderBy.Should().Be("sortOrder");
    }

    [Fact]
    public void From_IsAscendingUnlessDescendingIsAsked()
    {
        KanbanChildOrdering.From("name", null, null).Direction.Should().Be(Direction.Ascending);
        KanbanChildOrdering.From("name", "asc", null).Direction.Should().Be(Direction.Ascending);
        KanbanChildOrdering.From("name", "nonsense", null).Direction.Should().Be(Direction.Ascending);
        KanbanChildOrdering.From("name", "DESC", null).Direction.Should().Be(Direction.Descending);
    }

    [Fact]
    public void From_PassesTheCultureForANameOrdering_BecauseANameIsStoredPerCulture()
    {
        Ordering ordering = KanbanChildOrdering.From("name", null, "da-DK");

        ordering.Culture.Should().Be("da-DK");
    }

    [Fact]
    public void From_LeavesEveryOtherFieldInvariant()
    {
        // A date or a sort order is stored once per document, so ordering it by culture is meaningless
        // and Ordering would carry a culture that changes nothing.
        KanbanChildOrdering.From("updateDate", null, "da-DK").Culture.Should().BeEmpty();
        KanbanChildOrdering.From("sortOrder", null, "da-DK").Culture.Should().BeEmpty();
    }
}
