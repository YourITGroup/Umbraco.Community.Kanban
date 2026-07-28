namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>
/// A request to resolve lanes for a configuration that may not be saved yet.
/// </summary>
public sealed class KanbanLanePreviewRequestModel
{
    /// <summary>The content type whose children the board will show.</summary>
    public required Guid ContentTypeKey { get; init; }

    public required KanbanBoardConfiguration Configuration { get; init; }
}
