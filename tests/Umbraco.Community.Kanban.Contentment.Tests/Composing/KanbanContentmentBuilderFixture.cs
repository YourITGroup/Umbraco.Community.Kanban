using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;

namespace Umbraco.Community.Kanban.Contentment.Tests.Composing;

/// <summary>
/// A real <see cref="IUmbracoBuilder" /> with no fakes or mocks — just enough scaffolding (a real
/// <see cref="TypeLoader" /> over this test assembly) to satisfy Umbraco's "primarily for testing"
/// <see cref="UmbracoBuilder" /> constructor, which registers Umbraco's own core services. Mirrors
/// KanbanBuilderFixture in the core test project.
/// </summary>
public static class KanbanContentmentBuilderFixture
{
    public static IUmbracoBuilder CreateUmbracoBuilder()
    {
        var services = new ServiceCollection();

        // UmbracoBuilder's testing constructor does not register logging, and this package's lane
        // source takes an ILogger<>. A real host always has logging, so registering it here keeps the
        // fixture faithful rather than papering over a missing production registration.
        services.AddLogging();

        var config = new ConfigurationBuilder().Build();
        var assemblyProvider = new DefaultUmbracoAssemblyProvider(
            typeof(KanbanContentmentBuilderFixture).Assembly,
            NullLoggerFactory.Instance);
        var typeFinder = new TypeFinder(
            NullLoggerFactory.Instance.CreateLogger<TypeFinder>(),
            assemblyProvider,
            null);
        var typeLoader = new TypeLoader(
            typeFinder,
            NullLoggerFactory.Instance.CreateLogger<TypeLoader>());

        return new UmbracoBuilder(services, config, typeLoader);
    }
}
