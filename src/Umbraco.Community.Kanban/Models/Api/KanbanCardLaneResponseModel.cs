namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>What a lane write actually persisted.</summary>
public sealed class KanbanCardLaneResponseModel
{
    /// <summary>
    /// One of <see cref="KanbanCardStates" />. Returned so the client can replace its optimistic badge
    /// with what the server really recorded, rather than trusting its own guess.
    /// </summary>
    public required string State { get; init; }
}
