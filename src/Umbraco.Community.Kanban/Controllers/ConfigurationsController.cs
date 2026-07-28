using Asp.Versioning;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Community.Kanban.Models.Api;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Controllers;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = "Configurations")]
public sealed class ConfigurationsController(IKanbanConfigurationService configurationService)
    : KanbanControllerBase
{
    /// <summary>
    /// Lists every Kanban configuration. Called by the backoffice entry point on startup,
    /// so it is available to any backoffice user rather than Settings users only.
    /// </summary>
    [HttpGet("configurations")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(IEnumerable<KanbanConfigurationResponseModel>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll() => Ok(await configurationService.GetAllAsync());
}
