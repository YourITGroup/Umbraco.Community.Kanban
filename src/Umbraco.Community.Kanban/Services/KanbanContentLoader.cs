using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Persistence.Querying;
using Umbraco.Cms.Core.Scoping;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.Kanban.Services;

/// <inheritdoc />
public sealed class KanbanContentLoader(
    IContentService contentService,
    ICoreScopeProvider scopeProvider) : IKanbanContentLoader
{
    public IContent? GetById(Guid key) => contentService.GetById(key);

    public IContent? GetById(int id) => contentService.GetById(id);

    public KanbanChildPage GetChildren(int parentId, int cap, Ordering ordering)
    {
        // Templates are not loaded — a card never needs one.
        IEnumerable<IContent> children = contentService.GetPagedChildren(
            parentId,
            pageIndex: 0,
            pageSize: cap,
            out var totalRecords,
            propertyAliases: null,
            filter: null,
            ordering: ordering,
            loadTemplates: false);

        return new KanbanChildPage(
            children.ToList(),
            (int)Math.Min(totalRecords, int.MaxValue));
    }

    public KanbanGrandchildPage GetGrandchildren(int parentId, int level, int cap, Ordering ordering)
    {
        // Level is a mapped column on the node table, so this filters in SQL rather than in memory.
        IQuery<IContent> filter = scopeProvider.CreateQuery<IContent>().Where(content => content.Level == level);

        List<IContent> grandchildren = contentService.GetPagedDescendants(
            parentId,
            pageIndex: 0,
            pageSize: cap,
            out var totalRecords,
            filter,
            ordering).ToList();

        return new KanbanGrandchildPage(grandchildren, totalRecords > grandchildren.Count);
    }
}
