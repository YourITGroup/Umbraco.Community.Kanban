using Umbraco.Community.Contentment.DataEditors;

namespace Umbraco.Community.Kanban.Contentment;

/// <summary>
/// Reads the items a Contentment data source produces.
/// </summary>
/// <remarks>
/// Exists as a seam only because Contentment's <c>ConfigurationEditorUtility</c> is <c>public sealed</c>
/// with no interface, so a lane source depending on it directly could not be tested at all. Mirrors
/// <c>IKanbanPropertyDataTypeLookup</c> in the core package, which exists for the same reason.
/// </remarks>
public interface IContentmentDataListItems
{
    IEnumerable<DataListItem> GetItems(ContentmentDataSourceReference reference);
}
