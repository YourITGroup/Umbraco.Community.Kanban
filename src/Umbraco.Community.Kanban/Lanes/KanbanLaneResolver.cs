using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Lanes;

/// <inheritdoc />
public sealed class KanbanLaneResolver(
    IKanbanPropertyDataTypeLookup lookup,
    KanbanLaneSourceCollection sources) : IKanbanLaneResolver
{
    public async Task<KanbanLaneResolution> ResolveAsync(Guid contentTypeKey, KanbanBoardConfiguration configuration)
    {
        var lanes = await GetLanesAsync(contentTypeKey, configuration);

        var unmatched = KanbanLaneOverrideApplier.Apply(lanes, configuration.LaneOverrides);
        lanes.Add(KanbanLane.Unassigned());
        KanbanLaneColourAssigner.Assign(lanes);

        return new KanbanLaneResolution(lanes, unmatched);
    }

    private async Task<List<KanbanLane>> GetLanesAsync(Guid contentTypeKey, KanbanBoardConfiguration configuration)
    {
        if (string.IsNullOrWhiteSpace(configuration.LaneProperty))
        {
            // A manual board does not need a lane property to produce lanes.
            var manualOnly = BuildContext(string.Empty, new Dictionary<string, object>(), configuration);
            return await ResolveFromSourcesAsync(manualOnly);
        }

        var dataType = await lookup.GetAsync(contentTypeKey, configuration.LaneProperty);
        if (dataType is null)
        {
            return [];
        }

        var context = BuildContext(dataType.EditorAlias, dataType.ConfigurationData, configuration);
        return await ResolveFromSourcesAsync(context);
    }

    private async Task<List<KanbanLane>> ResolveFromSourcesAsync(KanbanLaneSourceContext context)
    {
        var source = SelectSource(context);
        if (source is null)
        {
            return [];
        }

        var lanes = await source.GetLanesAsync(context);
        return lanes.ToList();
    }

    private IKanbanLaneSource? SelectSource(KanbanLaneSourceContext context)
    {
        // An explicitly pinned source wins, so an editor can force manual lanes
        // over an editor a built-in source would otherwise claim.
        if (string.IsNullOrWhiteSpace(context.Configuration.LaneSource) == false)
        {
            var pinned = sources.FirstOrDefault(x =>
                string.Equals(x.Alias, context.Configuration.LaneSource, StringComparison.OrdinalIgnoreCase));

            if (pinned is not null && pinned.CanHandle(context))
            {
                return pinned;
            }
        }

        return sources.FirstOrDefault(x => x.CanHandle(context));
    }

    private static KanbanLaneSourceContext BuildContext(
        string editorAlias,
        IDictionary<string, object> configurationData,
        KanbanBoardConfiguration configuration) =>
        new(editorAlias, configurationData, configuration);
}
