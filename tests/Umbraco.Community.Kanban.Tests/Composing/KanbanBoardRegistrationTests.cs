using Microsoft.Extensions.DependencyInjection;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Tests.Composing;

public class KanbanBoardRegistrationTests
{
    /// <summary>
    /// Every service the board endpoint resolves at request time. An omission here is a
    /// startup crash on a live site, which no other test in this suite would catch.
    /// </summary>
    public static TheoryData<Type, Type> BoardServices => new()
    {
        { typeof(IKanbanContentTypeLookup), typeof(KanbanContentTypeLookup) },
        { typeof(IKanbanLaneContentTypeResolver), typeof(KanbanLaneContentTypeResolver) },
        { typeof(IKanbanDataTypeConfigurationLookup), typeof(KanbanDataTypeConfigurationLookup) },
        { typeof(IKanbanBoardConfigurationResolver), typeof(KanbanBoardConfigurationResolver) },
        { typeof(IKanbanContentLoader), typeof(KanbanContentLoader) },
        { typeof(IKanbanContentWriter), typeof(KanbanContentWriter) },
        { typeof(IKanbanPropertyValueReader), typeof(KanbanPropertyValueReader) },
        { typeof(IKanbanBoardService), typeof(KanbanBoardService) },
        { typeof(IKanbanCardService), typeof(KanbanCardService) },
    };

    [Theory]
    [MemberData(nameof(BoardServices))]
    public void AddKanban_registers_the_board_services(Type serviceType, Type implementationType)
    {
        IServiceCollection services = KanbanBuilderFixture.BuildServices();

        ServiceDescriptor descriptor = services.Should()
            .ContainSingle(service => service.ServiceType == serviceType)
            .Subject;

        descriptor.ImplementationType.Should().Be(implementationType);
        descriptor.Lifetime.Should().Be(ServiceLifetime.Singleton);
    }
}
