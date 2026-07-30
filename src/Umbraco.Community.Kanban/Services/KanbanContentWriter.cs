using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;
using Umbraco.Extensions;

namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// Which culture a write targets. Two separate questions with two separate answers, which is why they are
/// two functions: the culture a *value* is stored under follows the property's variation, while the
/// published/edited pair that describes the *card* follows the document's. Pure, so both rules are tested
/// without a database — the one part of the writer that can be.
/// </summary>
public static class KanbanWriteCulture
{
    /// <summary>
    /// The culture to store a value under: the requested culture where the property varies by culture,
    /// otherwise none. An invariant property on a varying document stores its value under no culture, so
    /// passing a culture there writes where nothing ever reads back.
    /// </summary>
    public static string? ForProperty(IPropertyType propertyType, string? culture) =>
        propertyType.Variations.HasFlag(ContentVariation.Culture) ? culture : null;

    /// <summary>
    /// The culture whose published/edited pair describes the card: the requested culture where the
    /// document varies by culture, otherwise none.
    /// </summary>
    public static string? ForDocument(ContentVariation variations, string? culture) =>
        variations.HasFlag(ContentVariation.Culture) ? culture : null;
}

/// <inheritdoc />
public sealed class KanbanContentWriter(IContentService contentService) : IKanbanContentWriter
{
    public KanbanCardSaveResult SetLaneValue(IContent content, string laneProperty, string laneValue, string? culture)
    {
        if (content.Properties.TryGetValue(laneProperty, out IProperty? property) == false)
        {
            return KanbanCardSaveResult.NotSaved;
        }

        content.SetValue(laneProperty, laneValue, KanbanWriteCulture.ForProperty(property.PropertyType, culture));

        // Save, never SaveAndPublish: the whole point of this milestone is that a drag is reversible
        // before it goes live.
        OperationResult result = contentService.Save(content);

        if (result.Success == false)
        {
            return KanbanCardSaveResult.NotSaved;
        }

        var documentCulture = KanbanWriteCulture.ForDocument(content.ContentType.Variations, culture);

        return documentCulture is null
            ? new KanbanCardSaveResult(true, content.Published, content.Edited)
            : new KanbanCardSaveResult(
                true,
                content.IsCulturePublished(documentCulture),
                content.IsCultureEdited(documentCulture));
    }
}
