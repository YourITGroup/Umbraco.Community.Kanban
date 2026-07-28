namespace Umbraco.Community.Kanban.Services;

public interface IKanbanLaneContentTypeResolver
{
    /// <summary>
    /// The child content type key a board's lanes resolve against, or <see cref="Guid.Empty" />
    /// when the configuration has no lane property or no allowed child declares it. Empty is
    /// not a failure: a manual-lanes configuration needs no content type at all.
    /// </summary>
    Task<Guid> ResolveAsync(Guid parentContentTypeKey, string? laneProperty);
}
