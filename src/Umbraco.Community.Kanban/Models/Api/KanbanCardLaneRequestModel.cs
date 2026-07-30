namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>The body of a <c>PUT /card/{key}/lane</c> request.</summary>
public sealed class KanbanCardLaneRequestModel
{
    /// <summary>
    /// The lane's value, written to the board's configured lane property. The empty string is a real
    /// value: it clears the property, which is how a card lands in the unassigned lane.
    /// </summary>
    public string LaneValue { get; init; } = string.Empty;

    /// <summary>The culture to write for. Omit for invariant.</summary>
    public string? Culture { get; init; }
}
