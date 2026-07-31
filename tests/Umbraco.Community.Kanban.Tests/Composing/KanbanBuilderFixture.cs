using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.Kanban.Extensions;

namespace Umbraco.Community.Kanban.Tests.Composing;

/// <summary>
/// Shared scaffolding for composition tests that need a real <see cref="IUmbracoBuilder"/>
/// with <c>AddKanban()</c> already applied, with no fakes or mocks — just enough
/// infrastructure (a real <see cref="TypeLoader"/> over this test assembly) to satisfy
/// Umbraco's "primarily for testing" <see cref="UmbracoBuilder"/> constructor. Umbraco
/// registers its own core services through this constructor, so <c>AddKanban()</c> runs
/// against the same DI surface it would in production.
/// </summary>
public static class KanbanBuilderFixture
{
    /// <summary>
    /// Builds an <see cref="IUmbracoBuilder"/>, calls <c>AddKanban()</c> on it, and returns
    /// the resulting <see cref="IServiceCollection"/>.
    /// </summary>
    public static IServiceCollection BuildServices()
    {
        IUmbracoBuilder builder = CreateUmbracoBuilder();

        builder.AddKanban();

        return builder.Services;
    }

    /// <summary>
    /// Builds a real <see cref="IUmbracoBuilder"/> using Umbraco's own "primarily for testing"
    /// constructor, with no fakes or mocks — just enough scaffolding (a real <see cref="TypeLoader"/>
    /// over this test assembly) to satisfy the constructor. <see cref="UmbracoBuilder"/> registers
    /// Umbraco's core services itself, so code under test runs against the same DI surface it
    /// would in production.
    /// </summary>
    public static IUmbracoBuilder CreateUmbracoBuilder()
    {
        var services = new ServiceCollection();

        // UmbracoBuilder's testing constructor does not register logging, and ContentInstanceGroupSource
        // takes an ILogger<>. A real host always has logging, so registering it here keeps the fixture
        // faithful rather than papering over a missing production registration.
        services.AddLogging();

        var config = new ConfigurationBuilder().Build();

        var assemblyProvider = new DefaultUmbracoAssemblyProvider(typeof(KanbanBuilderFixture).Assembly, NullLoggerFactory.Instance);
        var typeFinder = new TypeFinder(NullLoggerFactory.Instance.CreateLogger<TypeFinder>(), assemblyProvider, null);
        var typeLoader = new TypeLoader(typeFinder, NullLoggerFactory.Instance.CreateLogger<TypeLoader>());

        return new UmbracoBuilder(services, config, typeLoader);
    }
}
