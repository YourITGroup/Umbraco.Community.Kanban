using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.Kanban.Contentment.Extensions;
using Umbraco.Community.Kanban.Contentment.Tests.Fakes;
using Umbraco.Community.Kanban.Grouping;
using Umbraco.Community.Kanban.Grouping.Sources;

namespace Umbraco.Community.Kanban.Contentment.Tests.Composing;

public class RegistrationTests
{
    [Fact]
    public void AddKanbanContentment_RegistersTheItemsSeam()
    {
        // Asserted as a registration rather than resolved: ContentmentDataListItems depends on
        // Contentment's ConfigurationEditorUtility, which only exists once Contentment's own
        // composer has run — infrastructure this test project deliberately does not stand up.
        IUmbracoBuilder builder = KanbanContentmentBuilderFixture.CreateUmbracoBuilder();

        builder.AddKanbanContentment();

        builder.Services.Should().ContainSingle(d =>
            d.ServiceType == typeof(IContentmentDataListItems) &&
            d.ImplementationType == typeof(ContentmentDataListItems) &&
            d.Lifetime == ServiceLifetime.Singleton);
    }

    [Fact]
    public void AddKanbanContentment_AppendsTheLaneSource_AndKeepsTheBuiltInOnes()
    {
        // Exercises the real composition path, so dropping the .Append<>() call fails here. The seam
        // is swapped for a fake first, purely so the collection can be constructed at all — see the
        // test above for the registration it replaces.
        IUmbracoBuilder builder = KanbanContentmentBuilderFixture.CreateUmbracoBuilder();

        builder.AddKanbanContentment();

        builder.Services.RemoveAll<IContentmentDataListItems>();
        builder.Services.AddSingleton<IContentmentDataListItems>(new FakeContentmentDataListItems());

        // Likewise for the core package's content-instance seam, whose real implementation needs an
        // IContentService this project does not stand up either.
        builder.Services.RemoveAll<IKanbanContentInstanceLookup>();
        builder.Services.AddSingleton<IKanbanContentInstanceLookup>(new FakeKanbanContentInstanceLookup());

        builder.Build();

        using ServiceProvider provider = builder.Services.BuildServiceProvider();
        var sources = provider.GetRequiredService<KanbanGroupSourceCollection>();

        // Manual stays first so a pinned manual configuration is found before any source claims
        // the editor.
        sources.First().Should().BeOfType<ManualGroupSource>();
        sources.Should().ContainSingle(x => x is CoreListEditorGroupSource);
        sources.Should().ContainSingle(x => x is ContentmentDataListGroupSource);
    }

    [Fact]
    public void AddKanbanContentment_IsSafeToCallTwice()
    {
        IUmbracoBuilder builder = KanbanContentmentBuilderFixture.CreateUmbracoBuilder();

        builder.AddKanbanContentment();
        builder.AddKanbanContentment();

        builder.Services.Should().ContainSingle(d => d.ServiceType == typeof(IContentmentDataListItems));
    }
}
