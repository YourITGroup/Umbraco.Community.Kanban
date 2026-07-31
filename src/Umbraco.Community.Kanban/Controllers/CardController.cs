using Asp.Versioning;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Common.Builders;
using Umbraco.Cms.Core.Security;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Controllers;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = "Card")]
public sealed class CardController(
    IKanbanCardService cardService,
    IBackOfficeSecurityAccessor backOfficeSecurityAccessor) : KanbanControllerBase
{
    /// <summary>
    /// Moves a card to a lane, writing its board's lane property. Saves, never publishes — a drag stays
    /// reversible until an editor publishes it.
    /// </summary>
    [HttpPut("card/{key:guid}/lane")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(KanbanCardLaneResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetLane(Guid key, KanbanCardLaneRequestModel request)
    {
        KanbanCardLaneResult result = await cardService.SetLaneAsync(
            new KanbanCardLaneRequest(key, request.LaneValue, request.Culture),
            CurrentUser(backOfficeSecurityAccessor));

        return result.Status switch
        {
            KanbanCardLaneStatus.Success => Ok(new KanbanCardLaneResponseModel { State = result.State! }),
            KanbanCardLaneStatus.CardNotFound => NotFound(),
            KanbanCardLaneStatus.AccessDenied => Forbidden(),
            KanbanCardLaneStatus.DragNotAllowed => BadRequest(new ProblemDetailsBuilder()
                .WithTitle("Dragging is disabled")
                .WithDetail("This board's Kanban configuration does not allow cards to be moved between lanes.")
                .Build()),
            KanbanCardLaneStatus.ConfigurationNotFound => BadRequest(new ProblemDetailsBuilder()
                .WithTitle("Kanban configuration not found")
                .WithDetail("The Kanban configuration this collection points at no longer exists. Choose one on the Kanban tab of the collection's data type.")
                .Build()),
            KanbanCardLaneStatus.SaveFailed => BadRequest(new ProblemDetailsBuilder()
                .WithTitle("The card could not be saved")
                .WithDetail("The lane property is not on this document, or the save was refused.")
                .Build()),
            _ => BadRequest(new ProblemDetailsBuilder()
                .WithTitle("No Kanban configuration")
                .WithDetail($"This card's collection has no usable Kanban configuration. Set '{Constants.BoardConfigIdKey}' and a lane property on the Kanban tab of the collection's data type.")
                .Build()),
        };
    }

    /// <summary>
    /// One card, for real-time reconciliation: a server event says a document changed, and this says
    /// what it is on this board now. isChild false means "remove it if you are showing it".
    /// </summary>
    [HttpGet("card/{key:guid}")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(KanbanCardResponseModel), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetCard(Guid key, [FromQuery] KanbanCardRequestModel request)
    {
        KanbanCardResult result = await cardService.GetCardAsync(
            new KanbanCardRequest(key, request.ParentId, request.ConfigId, request.Culture),
            CurrentUser(backOfficeSecurityAccessor));

        return result.Status switch
        {
            KanbanCardStatus.Success => Ok(new KanbanCardResponseModel
            {
                IsChild = true,
                LaneValue = result.LaneValue,
                Card = result.Card,
            }),
            KanbanCardStatus.NotChild => Ok(new KanbanCardResponseModel { IsChild = false }),
            KanbanCardStatus.CardNotFound => NotFound(),
            KanbanCardStatus.ParentNotFound => NotFound(),
            KanbanCardStatus.ParentAccessDenied => Forbidden(),
            KanbanCardStatus.ConfigurationNotFound => BadRequest(new ProblemDetailsBuilder()
                .WithTitle("Kanban configuration not found")
                .WithDetail("The Kanban configuration this collection points at no longer exists. Choose one on the Kanban tab of the collection's data type.")
                .Build()),
            _ => BadRequest(new ProblemDetailsBuilder()
                .WithTitle("No Kanban configuration")
                .WithDetail($"This card's collection has no usable Kanban configuration. Set '{Constants.BoardConfigIdKey}' and a lane property on the Kanban tab of the collection's data type.")
                .Build()),
        };
    }
}
