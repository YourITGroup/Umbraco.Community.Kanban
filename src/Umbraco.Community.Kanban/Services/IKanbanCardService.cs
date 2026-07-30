using Umbraco.Cms.Core.Models.Membership;

namespace Umbraco.Community.Kanban.Services;

public enum KanbanCardLaneStatus
{
    Success,

    /// <summary>No document with that key — deleted, or never existed.</summary>
    CardNotFound,

    /// <summary>The card's parent could not be loaded, so there is no collection to read a board from.</summary>
    ParentNotFound,

    /// <summary>The user may not update this card.</summary>
    AccessDenied,

    /// <summary>
    /// The parent's collection names no Kanban configuration, or the configuration names no lane
    /// property — either way there is nothing to write to.
    /// </summary>
    NotConfigured,

    /// <summary>A configuration was named, but it is missing or is not a Kanban Board.</summary>
    ConfigurationNotFound,

    /// <summary>The board's configuration has dragging switched off.</summary>
    DragNotAllowed,

    /// <summary>The lane property was not on the document, or Umbraco refused the save.</summary>
    SaveFailed,
}

/// <param name="LaneValue">
/// The lane's value. The empty string is a real value — it clears the lane property, which is how a card
/// lands in the unassigned lane — so it is deliberately distinguishable from absent.
/// </param>
/// <param name="Culture">The culture to write for, or null for invariant. Not "the site default".</param>
public sealed record KanbanCardLaneRequest(Guid CardKey, string LaneValue, string? Culture);

/// <param name="State">
/// One of <see cref="Models.Api.KanbanCardStates" />, as actually persisted — the client applies this in
/// place of its own optimistic guess. Null on any non-success status.
/// </param>
public sealed record KanbanCardLaneResult(KanbanCardLaneStatus Status, string? State);

public interface IKanbanCardService
{
    /// <summary>
    /// Moves a card to a lane by writing its board's lane property, save only.
    /// </summary>
    /// <remarks>
    /// Deliberately not routed through core's <c>PUT /document/{id}</c>: that takes a full values array
    /// through IContentEditingService — a whole-document replace, not a single-property patch — and a
    /// card only ever carries the configured summary properties, so reusing it would mean fetching the
    /// whole document and resending everything back.
    /// </remarks>
    Task<KanbanCardLaneResult> SetLaneAsync(KanbanCardLaneRequest request, IUser user);
}
