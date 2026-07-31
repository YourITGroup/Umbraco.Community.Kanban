using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.Kanban.Configuration;
using Umbraco.Community.Kanban.Grouping;
using Umbraco.Community.Kanban.Grouping.Sources;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Extensions;

public static class UmbracoBuilderExtensions
{
    /// <summary>
    /// Registers everything the Kanban package needs. Safe to call more than once.
    /// </summary>
    public static IUmbracoBuilder AddKanban(this IUmbracoBuilder builder)
    {
        if (builder.Services.Any(x => x.ServiceType == typeof(IKanbanGroupResolver)))
        {
            return builder;
        }

        builder.AddKanbanOpenApiDocument();

        builder.Services.AddSingleton<IKanbanPropertyDataTypeLookup, KanbanPropertyDataTypeLookup>();
        builder.Services.AddSingleton<IKanbanGroupResolver, KanbanGroupResolver>();
        builder.Services.AddSingleton<IKanbanConfigurationService, KanbanConfigurationService>();
        builder.Services.AddSingleton<IKanbanContentTypeLookup, KanbanContentTypeLookup>();
        builder.Services.AddSingleton<IKanbanLaneContentTypeResolver, KanbanLaneContentTypeResolver>();
        builder.Services.AddSingleton<IKanbanDataTypeConfigurationLookup, KanbanDataTypeConfigurationLookup>();
        builder.Services.AddSingleton<IKanbanBoardConfigurationResolver, KanbanBoardConfigurationResolver>();
        builder.Services.AddSingleton<IKanbanContentLoader, KanbanContentLoader>();
        builder.Services.AddSingleton<IKanbanContentWriter, KanbanContentWriter>();
        builder.Services.AddSingleton<IKanbanPropertyValueReader, KanbanPropertyValueReader>();
        builder.Services.AddSingleton<IKanbanBoardService, KanbanBoardService>();
        builder.Services.AddSingleton<IKanbanCardService, KanbanCardService>();
        builder.Services.AddSingleton<IKanbanCalendarConfigurationResolver, KanbanCalendarConfigurationResolver>();
        builder.Services.AddSingleton<IKanbanCalendarService, KanbanCalendarService>();

        // Manual is appended first so a configuration that pins it wins over an
        // editor-matching source.
        builder.KanbanGroupSources()
            .Append<ManualGroupSource>()
            .Append<CoreListEditorGroupSource>();

        return builder;
    }

    /// <summary>
    /// The group source collection, for packages adding their own sources.
    /// </summary>
    public static KanbanGroupSourceCollectionBuilder KanbanGroupSources(this IUmbracoBuilder builder) =>
        builder.WithCollectionBuilder<KanbanGroupSourceCollectionBuilder>();
}
