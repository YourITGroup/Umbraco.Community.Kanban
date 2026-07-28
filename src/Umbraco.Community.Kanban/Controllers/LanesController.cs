using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Models.Api;

namespace Umbraco.Community.Kanban.Controllers;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = "Lanes")]
public sealed class LanesController(IKanbanLaneResolver laneResolver) : KanbanControllerBase
{
    /// <summary>
    /// Resolves the lanes a configuration would produce, without requiring it to be saved.
    /// Used by the lane override editor. Requires Settings access, because it is only
    /// reachable from the data type editor.
    /// </summary>
    [HttpPost("lanes/preview")]
    [MapToApiVersion("1.0")]
    [Authorize(Policy = AuthorizationPolicies.SectionAccessSettings)]
    [ProducesResponseType(typeof(KanbanLanePreviewResponseModel), StatusCodes.Status200OK)]
    public async Task<IActionResult> Preview(KanbanLanePreviewRequestModel request)
    {
        var resolution = await laneResolver.ResolveAsync(request.ContentTypeKey, request.Configuration);

        return Ok(KanbanLanePreviewResponseModel.From(resolution));
    }
}
