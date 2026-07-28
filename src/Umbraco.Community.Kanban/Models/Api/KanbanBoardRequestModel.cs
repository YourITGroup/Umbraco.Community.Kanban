namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>The query string of a <c>GET /board</c> request.</summary>
public sealed class KanbanBoardRequestModel
{
    /// <summary>The document whose children the board renders.</summary>
    public Guid ParentId { get; init; }

    /// <summary>
    /// The board configuration to use. Omit to resolve it from the parent's collection
    /// (list view) data type, which is what the collection view host does.
    /// </summary>
    public Guid? ConfigId { get; init; }

    /// <summary>The culture to read values for. Omit for invariant values.</summary>
    public string? Culture { get; init; }

    /// <summary>
    /// Return only this lane, for a "Show more". The empty string addresses the
    /// unassigned lane, so this is deliberately distinguishable from omitted.
    /// </summary>
    public string? Lane { get; init; }

    /// <summary>Cards to skip within <see cref="Lane" />.</summary>
    public int? Skip { get; init; }

    /// <summary>Overrides the configuration's lane page size.</summary>
    public int? Take { get; init; }
}
