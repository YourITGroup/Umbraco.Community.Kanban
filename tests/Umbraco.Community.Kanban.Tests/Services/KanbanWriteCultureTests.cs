using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Services;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanWriteCultureTests
{
    private static readonly FakeShortStringHelper ShortStrings = new();

    private static PropertyType Property(ContentVariation variations) =>
        new(ShortStrings, "Umbraco.TextBox", ValueStorageType.Nvarchar, "status")
        {
            Name = "Status",
            Variations = variations,
        };

    [Fact]
    public void ForProperty_KeepsTheCultureForAVaryingProperty()
    {
        KanbanWriteCulture.ForProperty(Property(ContentVariation.Culture), "da-DK").Should().Be("da-DK");
    }

    [Fact]
    public void ForProperty_DropsTheCultureForAnInvariantProperty()
    {
        // The case that matters: an invariant property on a varying document still stores its value under
        // no culture, so passing the culture down would write where nothing reads back.
        KanbanWriteCulture.ForProperty(Property(ContentVariation.Nothing), "da-DK").Should().BeNull();
    }

    [Fact]
    public void ForProperty_IsNullWhenThereIsNoCultureToBeginWith()
    {
        KanbanWriteCulture.ForProperty(Property(ContentVariation.Culture), null).Should().BeNull();
    }

    [Fact]
    public void ForProperty_KeepsTheCultureForACultureAndSegmentProperty()
    {
        // Variations is a [Flags] enum, so a culture-and-segment property must match on the Culture flag
        // rather than on equality with ContentVariation.Culture.
        KanbanWriteCulture.ForProperty(Property(ContentVariation.CultureAndSegment), "da-DK")
            .Should().Be("da-DK");
    }

    [Fact]
    public void ForDocument_KeepsTheCultureForAVaryingDocument()
    {
        KanbanWriteCulture.ForDocument(ContentVariation.Culture, "da-DK").Should().Be("da-DK");
    }

    [Fact]
    public void ForDocument_DropsTheCultureForAnInvariantDocument()
    {
        KanbanWriteCulture.ForDocument(ContentVariation.Nothing, "da-DK").Should().BeNull();
    }
}
