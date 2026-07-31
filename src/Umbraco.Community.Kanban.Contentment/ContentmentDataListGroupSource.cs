using Microsoft.Extensions.Logging;
using Umbraco.Community.Contentment.DataEditors;
using Umbraco.Community.Kanban.Grouping;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Contentment;

/// <summary>
/// Resolves lanes from a Contentment Data List property, one lane per item its data source produces.
/// Any data source works, including custom ones, because resolution goes through Contentment's
/// <c>IContentmentDataSource</c> rather than enumerating known source types.
/// </summary>
public sealed class ContentmentDataListGroupSource(
    IContentmentDataListItems items,
    ILogger<ContentmentDataListGroupSource> logger) : IKanbanGroupSource
{
    public string Alias => ContentmentConstants.GroupSourceAlias;

    public bool CanHandle(KanbanGroupSourceContext context) =>
        string.Equals(context.EditorAlias, ContentmentConstants.DataListEditorAlias, StringComparison.OrdinalIgnoreCase);

    public Task<IReadOnlyList<KanbanGroup>> GetGroupsAsync(KanbanGroupSourceContext context)
    {
        if (ContentmentDataListConfiguration.TryRead(context.ConfigurationData, out ContentmentDataSourceReference? reference) == false
            || reference is null)
        {
            return Task.FromResult<IReadOnlyList<KanbanGroup>>([]);
        }

        IReadOnlyList<KanbanGroup> lanes = Read(reference)
            .Where(item => string.IsNullOrWhiteSpace(item.Value) == false)
            .Select(ToLane)
            .ToList();

        return Task.FromResult(lanes);
    }

    /// <summary>
    /// Guarded here rather than inside the seam so the failure path is testable with a throwing fake.
    /// A data source runs third-party code — a SQL source with a bad connection string, an Examine
    /// source with no index — and a board with no lanes is recoverable where a 500 is not.
    /// </summary>
    private IEnumerable<DataListItem> Read(ContentmentDataSourceReference reference)
    {
        try
        {
            return items.GetItems(reference) ?? [];
        }
        catch (Exception exception)
        {
            logger.LogError(
                exception,
                "The Contentment data source {DataSourceKey} failed to produce lanes.",
                reference.Key);

            return [];
        }
    }

    private static KanbanGroup ToLane(DataListItem item) => new()
    {
        // Blank values are filtered out before this runs, so Value is known to be present.
        Value = item.Value!,
        Name = string.IsNullOrWhiteSpace(item.Name) ? item.Value! : item.Name,
        Icon = string.IsNullOrWhiteSpace(item.Icon) ? null : item.Icon,

        // Colour is deliberately left unset: DataListItem carries none, so every lane joins the
        // palette cycle unless a lane override says otherwise.
        AcceptsDrops = item.Disabled == false,
    };
}
