namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>
/// The answer to "what is this document on this board now": the card and its lane, or not-a-child.
/// </summary>
public sealed class KanbanCardResponseModel
{
    /// <summary>
    /// False when the document exists but must not be shown on this board — moved elsewhere, trashed,
    /// or not browseable. One shape for all three, so the response leaks nothing.
    /// </summary>
    public required bool IsChild { get; init; }

    /// <summary>The card's raw lane value. Null when <see cref="IsChild" /> is false.</summary>
    public string? LaneValue { get; init; }

    /// <summary>The card as the board composes it. Null when <see cref="IsChild" /> is false.</summary>
    public KanbanCardModel? Card { get; init; }
}
