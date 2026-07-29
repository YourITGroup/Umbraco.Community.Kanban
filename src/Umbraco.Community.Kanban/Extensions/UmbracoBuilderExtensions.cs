using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.Kanban.Configuration;
using Umbraco.Community.Kanban.Lanes;
using Umbraco.Community.Kanban.Lanes.Sources;
using Umbraco.Community.Kanban.Services;

namespace Umbraco.Community.Kanban.Extensions;

public static class UmbracoBuilderExtensions
{
    /// <summary>
    /// Registers everything the Kanban package needs. Safe to call more than once.
    /// </summary>
    public static IUmbracoBuilder AddKanban(this IUmbracoBuilder builder)
    {
        if (builder.Services.Any(x => x.ServiceType == typeof(IKanbanLaneResolver)))
        {
            return builder;
        }

        builder.AddKanbanOpenApiDocument();

        builder.Services.AddSingleton<IKanbanPropertyDataTypeLookup, KanbanPropertyDataTypeLookup>();
        builder.Services.AddSingleton<IKanbanLaneResolver, KanbanLaneResolver>();
        builder.Services.AddSingleton<IKanbanConfigurationService, KanbanConfigurationService>();
        builder.Services.AddSingleton<IKanbanContentTypeLookup, KanbanContentTypeLookup>();
        builder.Services.AddSingleton<IKanbanLaneContentTypeResolver, KanbanLaneContentTypeResolver>();
        builder.Services.AddSingleton<IKanbanDataTypeConfigurationLookup, KanbanDataTypeConfigurationLookup>();
        builder.Services.AddSingleton<IKanbanBoardConfigurationResolver, KanbanBoardConfigurationResolver>();
        builder.Services.AddSingleton<IKanbanContentLoader, KanbanContentLoader>();
        builder.Services.AddSingleton<IKanbanPropertyValueReader, KanbanPropertyValueReader>();
        builder.Services.AddSingleton<IKanbanBoardService, KanbanBoardService>();

        // Manual is appended first so a configuration that pins it wins over an
        // editor-matching source.
        builder.KanbanLaneSources()
            .Append<ManualLaneSource>()
            .Append<CoreListEditorLaneSource>();

        return builder;
    }

    /// <summary>
    /// The lane source collection, for packages adding their own sources.
    /// </summary>
    public static KanbanLaneSourceCollectionBuilder KanbanLaneSources(this IUmbracoBuilder builder) =>
        builder.WithCollectionBuilder<KanbanLaneSourceCollectionBuilder>();
}
