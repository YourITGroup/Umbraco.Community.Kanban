using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

public interface IKanbanConfigurationService
{
    /// <summary>Every Kanban Board and Kanban Calendar data type, ordered by name.</summary>
    Task<IReadOnlyList<KanbanConfigurationResponseModel>> GetAllAsync();

    /// <summary>The board configuration stored on a data type, or null if that data type is not a board.</summary>
    Task<KanbanBoardConfiguration?> GetBoardConfigurationAsync(Guid key);

    /// <summary>The calendar configuration stored on a data type, or null if that data type is not a calendar.</summary>
    Task<KanbanCalendarConfiguration?> GetCalendarConfigurationAsync(Guid key);
}
