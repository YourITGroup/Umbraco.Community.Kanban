using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Tests.Fakes;

/// <summary>
/// Builds card property lists for tests that only care about aliases, which most do — headers, label
/// templates and system fields have their own tests.
/// </summary>
public static class CardPropertyList
{
    public static KanbanCardProperty[] Of(params string[] aliases) =>
        aliases.Select(alias => new KanbanCardProperty { Alias = alias }).ToArray();

    public static KanbanCardProperty System(string alias, string? header = null) =>
        new() { Alias = alias, Header = header, IsSystem = 1 };
}
