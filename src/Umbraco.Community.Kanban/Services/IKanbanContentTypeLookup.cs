namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// The narrow slice of IContentTypeService the board needs. Exists so the callers can be
/// tested against a hand-written fake — IContentTypeService has dozens of members and
/// cannot be constructed without persistence infrastructure.
/// </summary>
public interface IKanbanContentTypeLookup
{
    /// <summary>
    /// The keys of the content types allowed as children of the given content type, in the
    /// order the content type declares them. Empty when the content type is unknown or
    /// allows no children.
    /// </summary>
    Task<IReadOnlyList<Guid>> GetAllowedChildKeysAsync(Guid contentTypeKey);

    /// <summary>
    /// True when the content type declares a property with this alias, including properties
    /// inherited through composition. Case-insensitive.
    /// </summary>
    Task<bool> HasPropertyAsync(Guid contentTypeKey, string propertyAlias);
}
