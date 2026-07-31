namespace Umbraco.Community.Kanban.Grouping;

/// <summary>One document offered as a group: what it is called, and the icon of its type.</summary>
public sealed record KanbanContentInstance(Guid Key, string Name, string? Icon);

/// <summary>
/// Lists the documents of given content types. A seam for the same reason
/// <see cref="IKanbanPropertyDataTypeLookup"/> is one: it keeps <c>IContentService</c> out of the
/// group source, so the source's rules are tested against a fake rather than a database.
/// </summary>
public interface IKanbanContentInstanceLookup
{
    /// <summary>
    /// The documents of <paramref name="contentTypeKeys"/>, trashed ones excluded, ordered by name,
    /// at most <paramref name="cap"/> of them.
    /// </summary>
    IReadOnlyList<KanbanContentInstance> GetInstances(IReadOnlyCollection<Guid> contentTypeKeys, int cap);
}
