using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Fakes;

internal sealed class FakeKanbanConfigurationService : IKanbanConfigurationService
{
    public Dictionary<Guid, KanbanBoardConfiguration> BoardConfigurations { get; } = [];

    public List<KanbanConfigurationResponseModel> All { get; } = [];

    public Task<IReadOnlyList<KanbanConfigurationResponseModel>> GetAllAsync() =>
        Task.FromResult<IReadOnlyList<KanbanConfigurationResponseModel>>(All);

    public Task<KanbanBoardConfiguration?> GetBoardConfigurationAsync(Guid key) =>
        Task.FromResult(BoardConfigurations.TryGetValue(key, out KanbanBoardConfiguration? configuration)
            ? configuration
            : null);

    public Dictionary<Guid, KanbanCalendarConfiguration> CalendarConfigurations { get; } = [];

    public Task<KanbanCalendarConfiguration?> GetCalendarConfigurationAsync(Guid key) =>
        Task.FromResult(CalendarConfigurations.TryGetValue(key, out KanbanCalendarConfiguration? configuration)
            ? configuration
            : null);
}
