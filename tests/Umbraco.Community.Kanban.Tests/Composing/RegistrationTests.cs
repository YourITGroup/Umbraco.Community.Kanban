using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.Kanban.Controllers;
using Umbraco.Community.Kanban.Extensions;
using Umbraco.Community.Kanban.Grouping;
using Umbraco.Community.Kanban.Grouping.Sources;

namespace Umbraco.Community.Kanban.Tests.Composing;

public class RegistrationTests
{
    [Fact]
    public void AddKanban_RegistersTheBuiltInSources_ManualFirst()
    {
        // Exercises the real composition path — builder.AddKanban() — rather than
        // constructing a KanbanGroupSourceCollection by hand, so a regression that
        // reorders or drops the .Append<>() calls in AddKanban() would fail this test.
        // Manual must come first so a pinned manual configuration is found before
        // a built-in source claims the editor.
        IUmbracoBuilder builder = KanbanBuilderFixture.CreateUmbracoBuilder();

        builder.AddKanban();
        builder.Build();

        using ServiceProvider provider = builder.Services.BuildServiceProvider();
        var sources = provider.GetRequiredService<KanbanGroupSourceCollection>();

        sources.First().Should().BeOfType<ManualGroupSource>();
        sources.Should().ContainSingle(x => x is CoreListEditorGroupSource);
    }

    [Fact]
    public void AddKanban_RegistersTheLaneResolverAndPropertyDataTypeLookup()
    {
        // AddKanban() registers IKanbanGroupResolver -> KanbanGroupResolver and
        // IKanbanPropertyDataTypeLookup -> KanbanPropertyDataTypeLookup. We assert the
        // registrations rather than resolving instances: KanbanPropertyDataTypeLookup
        // depends on IContentTypeService/IDataTypeService, whose own dependencies
        // (repositories, scope providers, persistence) are wired by Umbraco's full
        // composition — infrastructure this test project deliberately does not stand
        // up (see the Fakes/ directory: resolver tests use hand-written fakes for
        // exactly this reason). Asserting the registration still fails the test if
        // AddKanban() stops registering either service.
        IUmbracoBuilder builder = KanbanBuilderFixture.CreateUmbracoBuilder();

        builder.AddKanban();

        builder.Services.Should().ContainSingle(d =>
            d.ServiceType == typeof(IKanbanGroupResolver) &&
            d.ImplementationType == typeof(KanbanGroupResolver) &&
            d.Lifetime == ServiceLifetime.Singleton);

        builder.Services.Should().ContainSingle(d =>
            d.ServiceType == typeof(IKanbanPropertyDataTypeLookup) &&
            d.ImplementationType == typeof(KanbanPropertyDataTypeLookup) &&
            d.Lifetime == ServiceLifetime.Singleton);
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
