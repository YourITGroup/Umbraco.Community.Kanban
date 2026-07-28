using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.Kanban.Lanes;

/// <inheritdoc />
public sealed class KanbanPropertyDataTypeLookup(
    IContentTypeService contentTypeService,
    IDataTypeService dataTypeService) : IKanbanPropertyDataTypeLookup
{
    public async Task<KanbanPropertyDataType?> GetAsync(Guid contentTypeKey, string propertyAlias)
    {
        if (string.IsNullOrWhiteSpace(propertyAlias))
        {
            return null;
        }

        IContentType? contentType = contentTypeService.Get(contentTypeKey);
        IPropertyType? propertyType = contentType?
            .CompositionPropertyTypes
            .FirstOrDefault(x => string.Equals(x.Alias, propertyAlias, StringComparison.OrdinalIgnoreCase));

        if (propertyType is null)
        {
            return null;
        }

        IDataType? dataType = await dataTypeService.GetAsync(propertyType.DataTypeKey);

        return dataType is null
            ? null
            : new KanbanPropertyDataType(dataType.EditorAlias, dataType.ConfigurationData);
    }
}
