using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Fakes;

internal sealed class FakeKanbanContentTypeLookup : IKanbanContentTypeLookup
{
    /// <summary>Parent content type key to its allowed child content type keys, in order.</summary>
    public Dictionary<Guid, List<Guid>> AllowedChildren { get; } = [];

    /// <summary>Content type key to the property aliases it declares.</summary>
    public Dictionary<Guid, List<string>> Properties { get; } = [];

    /// <summary>Every property check made, so a test can assert the search stopped early.</summary>
    public List<(Guid ContentTypeKey, string Alias)> PropertyChecks { get; } = [];

    public Task<IReadOnlyList<Guid>> GetAllowedChildKeysAsync(Guid contentTypeKey) =>
        Task.FromResult<IReadOnlyList<Guid>>(
            AllowedChildren.TryGetValue(contentTypeKey, out List<Guid>? children) ? children : []);

    public Task<bool> HasPropertyAsync(Guid contentTypeKey, string propertyAlias)
    {
        PropertyChecks.Add((contentTypeKey, propertyAlias));

        return Task.FromResult(
            Properties.TryGetValue(contentTypeKey, out List<string>? aliases)
            && aliases.Contains(propertyAlias, StringComparer.OrdinalIgnoreCase));
    }
}
