using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.Kanban.Services;

/// <summary>
/// Maps a board's sort settings — for cards and for child items alike, both stored the same way —
/// onto an Umbraco <see cref="Ordering" />. Pure, so the mapping is tested without a database.
/// </summary>
/// <remarks>
/// Settings are stored as strings rather than an enum, like every other Board setting, which means
/// anything unrecognised — a hand-edited configuration, a value from a future version — must degrade
/// rather than fail. Sort order ascending is the fallback because it is what Umbraco itself lists
/// children by.
/// </remarks>
public static class KanbanChildOrdering
{
    public const string SortOrderField = "sortOrder";
    public const string NameField = "name";
    public const string UpdateDateField = "updateDate";
    public const string CreateDateField = "createDate";

    public const string Ascending = "asc";
    public const string Descending = "desc";

    public static Ordering From(string? sortBy, string? direction, string? culture)
    {
        var field = Field(sortBy);
        Direction sortDirection = IsDescending(direction) ? Direction.Descending : Direction.Ascending;

        // Only a name is stored per culture; ordering any other field by culture would carry a culture
        // that changes nothing.
        return field == NameField
            ? Ordering.By(field, sortDirection, culture)
            : Ordering.By(field, sortDirection);
    }

    private static string Field(string? sortBy) => sortBy?.Trim().ToLowerInvariant() switch
    {
        "name" => NameField,
        "updatedate" => UpdateDateField,
        "createdate" => CreateDateField,
        _ => SortOrderField,
    };

    private static bool IsDescending(string? direction) =>
        string.Equals(direction?.Trim(), Descending, StringComparison.OrdinalIgnoreCase);
}
