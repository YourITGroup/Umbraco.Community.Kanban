using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Services;

/// <inheritdoc />
public sealed class KanbanBoardConfigurationResolver(
    IKanbanDataTypeConfigurationLookup dataTypeConfigurationLookup,
    IKanbanConfigurationService configurationService) : IKanbanBoardConfigurationResolver
{
    public async Task<KanbanBoardConfigurationResult> ResolveAsync(Guid? configId, Guid? listViewKey)
    {
        if (configId.HasValue)
        {
            return await LoadAsync(configId.Value);
        }

        if (listViewKey.HasValue == false)
        {
            return KanbanBoardConfigurationResult.NotConfigured();
        }

        Guid? boardKey = await dataTypeConfigurationLookup.GetGuidAsync(
            listViewKey.Value,
            Constants.BoardConfigIdKey);

        return boardKey.HasValue
            ? await LoadAsync(boardKey.Value)
            : KanbanBoardConfigurationResult.NotConfigured();
    }

    private async Task<KanbanBoardConfigurationResult> LoadAsync(Guid key)
    {
        KanbanBoardConfiguration? configuration = await configurationService.GetBoardConfigurationAsync(key);

        return configuration is null
            ? KanbanBoardConfigurationResult.NotFound(key)
            : KanbanBoardConfigurationResult.Success(key, configuration);
    }
}
