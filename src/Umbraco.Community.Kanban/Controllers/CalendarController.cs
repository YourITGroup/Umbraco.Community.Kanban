using Asp.Versioning;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Common.Builders;
using Umbraco.Cms.Core.Security;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Controllers;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = "Calendar")]
public sealed class CalendarController(
    IKanbanCalendarService calendarService,
    IBackOfficeSecurityAccessor backOfficeSecurityAccessor) : KanbanControllerBase
{
    /// <summary>
    /// The cards of a document's children placed by their date property, for an inclusive
    /// calendar-date range. Read-only: the calendar observes dates, it never writes them.
    /// </summary>
    [HttpGet("calendar")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(KanbanCalendarResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Calendar([FromQuery] KanbanCalendarRequestModel request)
    {
        if (request.From > request.To)
        {
            return BadRequest(new ProblemDetailsBuilder()
                .WithTitle("Invalid range")
                .WithDetail("'from' must not be after 'to'.")
                .Build());
        }

        KanbanCalendarResult result = await calendarService.GetCalendarAsync(
            new KanbanCalendarRequest(
                request.ParentId,
                request.ConfigId,
                request.Culture,
                request.From,
                request.To),
            CurrentUser(backOfficeSecurityAccessor));

        return result.Status switch
        {
            KanbanBoardStatus.Success => Ok(result.Calendar),
            KanbanBoardStatus.ParentNotFound => NotFound(),
            KanbanBoardStatus.ParentAccessDenied => Forbidden(),
            KanbanBoardStatus.ConfigurationNotFound => BadRequest(new ProblemDetailsBuilder()
                .WithTitle("Kanban configuration not found")
                .WithDetail("The Kanban calendar configuration this view points at no longer exists.")
                .Build()),
            _ => BadRequest(new ProblemDetailsBuilder()
                .WithTitle("No Kanban configuration")
                .WithDetail($"No Kanban calendar configuration was named. Set '{Constants.CalendarConfigIdKey}' on the collection's data type or pass configId.")
                .Build()),
        };
    }
}
