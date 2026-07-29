using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Fakes;

internal sealed class FakeKanbanContentLoader : IKanbanContentLoader
{
    public Dictionary<Guid, IContent> Content { get; } = [];

    public List<IContent> Children { get; } = [];

    /// <summary>Overrides the reported total, to simulate more children than were read.</summary>
    public int? TotalChildCountOverride { get; set; }

    public List<(int ParentId, int Cap)> ChildRequests { get; } = [];

    /// <summary>Grandchildren the fake returns, in the order given — the fake does not sort.</summary>
    public List<IContent> Grandchildren { get; } = [];

    /// <summary>Overrides the reported total, to simulate more grandchildren than were read.</summary>
    public int? GrandchildTotalOverride { get; set; }

    /// <summary>Every GetGrandchildren call, so a test can assert one query — or none at all.</summary>
    public List<(int ParentId, int Level, int Cap, Ordering Ordering)> GrandchildRequests { get; } = [];

    public IContent? GetById(Guid key) => Content.TryGetValue(key, out IContent? content) ? content : null;

    public KanbanChildPage GetChildren(int parentId, int cap)
    {
        ChildRequests.Add((parentId, cap));

        return new KanbanChildPage(
            Children.Take(cap).ToList(),
            TotalChildCountOverride ?? Children.Count);
    }

    public KanbanGrandchildPage GetGrandchildren(int parentId, int level, int cap, Ordering ordering)
    {
        GrandchildRequests.Add((parentId, level, cap, ordering));

        List<IContent> page = Grandchildren.Take(cap).ToList();

        return new KanbanGrandchildPage(page, (GrandchildTotalOverride ?? Grandchildren.Count) > page.Count);
    }
}
