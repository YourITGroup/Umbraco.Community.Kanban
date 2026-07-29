using Umbraco.Cms.Core.Models;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// Projects a child document onto a card. Pure, so it is tested directly against
/// in-memory Content instances.
/// </summary>
public static class KanbanCardMapper
{
    public static KanbanCardModel Map(
        IContent content,
        IReadOnlyList<KanbanCardProperty> cardProperties,
        string? culture,
        bool canUpdate)
    {
        var variesByCulture = content.ContentType.Variations.HasFlag(ContentVariation.Culture);
        var effectiveCulture = variesByCulture ? culture : null;

        return new KanbanCardModel
        {
            Key = content.Key,
            Name = ResolveName(content, effectiveCulture),
            ContentTypeAlias = content.ContentType.Alias,
            Icon = content.ContentType.Icon,
            State = ResolveState(content, effectiveCulture),
            CanUpdate = canUpdate,
            Properties = MapProperties(content, cardProperties, effectiveCulture),
        };
    }

    private static string ResolveName(IContent content, string? culture) =>
        culture is null
            ? content.Name ?? string.Empty
            : content.GetCultureName(culture) ?? content.Name ?? string.Empty;

    private static string ResolveState(IContent content, string? culture) =>
        culture is null
            ? KanbanCardStateResolver.Resolve(content.Published, content.Edited)
            : KanbanCardStateResolver.Resolve(
                content.IsCulturePublished(culture),
                content.IsCultureEdited(culture));

    private static List<KanbanCardPropertyModel> MapProperties(
        IContent content,
        IReadOnlyList<KanbanCardProperty> cardProperties,
        string? culture)
    {
        var properties = new List<KanbanCardPropertyModel>(cardProperties.Count);

        foreach (var cardProperty in cardProperties)
        {
            var mapped = cardProperty.IsSystem != 0
                ? MapSystemProperty(content, cardProperty)
                : MapContentProperty(content, cardProperty, culture);

            if (mapped is not null)
            {
                properties.Add(mapped);
            }
        }

        return properties;
    }

    private static KanbanCardPropertyModel? MapSystemProperty(IContent content, KanbanCardProperty cardProperty)
    {
        var system = KanbanSystemProperty.Read(content, cardProperty.Alias);

        if (system is null)
        {
            return null;
        }

        return new KanbanCardPropertyModel
        {
            Alias = cardProperty.Alias,
            Name = Header(cardProperty) ?? KanbanSystemProperty.DefaultHeader(cardProperty.Alias),
            EditorAlias = system.Value.EditorAlias,
            NameTemplate = cardProperty.NameTemplate,
            Value = system.Value.Value,
        };
    }

    private static KanbanCardPropertyModel? MapContentProperty(
        IContent content,
        KanbanCardProperty cardProperty,
        string? culture)
    {
        if (content.Properties.TryGetValue(cardProperty.Alias, out IProperty? property) == false)
        {
            return null;
        }

        // A culture only applies where the property itself varies; an invariant
        // property on a varying document still stores its value under no culture.
        var propertyCulture = property.PropertyType.Variations.HasFlag(ContentVariation.Culture)
            ? culture
            : null;

        return new KanbanCardPropertyModel
        {
            Alias = property.PropertyType.Alias,
            Name = Header(cardProperty) ?? property.PropertyType.Name,
            EditorAlias = property.PropertyType.PropertyEditorAlias,
            NameTemplate = cardProperty.NameTemplate,
            Value = content.GetValue(cardProperty.Alias, propertyCulture),
        };
    }

    private static string? Header(KanbanCardProperty cardProperty) =>
        string.IsNullOrWhiteSpace(cardProperty.Header) ? null : cardProperty.Header;
}
