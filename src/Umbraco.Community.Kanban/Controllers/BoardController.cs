using Asp.Versioning;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Common.Builders;
using Umbraco.Cms.Core.Security;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Controllers;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = "Board")]
public sealed class BoardController(
    IKanbanBoardService boardService,
    IBackOfficeSecurityAccessor backOfficeSecurityAccessor) : KanbanControllerBase
{
    /// <summary>
    /// The lanes and cards for a document's children. Called with no lane for an initial
    /// load, and with a lane plus skip for a "Show more" on that lane alone.
    /// </summary>
    [HttpGet("board")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(KanbanBoardResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Board([FromQuery] KanbanBoardRequestModel request)
    {
        KanbanBoardResult result = await boardService.GetBoardAsync(
            new KanbanBoardRequest(
                request.ParentId,
                request.ConfigId,
                request.Culture,
                request.Lane,
                request.Skip,
                request.Take),
            CurrentUser(backOfficeSecurityAccessor));

        return result.Status switch
        {
            KanbanBoardStatus.Success => Ok(result.Board),
            KanbanBoardStatus.ParentNotFound => NotFound(),
            KanbanBoardStatus.ParentAccessDenied => Forbidden(),
            KanbanBoardStatus.ConfigurationNotFound => BadRequest(new ProblemDetailsBuilder()
                .WithTitle("Kanban configuration not found")
                .WithDetail("The Kanban configuration this collection points at no longer exists. Choose one on the Kanban tab of the collection's data type.")
                .Build()),
            _ => BadRequest(new ProblemDetailsBuilder()
                .WithTitle("No Kanban configuration")
                .WithDetail($"This collection has no Kanban configuration. Set '{Constants.BoardConfigIdKey}' by choosing one on the Kanban tab of the collection's data type.")
                .Build()),
        };
    }
}
