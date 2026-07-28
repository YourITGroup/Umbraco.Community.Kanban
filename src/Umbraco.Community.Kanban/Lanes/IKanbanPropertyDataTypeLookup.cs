namespace Umbraco.Community.Kanban.Lanes;

/// <summary>The editor alias and configuration of the data type behind a content type property.</summary>
public sealed record KanbanPropertyDataType(string EditorAlias, IDictionary<string, object> ConfigurationData);

/// <summary>
/// Finds the data type behind a property. Exists as a seam so lane resolution can be
/// tested without Umbraco's content type and data type services.
/// </summary>
public interface IKanbanPropertyDataTypeLookup
{
    Task<KanbanPropertyDataType?> GetAsync(Guid contentTypeKey, string propertyAlias);
}
