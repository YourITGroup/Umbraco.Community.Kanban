using Umbraco.Community.Kanban.Grouping;

namespace Umbraco.Community.Kanban.Tests.Fakes;

/// <summary>
/// Canned documents per content type, so group source tests need neither a database nor a mocking
/// framework. Records what it was asked for, which is how the cap is asserted.
/// </summary>
public sealed class FakeKanbanContentInstanceLookup : IKanbanContentInstanceLookup
{
    public Dictionary<Guid, List<KanbanContentInstance>> InstancesByContentType { get; } = [];

    public List<(IReadOnlyCollection<Guid> ContentTypeKeys, int Cap)> Calls { get; } = [];

    public IReadOnlyList<KanbanContentInstance> GetInstances(IReadOnlyCollection<Guid> contentTypeKeys, int cap)
    {
        Calls.Add((contentTypeKeys, cap));

        return contentTypeKeys
            .SelectMany(key => InstancesByContentType.GetValueOrDefault(key) ?? [])
            .OrderBy(instance => instance.Name, StringComparer.OrdinalIgnoreCase)
            .Take(cap)
            .ToList();
    }
}
