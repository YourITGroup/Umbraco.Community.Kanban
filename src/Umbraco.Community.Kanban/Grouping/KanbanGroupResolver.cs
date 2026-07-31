using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.Grouping;

/// <inheritdoc />
public sealed class KanbanGroupResolver(
    IKanbanPropertyDataTypeLookup lookup,
    KanbanGroupSourceCollection sources) : IKanbanGroupResolver
{
    public async Task<KanbanGroupResolution> ResolveAsync(Guid contentTypeKey, KanbanBoardConfiguration configuration)
    {
        var (lanes, mandatory) = await GetGroupsAsync(contentTypeKey, configuration);

        // Apply runs before Assign, but under their current semantics the two are commutative:
        // Apply unconditionally overwrites a lane's colour whenever the override supplies one,
        // and Assign only ever fills in a colour that is still blank. Neither collaborator
        // inspects the other's effect, so this order is chosen for clarity (overrides logically
        // precede the palette) rather than enforced by behaviour. If either collaborator's
        // overwrite semantics change — e.g. Assign starts overwriting non-blank colours, or
        // Apply starts respecting an existing colour — this ordering becomes load-bearing again.
        var unmatched = KanbanGroupOverrideApplier.Apply(lanes, configuration.LaneOverrides);

        // Colours are assigned in source order, before the display order is applied, so dragging a
        // lane changes which column it is in and nothing else.
        KanbanGroupColourAssigner.Assign(lanes);

        var ordered = KanbanGroupOrderApplier.Apply(lanes, configuration.LaneOrder).ToList();

        // The unassigned lane leads: cards with no value are usually the ones needing attention, and
        // it is never part of the configured order, having no stored value to order by.
        ordered.Insert(0, KanbanGroup.Unassigned());

        // Only the unassigned lane still needs a colour, and Assign is what knows it is neutral.
        KanbanGroupColourAssigner.Assign(ordered);

        return new KanbanGroupResolution(ordered, unmatched, mandatory);
    }

    /// <summary>
    /// The lanes, plus whether the property they came from is mandatory. Paired rather than looked up
    /// twice because both answers come from the one property/data type read.
    /// </summary>
    private async Task<(List<KanbanGroup> Groups, bool Mandatory)> GetGroupsAsync(
        Guid contentTypeKey,
        KanbanBoardConfiguration configuration)
    {
        if (string.IsNullOrWhiteSpace(configuration.LaneProperty))
        {
            // A manual board does not need a lane property to produce lanes.
            var manualOnly = BuildContext(string.Empty, new Dictionary<string, object>(), configuration);
            return (await ResolveFromSourcesAsync(manualOnly), false);
        }

        var dataType = await lookup.GetAsync(contentTypeKey, configuration.LaneProperty);
        if (dataType is null)
        {
            // The lane property may have been renamed or deleted since the board was configured.
            // Fall through to the same empty context the no-LaneProperty branch uses above: a
            // manual board pinned via LaneSource still resolves to its manual lanes because
            // ManualGroupSource.CanHandle keys off configuration, not editor alias. A non-manual
            // board still collapses to the unassigned lane, since no source claims an empty
            // editor alias.
            // Not mandatory as far as anyone here can tell: there is no property left to ask.
            var staleProperty = BuildContext(string.Empty, new Dictionary<string, object>(), configuration);
            return (await ResolveFromSourcesAsync(staleProperty), false);
        }

        var context = BuildContext(dataType.EditorAlias, dataType.ConfigurationData, configuration);
        return (await ResolveFromSourcesAsync(context), dataType.Mandatory);
    }

    private async Task<List<KanbanGroup>> ResolveFromSourcesAsync(KanbanGroupSourceContext context)
    {
        var source = SelectSource(context);
        if (source is null)
        {
            return [];
        }

        var lanes = await source.GetGroupsAsync(context);
        return lanes.ToList();
    }

    private IKanbanGroupSource? SelectSource(KanbanGroupSourceContext context)
    {
        // An explicitly pinned source wins, so an editor can force manual lanes
        // over an editor a built-in source would otherwise claim.
        var pinnedAlias = context.Configuration.PinnedGroupSource;

        if (string.IsNullOrWhiteSpace(pinnedAlias) == false)
        {
            var pinned = sources.FirstOrDefault(x =>
                string.Equals(x.Alias, pinnedAlias, StringComparison.OrdinalIgnoreCase));

            if (pinned is not null && pinned.CanHandle(context))
            {
                return pinned;
            }
        }

        return sources.FirstOrDefault(x => x.CanHandle(context));
    }

    private static KanbanGroupSourceContext BuildContext(
        string editorAlias,
        IDictionary<string, object> configurationData,
        KanbanBoardConfiguration configuration) =>
        new(editorAlias, configurationData, configuration);
}
