using Umbraco.Cms.Web.Common.Routing;

namespace Umbraco.Community.Kanban.Attributes;

/// <summary>
/// Routes a controller under the package's versioned Management API path.
/// </summary>
public sealed class KanbanVersionedRouteAttribute(string template)
    : BackOfficeRouteAttribute($"{Constants.ManagementApiPath.TrimStart('/')}/v{{version:apiVersion}}/{template.TrimStart('/')}");
