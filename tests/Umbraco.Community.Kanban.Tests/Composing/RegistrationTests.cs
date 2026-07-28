using Umbraco.Community.Kanban.Controllers;
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Lanes.Sources;

namespace Umbraco.Community.Kanban.Tests.Composing;

public class RegistrationTests
{
    [Fact]
    public void TheBuiltInSources_AreOrderedManualFirst()
    {
        // Manual must come first so a pinned manual configuration is found before
        // a built-in source claims the editor.
        var collection = new KanbanLaneSourceCollection(() =>
            [new ManualLaneSource(), new CoreListEditorLaneSource()]);

        collection.First().Should().BeOfType<ManualLaneSource>();
    }

    [Fact]
    public void ControllerBase_IsRoutedUnderTheKanbanApiPath()
    {
        var route = typeof(KanbanControllerBase)
            .GetCustomAttributes(typeof(Umbraco.Cms.Web.Common.Routing.BackOfficeRouteAttribute), true)
            .Cast<Umbraco.Cms.Web.Common.Routing.BackOfficeRouteAttribute>()
            .Single();

        // BackOfficeRouteAttribute derives from RouteAttribute and prefixes the backoffice token,
        // which is substituted with the configured Umbraco path at routing time.
        // Note: Umbraco.Cms.Core.Constants.Web.AttributeRouting.BackOfficeToken is actually
        // "umbracoBackOffice" (capital "O" in "Office"), not "umbracoBackoffice" as the brief's
        // literal assumed — see task-11 report for the discrepancy.
        route.Template.Should().Be("[umbracoBackOffice]/kanban/api/v{version:apiVersion}/");
    }
}
