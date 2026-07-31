using Umbraco.Community.Kanban.Grouping;

namespace Umbraco.Community.Kanban.Contentment.Tests.Fakes;

/// <summary>
/// Stands in for the core package's content-instance seam so the source collection can be constructed
/// in a container that has no <c>IContentService</c>. This project's tests never exercise it.
/// </summary>
public sealed class FakeKanbanContentInstanceLookup : IKanbanContentInstanceLookup
{
    public IReadOnlyList<KanbanContentInstance> GetInstances(IReadOnlyCollection<Guid> contentTypeKeys, int cap) => [];
}
