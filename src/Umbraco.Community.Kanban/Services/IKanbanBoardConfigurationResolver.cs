using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Services;

public enum KanbanBoardConfigurationStatus
{
    Success,

    /// <summary>No Kanban configuration has been chosen for this collection yet.</summary>
    NotConfigured,

    /// <summary>A configuration was named, but it is missing or is not a Kanban Board.</summary>
    ConfigurationNotFound,
}

/// <param name="ConfigurationKey">The configuration that was named, where one was. <see cref="Guid.Empty" /> otherwise.</param>
public sealed record KanbanBoardConfigurationResult(
    KanbanBoardConfigurationStatus Status,
    Guid ConfigurationKey,
    KanbanBoardConfiguration? Configuration)
{
    public static KanbanBoardConfigurationResult Success(Guid key, KanbanBoardConfiguration configuration) =>
        new(KanbanBoardConfigurationStatus.Success, key, configuration);

    public static KanbanBoardConfigurationResult NotConfigured() =>
        new(KanbanBoardConfigurationStatus.NotConfigured, Guid.Empty, null);

    public static KanbanBoardConfigurationResult NotFound(Guid key) =>
        new(KanbanBoardConfigurationStatus.ConfigurationNotFound, key, null);
}

public interface IKanbanBoardConfigurationResolver
{
    /// <summary>
    /// Finds the board configuration to render. An explicit <paramref name="configId" /> wins;
    /// otherwise the parent's collection (list view) data type is read for
    /// <see cref="Constants.BoardConfigIdKey" />.
    /// </summary>
    Task<KanbanBoardConfigurationResult> ResolveAsync(Guid? configId, Guid? listViewKey);
}
