using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Services;

/// <param name="ConfigurationKey">The configuration that was named, where one was. <see cref="Guid.Empty" /> otherwise.</param>
public sealed record KanbanCalendarConfigurationResult(
    KanbanBoardConfigurationStatus Status,
    Guid ConfigurationKey,
    KanbanCalendarConfiguration? Configuration)
{
    public static KanbanCalendarConfigurationResult Success(Guid key, KanbanCalendarConfiguration configuration) =>
        new(KanbanBoardConfigurationStatus.Success, key, configuration);

    public static KanbanCalendarConfigurationResult NotConfigured() =>
        new(KanbanBoardConfigurationStatus.NotConfigured, Guid.Empty, null);

    public static KanbanCalendarConfigurationResult NotFound(Guid key) =>
        new(KanbanBoardConfigurationStatus.ConfigurationNotFound, key, null);
}

public interface IKanbanCalendarConfigurationResolver
{
    /// <summary>
    /// Finds the calendar configuration to render. An explicit <paramref name="configId" /> wins;
    /// otherwise the parent's collection (list view) data type is read for
    /// <see cref="Constants.CalendarConfigIdKey" /> — the same two-step rule boards use.
    /// </summary>
    Task<KanbanCalendarConfigurationResult> ResolveAsync(Guid? configId, Guid? listViewKey);
}

/// <inheritdoc />
public sealed class KanbanCalendarConfigurationResolver(
    IKanbanDataTypeConfigurationLookup dataTypeConfigurationLookup,
    IKanbanConfigurationService configurationService) : IKanbanCalendarConfigurationResolver
{
    public async Task<KanbanCalendarConfigurationResult> ResolveAsync(Guid? configId, Guid? listViewKey)
    {
        if (configId.HasValue)
        {
            return await LoadAsync(configId.Value);
        }

        if (listViewKey.HasValue == false)
        {
            return KanbanCalendarConfigurationResult.NotConfigured();
        }

        Guid? calendarKey = await dataTypeConfigurationLookup.GetGuidAsync(
            listViewKey.Value,
            Constants.CalendarConfigIdKey);

        return calendarKey.HasValue
            ? await LoadAsync(calendarKey.Value)
            : KanbanCalendarConfigurationResult.NotConfigured();
    }

    private async Task<KanbanCalendarConfigurationResult> LoadAsync(Guid key)
    {
        KanbanCalendarConfiguration? configuration = await configurationService.GetCalendarConfigurationAsync(key);

        return configuration is null
            ? KanbanCalendarConfigurationResult.NotFound(key)
            : KanbanCalendarConfigurationResult.Success(key, configuration);
    }
}
