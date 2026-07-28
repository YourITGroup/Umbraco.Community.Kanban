namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// Reads a single extra configuration value off a data type. The narrow slice of
/// IDataTypeService the board needs, so its callers are testable with a hand-written fake.
/// </summary>
public interface IKanbanDataTypeConfigurationLookup
{
    /// <summary>
    /// The GUID stored under <paramref name="configurationKey" /> on the given data type,
    /// or null when the data type is missing, the key is absent, or the value is not a
    /// usable GUID.
    /// </summary>
    Task<Guid?> GetGuidAsync(Guid dataTypeKey, string configurationKey);
}
