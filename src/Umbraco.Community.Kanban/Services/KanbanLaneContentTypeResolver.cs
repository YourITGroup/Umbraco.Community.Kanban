namespace Umbraco.Community.Kanban.Services;

/// <inheritdoc />
public sealed class KanbanLaneContentTypeResolver(IKanbanContentTypeLookup contentTypeLookup)
    : IKanbanLaneContentTypeResolver
{
    public async Task<Guid> ResolveAsync(Guid parentContentTypeKey, string? laneProperty)
    {
        if (string.IsNullOrWhiteSpace(laneProperty))
        {
            return Guid.Empty;
        }

        IReadOnlyList<Guid> allowed = await contentTypeLookup.GetAllowedChildKeysAsync(parentContentTypeKey);

        foreach (Guid key in allowed)
        {
            if (await contentTypeLookup.HasPropertyAsync(key, laneProperty))
            {
                return key;
            }
        }

        return Guid.Empty;
    }
}
