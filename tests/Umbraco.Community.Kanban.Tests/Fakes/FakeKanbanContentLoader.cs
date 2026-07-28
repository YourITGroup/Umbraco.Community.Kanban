using Umbraco.Cms.Core.Models;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Fakes;

internal sealed class FakeKanbanContentLoader : IKanbanContentLoader
{
    public Dictionary<Guid, IContent> Content { get; } = [];

    public List<IContent> Children { get; } = [];

    /// <summary>Overrides the reported total, to simulate more children than were read.</summary>
    public int? TotalChildCountOverride { get; set; }

    public List<(int ParentId, int Cap)> ChildRequests { get; } = [];

    public IContent? GetById(Guid key) => Content.TryGetValue(key, out IContent? content) ? content : null;

    public KanbanChildPage GetChildren(int parentId, int cap)
    {
        ChildRequests.Add((parentId, cap));

        return new KanbanChildPage(
            Children.Take(cap).ToList(),
            TotalChildCountOverride ?? Children.Count);
    }
}
