using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Fakes;

internal sealed class FakeKanbanLaneResolver : IKanbanLaneResolver
{
    public List<KanbanLane> Lanes { get; } = [];

    public List<(Guid ContentTypeKey, KanbanBoardConfiguration Configuration)> Calls { get; } = [];

    public Task<KanbanLaneResolution> ResolveAsync(Guid contentTypeKey, KanbanBoardConfiguration configuration)
    {
        Calls.Add((contentTypeKey, configuration));

        return Task.FromResult(new KanbanLaneResolution(Lanes, []));
    }
}
