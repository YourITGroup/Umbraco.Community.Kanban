using Umbraco.Community.Kanban.Lanes;

namespace Umbraco.Community.Kanban.Models.Api;

public sealed class KanbanLaneModel
{
    public required string Value { get; init; }

    public required string Name { get; init; }

    public string? Colour { get; init; }

    public string? Icon { get; init; }

    public bool IsUnassigned { get; init; }

    public bool AcceptsDrops { get; init; }
}

public sealed class KanbanLanePreviewResponseModel
{
    public KanbanLaneModel[] Lanes { get; init; } = [];

    /// <summary>
    /// Override values that matched no lane. Surfaced so the configuration UI can flag
    /// them rather than silently discarding the editor's styling.
    /// </summary>
    public string[] UnmatchedOverrides { get; init; } = [];

    public static KanbanLanePreviewResponseModel From(KanbanLaneResolution resolution) => new()
    {
        Lanes = resolution.Lanes
            .Select(lane => new KanbanLaneModel
            {
                Value = lane.Value,
                Name = lane.Name,
                Colour = lane.Colour,
                Icon = lane.Icon,
                IsUnassigned = lane.IsUnassigned,
                AcceptsDrops = lane.AcceptsDrops,
            })
            .ToArray(),
        UnmatchedOverrides = resolution.UnmatchedOverrides.Select(x => x.Value).ToArray(),
    };
}
