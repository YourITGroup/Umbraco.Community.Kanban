namespace Umbraco.Community.Kanban.Contentment;

/// <summary>
/// Named <c>ContentmentConstants</c> rather than <c>Constants</c> so it never collides with
/// <see cref="Umbraco.Community.Kanban.Constants" /> in a file that uses both namespaces.
/// </summary>
public static class ContentmentConstants
{
    /// <summary>
    /// The editor alias of Contentment's Data List. Hardcoded because Contentment's own constants
    /// are <c>internal</c> — guarded by a test that reflects theirs, so a rename in a Contentment
    /// upgrade fails the build rather than silently producing empty boards.
    /// </summary>
    public const string DataListEditorAlias = "Umbraco.Community.Contentment.DataList";

    /// <summary>The alias a board configuration uses to pin this lane source explicitly.</summary>
    public const string LaneSourceAlias = "contentment-data-list";
}
