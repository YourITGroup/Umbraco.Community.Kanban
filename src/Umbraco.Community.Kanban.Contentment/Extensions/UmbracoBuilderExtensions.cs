using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Community.Kanban.Extensions;

namespace Umbraco.Community.Kanban.Contentment.Extensions;

public static class UmbracoBuilderExtensions
{
    /// <summary>
    /// Registers the Contentment Data List lane source. Safe to call more than once.
    /// </summary>
    public static IUmbracoBuilder AddKanbanContentment(this IUmbracoBuilder builder)
    {
        if (builder.Services.Any(x => x.ServiceType == typeof(IContentmentDataListItems)))
        {
            return builder;
        }

        // Idempotent, and this package is useless without it — so it does not matter whether the
        // core composer has run yet.
        builder.AddKanban();

        builder.Services.AddSingleton<IContentmentDataListItems, ContentmentDataListItems>();

        // Appended last, which is safe: no built-in source claims the Data List alias, and a
        // configuration pinning "manual" still wins through KanbanBoardConfiguration.PinnedLaneSource.
        builder.KanbanLaneSources().Append<ContentmentDataListLaneSource>();

        return builder;
    }
}
