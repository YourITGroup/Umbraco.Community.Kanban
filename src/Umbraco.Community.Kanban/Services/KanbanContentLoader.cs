using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.Kanban.Services;

/// <inheritdoc />
public sealed class KanbanContentLoader(IContentService contentService) : IKanbanContentLoader
{
    public IContent? GetById(Guid key) => contentService.GetById(key);

    public KanbanChildPage GetChildren(int parentId, int cap)
    {
        // A null ordering falls back to sortOrder ascending, which is what the table layout
        // shows. Templates are not loaded — a card never needs one.
        IEnumerable<IContent> children = contentService.GetPagedChildren(
            parentId,
            pageIndex: 0,
            pageSize: cap,
            out var totalRecords,
            propertyAliases: null,
            filter: null,
            ordering: null,
            loadTemplates: false);

        return new KanbanChildPage(
            children.ToList(),
            (int)Math.Min(totalRecords, int.MaxValue));
    }
}
