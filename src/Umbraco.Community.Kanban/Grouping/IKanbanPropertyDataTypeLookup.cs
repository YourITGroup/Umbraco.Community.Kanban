namespace Umbraco.Community.Kanban.Grouping;

/// <summary>The editor alias and configuration of the data type behind a content type property.</summary>
/// <param name="EditorAlias">The property editor behind the property, which picks the lane source.</param>
/// <param name="ConfigurationData">That data type's configuration, from which a source reads its lanes.</param>
/// <param name="Mandatory">
/// True when the property is required, so a saved card cannot leave it empty. Read from the *property
/// type*, not the data type: mandatory is set per property, and the same data type may be optional
/// elsewhere. Carried here because it decides whether the unassigned lane is worth a column.
/// </param>
public sealed record KanbanPropertyDataType(
    string EditorAlias,
    IDictionary<string, object> ConfigurationData,
    bool Mandatory = false);

/// <summary>
/// Finds the data type behind a property. Exists as a seam so lane resolution can be
/// tested without Umbraco's content type and data type services.
/// </summary>
public interface IKanbanPropertyDataTypeLookup
{
    Task<KanbanPropertyDataType?> GetAsync(Guid contentTypeKey, string propertyAlias);
}
