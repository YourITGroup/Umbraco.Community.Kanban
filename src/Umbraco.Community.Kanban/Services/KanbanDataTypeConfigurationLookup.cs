using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.Kanban.Services;

/// <inheritdoc />
public sealed class KanbanDataTypeConfigurationLookup(IDataTypeService dataTypeService)
    : IKanbanDataTypeConfigurationLookup
{
    public async Task<Guid?> GetGuidAsync(Guid dataTypeKey, string configurationKey)
    {
        IDataType? dataType = await dataTypeService.GetAsync(dataTypeKey);

        return dataType is null
            ? null
            : KanbanConfigurationValueReader.ReadGuid(dataType.ConfigurationData, configurationKey);
    }
}
