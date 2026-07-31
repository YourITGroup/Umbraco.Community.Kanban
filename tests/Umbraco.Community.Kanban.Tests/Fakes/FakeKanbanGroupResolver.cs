using Umbraco.Community.Kanban.Grouping;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Fakes;

internal sealed class FakeKanbanGroupResolver : IKanbanGroupResolver
{
    public List<KanbanGroup> Groups { get; } = [];

    public List<(Guid ContentTypeKey, KanbanBoardConfiguration Configuration)> Calls { get; } = [];

    public Task<KanbanGroupResolution> ResolveAsync(Guid contentTypeKey, KanbanBoardConfiguration configuration)
    {
        Calls.Add((contentTypeKey, configuration));

        return Task.FromResult(new KanbanGroupResolution(Groups, []));
    }
}
