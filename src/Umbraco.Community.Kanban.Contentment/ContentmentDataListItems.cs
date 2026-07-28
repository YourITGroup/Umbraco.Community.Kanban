using Umbraco.Cms.Core.Serialization;
using Umbraco.Community.Contentment.DataEditors;

namespace Umbraco.Community.Kanban.Contentment;

/// <summary>
/// Asks Contentment for a data source's items, the same way Contentment's own
/// <c>DataListController.GetEditor</c> does.
/// </summary>
/// <remarks>
/// The deserialisation deliberately mirrors Contentment's, including using Umbraco's
/// <see cref="IJsonSerializer" />: data sources read their own configuration through Umbraco's
/// conversion helpers, so a differently-serialised dictionary can silently yield no values.
/// <c>EnumDataListSource</c> reading <c>enumType</c> as a <c>List&lt;string&gt;</c> is the concrete case.
/// </remarks>
public sealed class ContentmentDataListItems(
    ConfigurationEditorUtility utility,
    IJsonSerializer jsonSerializer) : IContentmentDataListItems
{
    public IEnumerable<DataListItem> GetItems(ContentmentDataSourceReference reference)
    {
        IContentmentDataSource? source = utility.GetConfigurationEditor<IContentmentDataSource>(reference.Key);

        if (source is null)
        {
            // A data source Contentment does not know: its package may have been removed since the
            // data type was configured. No lanes, no exception.
            return [];
        }

        Dictionary<string, object> configuration =
            jsonSerializer.Deserialize<Dictionary<string, object>>(reference.ValueJson) ?? [];

        return source.GetItems(configuration) ?? [];
    }
}
