using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.Kanban.Services;

/// <inheritdoc />
public sealed class KanbanContentTypeLookup(IContentTypeService contentTypeService) : IKanbanContentTypeLookup
{
    public async Task<IReadOnlyList<Guid>> GetAllowedChildKeysAsync(Guid contentTypeKey)
    {
        IContentType? contentType = await contentTypeService.GetAsync(contentTypeKey);

        return contentType?.AllowedContentTypes?
            .OrderBy(allowed => allowed.SortOrder)
            .Select(allowed => allowed.Key)
            .ToList() ?? [];
    }

    public async Task<bool> HasPropertyAsync(Guid contentTypeKey, string propertyAlias)
    {
        IContentType? contentType = await contentTypeService.GetAsync(contentTypeKey);

        // CompositionPropertyTypes rather than PropertyTypes: a lane property is very often
        // inherited from a composition rather than declared on the child type itself.
        return contentType?.CompositionPropertyTypes
            .Any(property => string.Equals(property.Alias, propertyAlias, StringComparison.OrdinalIgnoreCase))
            ?? false;
    }
}
