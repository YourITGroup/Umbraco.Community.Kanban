namespace Umbraco.Community.Kanban.Grouping;

/// <summary>
/// The colour aliases lanes cycle through when nothing supplies one.
/// These mirror the non-legacy entries of the backoffice's own <c>umbracoColors</c>,
/// the palette behind the content type icon colour picker, minus <c>text</c> —
/// which is a text colour rather than a hue.
/// </summary>
public static class KanbanGroupPalette
{
    public static readonly IReadOnlyList<string> Cycle =
    [
        "yellow",
        "pink",
        "blue",
        "light-blue",
        "red",
        "green",
        "brown",
        "grey",
    ];

    /// <summary>The neutral colour used by the unassigned lane.</summary>
    public const string Neutral = "grey";
}
