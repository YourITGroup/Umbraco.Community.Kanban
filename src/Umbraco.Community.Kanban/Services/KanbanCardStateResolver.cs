using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// Turns a document's published/edited pair into a card state. Pure and separate from the
/// card mapper because the per-culture flags it consumes (IsCulturePublished /
/// IsCultureEdited) come from IContent internals that cannot be set on an in-memory
/// Content instance — keeping the decision here is what makes it testable at all.
/// </summary>
public static class KanbanCardStateResolver
{
    public static string Resolve(bool published, bool edited) =>
        published
            ? edited ? KanbanCardStates.PublishedPendingChanges : KanbanCardStates.Published
            : KanbanCardStates.Draft;
}
