using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.Kanban.Grouping;

/// <inheritdoc />
public sealed class KanbanContentInstanceLookup(
    IContentService contentService,
    IContentTypeService contentTypeService) : IKanbanContentInstanceLookup
{
    /// <summary>One database round trip's worth of documents.</summary>
    private const int PageSize = 200;

    public IReadOnlyList<KanbanContentInstance> GetInstances(IReadOnlyCollection<Guid> contentTypeKeys, int cap)
    {
        if (contentTypeKeys.Count == 0 || cap <= 0)
        {
            return [];
        }

        // One call for every type: it resolves the integer ids the paged query needs and carries the
        // icons, so no second lookup per document is required.
        IContentType[] contentTypes = contentTypeService.GetMany(contentTypeKeys).ToArray();

        if (contentTypes.Length == 0)
        {
            return [];
        }

        Dictionary<int, string?> iconsByTypeId = contentTypes.ToDictionary(type => type.Id, type => type.Icon);
        var found = new List<KanbanContentInstance>();
        long page = 0;
        long total;

        do
        {
            // Unpublished documents are included deliberately: this is a backoffice view, and a lane
            // that vanished because its document was unpublished would silently orphan its cards.
            IEnumerable<IContent> items = contentService.GetPagedOfTypes(
                contentTypes.Select(type => type.Id).ToArray(),
                page,
                PageSize,
                out total,
                filter: null,
                ordering: null);

            foreach (IContent item in items)
            {
                if (item.Trashed)
                {
                    continue;
                }

                found.Add(new KanbanContentInstance(
                    item.Key,
                    item.Name ?? string.Empty,
                    iconsByTypeId.GetValueOrDefault(item.ContentTypeId)));
            }

            page++;
        }
        // Stop once the cap is provably exceeded: the caller only needs to know that it was.
        while (page * PageSize < total && found.Count <= cap);

        return found
            .OrderBy(instance => instance.Name, StringComparer.OrdinalIgnoreCase)
            .Take(cap)
            .ToList();
    }
}
