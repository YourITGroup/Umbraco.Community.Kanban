using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Fakes;

internal sealed class FakeKanbanDataTypeConfigurationLookup : IKanbanDataTypeConfigurationLookup
{
    /// <summary>Data type key and configuration key to the GUID stored there.</summary>
    public Dictionary<(Guid DataTypeKey, string ConfigurationKey), Guid> Values { get; } = [];

    public Task<Guid?> GetGuidAsync(Guid dataTypeKey, string configurationKey) =>
        Task.FromResult(Values.TryGetValue((dataTypeKey, configurationKey), out Guid value) ? value : (Guid?)null);
}
