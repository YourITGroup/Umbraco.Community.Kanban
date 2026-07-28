namespace Umbraco.Community.Kanban.Models.Api;

/// <summary>
/// A request to resolve lanes for a configuration that may not be saved yet.
/// </summary>
public sealed class KanbanLanePreviewRequestModel
{
    /// <summary>
    /// The content type whose children the board will show. Optional: the configuration editor has
    /// no document of its own, so it may omit this and let the configuration's own
    /// <see cref="KanbanBoardConfiguration.LaneContentTypeKey" /> — the content type the lane
    /// property was picked from — stand in.
    /// </summary>
    public Guid ContentTypeKey { get; init; }

    public required KanbanBoardConfiguration Configuration { get; init; }

    /// <summary>
    /// The content type lanes should actually be resolved against.
    /// </summary>
    public Guid EffectiveContentTypeKey =>
        ContentTypeKey == Guid.Empty ? Configuration.LaneContentTypeKey ?? Guid.Empty : ContentTypeKey;
}
