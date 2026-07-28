using Umbraco.Community.Kanban.Models;
using Umbraco.Community.Kanban.Services;
using Umbraco.Community.Kanban.Tests.Fakes;

namespace Umbraco.Community.Kanban.Tests.Services;

public class KanbanBoardConfigurationResolverTests
{
    private static readonly Guid ListView = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid BoardConfig = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static (KanbanBoardConfigurationResolver Resolver,
        FakeKanbanDataTypeConfigurationLookup DataTypes,
        FakeKanbanConfigurationService Configurations) Subject()
    {
        var dataTypes = new FakeKanbanDataTypeConfigurationLookup();
        var configurations = new FakeKanbanConfigurationService();
        return (new KanbanBoardConfigurationResolver(dataTypes, configurations), dataTypes, configurations);
    }

    [Fact]
    public async Task Uses_an_explicit_config_id_without_touching_the_list_view()
    {
        (KanbanBoardConfigurationResolver resolver, FakeKanbanDataTypeConfigurationLookup dataTypes,
            FakeKanbanConfigurationService configurations) = Subject();
        var configuration = new KanbanBoardConfiguration { LaneProperty = "status" };
        configurations.BoardConfigurations[BoardConfig] = configuration;

        KanbanBoardConfigurationResult result = await resolver.ResolveAsync(BoardConfig, ListView);

        result.Status.Should().Be(KanbanBoardConfigurationStatus.Success);
        result.ConfigurationKey.Should().Be(BoardConfig);
        result.Configuration.Should().BeSameAs(configuration);
        dataTypes.Values.Should().BeEmpty("nothing should have been read from the list view");
    }

    [Fact]
    public async Task Reports_not_found_when_an_explicit_config_id_is_not_a_board()
    {
        (KanbanBoardConfigurationResolver resolver, _, _) = Subject();

        KanbanBoardConfigurationResult result = await resolver.ResolveAsync(BoardConfig, ListView);

        result.Status.Should().Be(KanbanBoardConfigurationStatus.ConfigurationNotFound);
        result.ConfigurationKey.Should().Be(BoardConfig);
        result.Configuration.Should().BeNull();
    }

    [Fact]
    public async Task Resolves_through_the_list_view_when_no_config_id_is_given()
    {
        (KanbanBoardConfigurationResolver resolver, FakeKanbanDataTypeConfigurationLookup dataTypes,
            FakeKanbanConfigurationService configurations) = Subject();
        dataTypes.Values[(ListView, Constants.BoardConfigIdKey)] = BoardConfig;
        var configuration = new KanbanBoardConfiguration();
        configurations.BoardConfigurations[BoardConfig] = configuration;

        KanbanBoardConfigurationResult result = await resolver.ResolveAsync(null, ListView);

        result.Status.Should().Be(KanbanBoardConfigurationStatus.Success);
        result.ConfigurationKey.Should().Be(BoardConfig);
        result.Configuration.Should().BeSameAs(configuration);
    }

    [Fact]
    public async Task Reports_not_configured_when_the_content_type_has_no_list_view()
    {
        (KanbanBoardConfigurationResolver resolver, _, _) = Subject();

        (await resolver.ResolveAsync(null, null)).Status
            .Should().Be(KanbanBoardConfigurationStatus.NotConfigured);
    }

    [Fact]
    public async Task Reports_not_configured_when_the_list_view_names_no_board()
    {
        (KanbanBoardConfigurationResolver resolver, _, _) = Subject();

        (await resolver.ResolveAsync(null, ListView)).Status
            .Should().Be(KanbanBoardConfigurationStatus.NotConfigured);
    }

    [Fact]
    public async Task Reports_not_found_when_the_named_board_has_been_deleted()
    {
        (KanbanBoardConfigurationResolver resolver, FakeKanbanDataTypeConfigurationLookup dataTypes, _) = Subject();
        dataTypes.Values[(ListView, Constants.BoardConfigIdKey)] = BoardConfig;

        KanbanBoardConfigurationResult result = await resolver.ResolveAsync(null, ListView);

        result.Status.Should().Be(KanbanBoardConfigurationStatus.ConfigurationNotFound);
        result.ConfigurationKey.Should().Be(BoardConfig);
    }
}
