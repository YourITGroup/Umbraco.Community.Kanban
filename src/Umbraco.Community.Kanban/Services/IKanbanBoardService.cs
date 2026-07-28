using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

public enum KanbanBoardStatus
{
    Success,
    ParentNotFound,
    ParentAccessDenied,

    /// <summary>No Kanban configuration has been chosen for this collection yet.</summary>
    NotConfigured,

    /// <summary>A configuration was named, but it is missing or is not a Kanban Board.</summary>
    ConfigurationNotFound,
}

/// <param name="Culture">
/// The culture to read values for, or null for invariant values. Null is not "the site
/// default": the collection supplies its display culture, which is itself null where nothing
/// varies, so invariant is the correct reading in that case.
/// </param>
/// <param name="Lane">A single lane to return, or null for the whole board. The empty string means unassigned.</param>
/// <param name="Skip">Cards to skip within <paramref name="Lane" />. Ignored when Lane is null.</param>
/// <param name="Take">Overrides the configuration's lane page size.</param>
public sealed record KanbanBoardRequest(
    Guid ParentId,
    Guid? ConfigId,
    string? Culture,
    string? Lane,
    int? Skip,
    int? Take);

public sealed record KanbanBoardResult(KanbanBoardStatus Status, KanbanBoardResponseModel? Board);

public interface IKanbanBoardService
{
    Task<KanbanBoardResult> GetBoardAsync(KanbanBoardRequest request, IUser user);
}
