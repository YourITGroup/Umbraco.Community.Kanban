using Umbraco.Community.Kanban.Grouping;

namespace Umbraco.Community.Kanban.Tests.Fakes;

/// <summary>
/// A dictionary-backed lookup, so resolver tests need no Umbraco services and no mocking framework.
/// </summary>
public sealed class FakePropertyDataTypeLookup : IKanbanPropertyDataTypeLookup
{
    private readonly Dictionary<string, KanbanPropertyDataType> entries = new(StringComparer.OrdinalIgnoreCase);

    public FakePropertyDataTypeLookup Add(
        string propertyAlias,
        string editorAlias,
        IDictionary<string, object> configuration,
        bool mandatory = false)
    {
        entries[propertyAlias] = new KanbanPropertyDataType(editorAlias, configuration, mandatory);
        return this;
    }

    public Task<KanbanPropertyDataType?> GetAsync(Guid contentTypeKey, string propertyAlias) =>
        Task.FromResult(entries.TryGetValue(propertyAlias, out var entry) ? entry : null);
}
