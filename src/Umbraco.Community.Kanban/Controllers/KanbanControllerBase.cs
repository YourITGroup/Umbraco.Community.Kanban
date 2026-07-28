using Microsoft.AspNetCore.Authorization;
using Umbraco.Cms.Api.Common.Attributes;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Community.Kanban.Attributes;

namespace Umbraco.Community.Kanban.Controllers;

/// <summary>
/// Base for every Kanban Management API controller. Requires backoffice access;
/// individual endpoints tighten this where they need more.
/// </summary>
[Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
[KanbanVersionedRoute("")]
[MapToApi(Constants.ApiName)]
public abstract class KanbanControllerBase : ManagementApiControllerBase;
