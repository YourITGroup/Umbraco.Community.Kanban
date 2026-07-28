using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.Serialization;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// Maps a data type onto a configuration response model. Pure, so it is tested directly.
/// </summary>
public static class KanbanConfigurationMapper
{
    public static KanbanConfigurationResponseModel? Map(
        Guid key,
        string name,
        string editorAlias,
        object? configurationObject)
    {
        if (string.Equals(editorAlias, Constants.BoardEditorAlias, StringComparison.OrdinalIgnoreCase))
        {
            var board = configurationObject as KanbanBoardConfiguration;
            return new KanbanConfigurationResponseModel
            {
                Key = key,
                Name = name,
                Kind = KanbanConfigurationKind.Board,
                AppliesTo = board?.AppliesTo ?? [],
                TabName = board?.TabName,
                TabIcon = board?.TabIcon,
            };
        }

        if (string.Equals(editorAlias, Constants.CalendarEditorAlias, StringComparison.OrdinalIgnoreCase))
        {
            var calendar = configurationObject as KanbanCalendarConfiguration;
            return new KanbanConfigurationResponseModel
            {
                Key = key,
                Name = name,
                Kind = KanbanConfigurationKind.Calendar,
                AppliesTo = calendar?.AppliesTo ?? [],
                TabName = calendar?.TabName,
                TabIcon = calendar?.TabIcon,
            };
        }

        return null;
    }
}

/// <inheritdoc />
public sealed class KanbanConfigurationService(
    IDataTypeService dataTypeService,
    IConfigurationEditorJsonSerializer configurationEditorJsonSerializer,
    PropertyEditorCollection propertyEditors) : IKanbanConfigurationService
{
    public async Task<IReadOnlyList<KanbanConfigurationResponseModel>> GetAllAsync()
    {
        IEnumerable<IDataType> dataTypes = await dataTypeService.GetByEditorAliasAsync(
            [Constants.BoardEditorAlias, Constants.CalendarEditorAlias]);

        return dataTypes
            .Select(dataType => KanbanConfigurationMapper.Map(
                dataType.Key,
                dataType.Name ?? string.Empty,
                dataType.EditorAlias,
                GetConfigurationObject(dataType)))
            .OfType<KanbanConfigurationResponseModel>()
            .OrderBy(model => model.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<KanbanBoardConfiguration?> GetBoardConfigurationAsync(Guid key)
    {
        IDataType? dataType = await dataTypeService.GetAsync(key);

        return dataType is null || string.Equals(dataType.EditorAlias, Constants.BoardEditorAlias, StringComparison.OrdinalIgnoreCase) == false
            ? null
            : GetConfigurationObject(dataType) as KanbanBoardConfiguration;
    }

    private object? GetConfigurationObject(IDataType dataType)
    {
        if (propertyEditors.TryGet(dataType.EditorAlias, out var editor) == false)
        {
            return null;
        }

        return editor
            .GetConfigurationEditor()
            .ToConfigurationObject(dataType.ConfigurationData, configurationEditorJsonSerializer);
    }
}
