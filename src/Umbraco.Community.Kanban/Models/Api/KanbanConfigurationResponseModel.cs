using System.Text.Json.Serialization;

namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>
/// Serialised as a string, not an ordinal, so the client matches on "Board" rather than on a
/// number whose meaning would shift if this enum ever gained a member.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum KanbanConfigurationKind
{
    Board,
    Calendar,
}

/// <summary>
/// A named Kanban configuration, as seen by the backoffice entry point that
/// registers one content app per configuration.
/// </summary>
public sealed class KanbanConfigurationResponseModel
{
    public required Guid Key { get; init; }

    public required string Name { get; init; }

    public required KanbanConfigurationKind Kind { get; init; }

    public Guid[] AppliesTo { get; init; } = [];

    public string? TabName { get; init; }

    public string? TabIcon { get; init; }
}
