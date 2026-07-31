using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Grouping;

/// <summary>
/// Turns a grouping property's data type configuration into the groups that property offers.
/// Implement this to support a property editor the package does not know about.
///
/// A group is whatever the view calls it: a board shows one as a swimlane, a calendar as a category.
/// The vocabulary is deliberately neutral because one source feeds both.
/// </summary>
public interface IKanbanGroupSource
{
    /// <summary>A stable alias, used when a configuration pins a specific source.</summary>
    string Alias { get; }

    bool CanHandle(KanbanGroupSourceContext context);

    Task<IReadOnlyList<KanbanGroup>> GetGroupsAsync(KanbanGroupSourceContext context);
}
