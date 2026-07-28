using Umbraco.Cms.Core.Models;
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
        IReadOnlyList<string> cardProperties,
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
        IReadOnlyList<string> cardProperties,
        string? culture)
    {
        var properties = new List<KanbanCardPropertyModel>(cardProperties.Count);

        foreach (var alias in cardProperties)
        {
            if (content.Properties.TryGetValue(alias, out IProperty? property) == false)
            {
                continue;
            }

            // A culture only applies where the property itself varies; an invariant
            // property on a varying document still stores its value under no culture.
            var propertyCulture = property.PropertyType.Variations.HasFlag(ContentVariation.Culture)
                ? culture
                : null;

            properties.Add(new KanbanCardPropertyModel
            {
                Alias = property.PropertyType.Alias,
                Name = property.PropertyType.Name,
                EditorAlias = property.PropertyType.PropertyEditorAlias,
                Value = content.GetValue(alias, propertyCulture),
            });
        }

        return properties;
    }
}
