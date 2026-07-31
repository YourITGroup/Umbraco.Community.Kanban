using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Services;

/// <param name="From">Inclusive first calendar date of the requested range.</param>
/// <param name="To">Inclusive last calendar date of the requested range.</param>
public sealed record KanbanCalendarRequest(
    Guid ParentId,
    Guid? ConfigId,
    string? Culture,
    DateOnly From,
    DateOnly To);

/// <summary>Statuses reuse <see cref="KanbanBoardStatus"/>: a calendar fails in exactly the ways a board does.</summary>
public sealed record KanbanCalendarResult(KanbanBoardStatus Status, KanbanCalendarResponseModel? Calendar);

public interface IKanbanCalendarService
{
    Task<KanbanCalendarResult> GetCalendarAsync(KanbanCalendarRequest request, IUser user);
}
