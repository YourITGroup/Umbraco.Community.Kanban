namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>The query string of a <c>GET /card/{key}</c> request — the key itself is a route value.</summary>
public sealed class KanbanCardRequestModel
{
    /// <summary>The board's parent document. A card is only returned if it is a child of this.</summary>
    public Guid ParentId { get; init; }

    /// <summary>An explicit configuration, or omit to resolve from the parent's list view.</summary>
    public Guid? ConfigId { get; init; }

    /// <summary>The culture to read values for. Omit for invariant values.</summary>
    public string? Culture { get; init; }
}
