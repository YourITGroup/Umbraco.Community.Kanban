using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Grouping.Sources;

/// <summary>
/// Resolves groups from the documents a picker property is restricted to: point a card's picker at
/// one or more document types, and every document of those types becomes a swimlane on a board or a
/// category on a calendar. A "Resource" picker restricted to Meeting Room gives a lane per room.
///
/// A group's value is the document's UDI, because that is exactly what the picker stores on the card —
/// grouping compares the two as strings, so anything else (a raw key, a name) would match nothing. A
/// multi-select picker holding more than one document therefore lands in the unassigned group, which
/// is correct: a card belongs to one group.
/// </summary>
public sealed class ContentInstanceGroupSource(
    IKanbanContentInstanceLookup instances,
    ILogger<ContentInstanceGroupSource> logger) : IKanbanGroupSource
{
    public string Alias => Constants.ContentInstanceGroupSourceAlias;

    /// <summary>
    /// Claimed only once the picker names its allowed types. An unrestricted picker is left to any
    /// other source that wants it, rather than claimed and then answered with nothing.
    /// </summary>
    public bool CanHandle(KanbanGroupSourceContext context) => PickerAllowedContentTypes.Read(context).Count > 0;

    public Task<IReadOnlyList<KanbanGroup>> GetGroupsAsync(KanbanGroupSourceContext context)
    {
        IReadOnlyList<Guid> contentTypeKeys = PickerAllowedContentTypes.Read(context);

        if (contentTypeKeys.Count == 0)
        {
            return Task.FromResult<IReadOnlyList<KanbanGroup>>([]);
        }

        // One over the cap, so exceeding it is detectable rather than silently trimmed.
        IReadOnlyList<KanbanContentInstance> found = instances.GetInstances(
            contentTypeKeys,
            Constants.DefaultGroupCap + 1);

        if (found.Count > Constants.DefaultGroupCap)
        {
            logger.LogWarning(
                "The picker restricted to {ContentTypeCount} content type(s) has more than {Cap} documents; "
                + "only the first {Cap} become groups. Restrict the picker further, or group by a property "
                + "with fewer values.",
                contentTypeKeys.Count,
                Constants.DefaultGroupCap,
                Constants.DefaultGroupCap);
        }

        IReadOnlyList<KanbanGroup> groups = found
            .Take(Constants.DefaultGroupCap)
            .Select(instance => new KanbanGroup
            {
                Value = Udi.Create(Cms.Core.Constants.UdiEntityType.Document, instance.Key).ToString(),
                Name = instance.Name,
                Icon = string.IsNullOrWhiteSpace(instance.Icon) ? null : instance.Icon,
            })
            .ToList();

        return Task.FromResult(groups);
    }
}
